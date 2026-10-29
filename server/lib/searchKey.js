// server/lib/searchKey.js
//
// ONE SPELLING FOR "रसोई", "rasoi" AND "rasoee".
//
// The founder: "rasoi" should find रसोई Ghar, and "चाय" should find chai
// shops. A shop's name and its items are written in whatever alphabet
// their owner chose; the person searching types in whatever alphabet their
// phone has. This turns both into the same loose Latin key so either finds
// the other.
//
// Two steps:
//
//   1. romanize — Devanagari to plain Latin letters, letter by letter. No
//      attempt at "correct" Hindi transliteration (schwa deletion and the
//      rest): step 2 throws away exactly the parts those rules argue about.
//   2. looseKey — the Latin, with the spellings people disagree about
//      folded together: long and short vowels (aa/a, ee/ii/i, oo/uu/u),
//      doubled letters, ph/f, w/v, z/j, q/k, a final y as i — and every
//      'a' after the first letter dropped, because the inherent vowel is
//      precisely what nobody writes the same way twice ("ghar" / "ghr",
//      "dhaba" / "dhaabaa").
//
// So: रसोई → "rasoii" → "rsoi"; "rasoi" → "rsoi"; "rasoee" → "rsoi".
// चाय → "chaay" → "chi"; "chai" → "chi". बत्ती → "battii" → "bti";
// "batti" → "bti".
//
// Keys are per WORD and matched as prefixes, so "ras" finds रसोई and "sam"
// finds समोसा — the same start-of-word search the names already had.

var DEVANAGARI_CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh',
  'स': 's', 'ह': 'h', 'ळ': 'l',
  // Precomposed nukta letters.
  'क़': 'k', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'j', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y'
};

var DEVANAGARI_VOWELS = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ii', 'उ': 'u', 'ऊ': 'uu', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e'
};

var DEVANAGARI_SIGNS = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e'
};

var DEVANAGARI_VIRAMA = '्';
var DEVANAGARI_NUKTA = '़';

function romanize(text) {
  const chars = Array.from(String(text || '').normalize('NFC'));
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === DEVANAGARI_NUKTA) continue;
    const con = DEVANAGARI_CONSONANTS[c];
    if (con !== undefined) {
      let next = chars[i + 1];
      if (next === DEVANAGARI_NUKTA) next = chars[i + 2];
      out += con;
      // The inherent vowel, unless a sign or a virama replaces it.
      if (next === DEVANAGARI_VIRAMA || DEVANAGARI_SIGNS[next] !== undefined) continue;
      // A word's last consonant is said without its 'a' (घर is "ghar",
      // not "ghara"), so it is not written either.
      const wordGoesOn = next !== undefined && /[\u0900-\u097F]/.test(next) && next !== 'ं' && next !== 'ँ' && next !== 'ः';
      if (!wordGoesOn) continue;
      out += 'a';
      continue;
    }
    if (DEVANAGARI_SIGNS[c] !== undefined) { out += DEVANAGARI_SIGNS[c]; continue; }
    if (DEVANAGARI_VOWELS[c] !== undefined) { out += DEVANAGARI_VOWELS[c]; continue; }
    if (c === DEVANAGARI_VIRAMA) continue;
    if (c === 'ं' || c === 'ँ') { out += 'n'; continue; }
    if (c === 'ः') { out += 'h'; continue; }
    out += c;
  }
  return out;
}

function looseKey(word) {
  let s = romanize(word).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) return '';
  s = s
    .replace(/au/g, 'o').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k').replace(/ck/g, 'k')
    .replace(/(ee|ii|ie|ey)/g, 'i').replace(/(oo|uu|ou)/g, 'u').replace(/aa/g, 'a')
    .replace(/y$/, 'i');
  // Doubled letters: "batti" / "bati", "chappal" / "chapal".
  s = s.replace(/([a-z])\1+/g, '$1');
  // Every 'a' after the first letter.
  s = s[0] + s.slice(1).replace(/a/g, '');
  return s.replace(/([a-z])\1+/g, '$1');
}

// "रसोई Ghar" → "rsoi ghr". Space-separated so a prefix can be matched at
// the start of any word.
function searchKeyOf(text) {
  return String(text || '').split(/[\s.,/·|&()+-]+/u).map(looseKey).filter(Boolean).join(' ').slice(0, 300);
}

// A typed query as keys, ready to match: "rasoi gh" → ["rsoi", "gh"].
function searchKeyQuery(q) {
  return String(q || '').split(/[\s.,/·|&()+-]+/u).map(looseKey).filter(Boolean).slice(0, 4);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A regex that matches a stored key when the typed words appear, in order,
// each at the start of a word: ["rsoi","gh"] matches "rsoi ghr".
function searchKeyRegex(keys) {
  if (!keys.length) return null;
  return new RegExp(`(^| )${keys.map(escapeRegex).join('[a-z0-9]* (?:[a-z0-9]* )*')}`);
}

module.exports = { romanize, looseKey, searchKeyOf, searchKeyQuery, searchKeyRegex };
