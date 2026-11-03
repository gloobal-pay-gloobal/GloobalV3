// src/features/support/askEngine.js
//
// ── ASK GLOOBAL: FINDING THE ANSWER, ON THE PHONE (0223) ──────────────────
//
// No AI service, no server round trip: the guide's cards are already on the
// phone, and this file finds the one a question is about. Plain functions
// only, so the tests run it in Node against the real guide.
//
//   1. Which language — by the letters (देवनागरी → Hindi, தமிழ் → Tamil);
//      Latin letters are Hinglish when Hindi words show up ("paise kaise").
//   2. Tidy the words — spellings people use for the same word collapse
//      ("wapas"/"vapas", "paisa"/"paise"), filler goes, and words that
//      mean the same thing across languages meet on one key
//      (nikalna = withdraw = निकालना = எடுக்க).
//   3. Score every card: how much of the question each of its "ways of
//      asking" covers, by word (a typo or a different ending still counts)
//      and by letter groups; the screen the question came from adds a little.
//   4. Decide — a clear winner is answered; a close call offers the three
//      nearest; nothing near says so and offers a person.
//
// A question about the person's OWN money ("maine kal Ravi ko 500 bheje")
// is spotted separately: the guide cannot see payments, so it hands over.

var ASK_LANG_CODES = ["en", "hi", "hl", "ta"];

// Words that carry no meaning of their own, in all four languages at once.
var ASK_STOP = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "for", "is", "are", "am", "was", "be", "it", "its", "this", "that",
  "and", "or", "with", "do", "does", "did", "can", "could", "i", "me", "my", "we", "you", "your", "please", "pls", "plz",
  "hai", "hain", "he", "ka", "ke", "ki", "ko", "se", "me", "mein", "mai", "main", "ye", "yeh", "vo", "voh", "aur",
  "bhi", "toh", "to", "ho", "hi", "na", "ji", "jo", "ek", "kuch", "apna", "apne", "apni",
  "है", "हैं", "का", "के", "की", "को", "से", "में", "मैं", "यह", "ये", "वह", "और", "भी", "तो", "हो", "जी", "एक", "अपना", "अपने", "अपनी", "कुछ",
  "ஒரு", "இது", "அது", "மற்றும்", "நான்", "என்", "உங்கள்", "என்னுடைய",
]);

// One key for words that mean the same thing. A word joins a key when it
// starts with one of these (so "bhejna", "bheje", "bhejo" all join "send").
// Written AFTER the spelling tidy below ("aa"→"a", "w"→"v", "z"→"j"…).
var ASK_SYN = [
  ["money", ["money", "paise", "paisa", "pais", "rupay", "rupi", "rupe", "cash", "amount", "amaunt", "rakam", "पैस", "रुपय", "रकम", "पैसा", "பணம", "பணத", "காச", "தொகை"]],
  ["send", ["send", "sent", "sned", "bhej", "भेज", "அனுப்ப", "transfer", "trasfer", "ट्रांसफ", "டிரான்ஸ்ஃப"]],
  ["withdraw", ["vithdra", "vidra", "nikal", "निकाल", "cashout", "payout", "எடுக்க", "எடுப்ப", "எடுக"]],
  ["bank", ["bank", "बैंक", "வங்கி", "பேங்க"]],
  ["shop", ["shop", "store", "dukan", "दुकान", "கடை", "ஷாப்"]],
  ["account", ["account", "acount", "khata", "खाता", "கணக்க"]],
  ["fast", ["fast", "quick", "jaldi", "jldi", "जल्दी", "சீக்கிரம", "வேகம"]],
  ["cancel", ["cancel", "undo", "vapas", "vapis", "refund", "रद्द", "वापस", "ரத்து", "திரும்ப"]],
  ["limit", ["limit", "maximum", "sima", "सीमा", "लिमिट", "வரம்ப", "லிமிட"]],
  ["abroad", ["abroad", "foreign", "international", "overseas", "videsh", "विदेश", "வெளிநாட", "country", "desh", "देश", "நாட",
    // Where people most often send to, by name: "paise dubai bhejne hai".
    "usa", "america", "amerika", "dubai", "uae", "emirat", "london", "england", "canada", "kanada", "australia", "singapur",
    "saudi", "katar", "kuvait", "oman", "nepal", "bangladesh", "malaysia", "mexico", "germany", "europe", "yurop",
    "अमेरिका", "दुबई", "लंदन", "कनाडा", "सऊदी", "नेपाल", "அமெரிக்க", "துபாய", "சிங்கப்பூர", "மலேசிய"]],
  ["hold", ["hold", "block", "frozen", "friz", "suspend", "rok", "रोक", "ब्लॉक", "முடக்க", "நிறுத்த"]],
  ["scan", ["scan", "scanner", "qr", "स्कैन", "ஸ்கேன"]],
  ["wrong", ["wrong", "galat", "glat", "गलत", "தவற"]],
  ["history", ["history", "histry", "receipt", "reciept", "statement", "रसीद", "हिस्ट्री", "ரசீத", "வரலாற"]],
  ["essentials", ["essential", "esential", "ज़रूर", "जरूर", "எசென்ஷ"]],
  ["geu", ["geu", "gue"]],
  ["notify", ["notif", "alert", "सूचना", "नोटिफ", "அறிவிப்ப"]],
  ["pin", ["pin", "पिन", "பின"]],
  ["receive", ["receiv", "reciev", "milt", "milega", "मिलेग", "मिलत", "பெற"]],
  ["shopmoney", ["sale", "earning", "kamai", "कमाई", "வருமான"]],
];

// Hindi words people type in Latin letters. Two of these (or one in a short
// question) mean Hinglish.
var ASK_HL_WORDS = new Set([
  "kaise", "kese", "kaisay", "kya", "kyu", "kyun", "kyon", "kab", "kitna", "kitne", "kitni", "kahan", "kaha", "kaun", "kon",
  "hai", "hain", "nahi", "nahin", "nai", "mera", "meri", "mere", "mujhe", "maine", "mene", "hamara", "apna", "apne",
  "paise", "paisa", "bhejna", "bheje", "bhejo", "bhej", "bheja", "nikalna", "nikale", "nikalo", "karna", "karu", "karun", "kare",
  "karein", "karen", "karo", "ka", "ki", "ke", "ko", "se", "mein", "aur", "bhi", "wapas", "vapas", "khata", "chahiye", "sakta",
  "sakte", "sakti", "raha", "rahe", "rahi", "gaya", "gaye", "hua", "hue", "abhi", "tak", "kal", "aaj", "dikha", "dikh", "milega",
  "mila", "mile", "batao", "bataye", "samjhao", "dusre", "desh", "dukan", "galat",
]);
// A few words of other Latin-script languages: understood where the words
// match, answered in English, and noted for the team.
var ASK_OTHER_LATIN = new Set([
  "como", "cómo", "dinero", "enviar", "envío", "envio", "qué", "por", "para", "cuenta", "dinheiro", "conta",
  "comment", "argent", "envoyer", "compte", "pourquoi", "geld", "senden", "wie", "warum", "konto", "bagaimana", "uang", "kirim",
]);

// The script a piece of text is written in.
function askScript(text) {
  const s = String(text || "");
  const count = (re) => (s.match(re) || []).length;
  const n = {
    hi: count(/[ऀ-ॿ]/g), ta: count(/[஀-௿]/g), latin: count(/[A-Za-zÀ-ɏ]/g),
    other: count(/[؀-ۿঀ-৿਀-੿઀-૿଀-୿ఀ-౿ಀ-೿ഀ-ൿ฀-๿Ѐ-ӿͰ-Ͽ぀-ヿ一-鿿가-힯]/g),
  };
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top[1] ? top[0] : "";
}

// Which of our languages a question is in — and whether it is one we
// actually wrote answers in (known: false → answered in English).
function askDetectLang(text, fallback) {
  const script = askScript(text);
  if (script === "hi") return { lang: "hi", known: true };
  if (script === "ta") return { lang: "ta", known: true };
  if (script === "other") return { lang: "en", known: false };
  if (script !== "latin") return { lang: fallback || "en", known: true };
  const words = String(text).toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(Boolean);
  const hl = words.filter((w) => ASK_HL_WORDS.has(w)).length;
  const other = words.filter((w) => ASK_OTHER_LATIN.has(w)).length;
  if (other >= 2 || (other >= 1 && words.length <= 3 && hl === 0)) return { lang: "en", known: false };
  if (hl >= 2 || (hl >= 1 && words.length <= 3)) return { lang: "hl", known: true };
  // A Hindi phone that types in Latin letters is probably Hinglish.
  if (hl >= 1 && fallback === "hl") return { lang: "hl", known: true };
  return { lang: "en", known: true };
}

// The same word, however it is spelled.
function askTidyWord(w) {
  let x = w;
  if (/^[a-z]+$/.test(x)) {
    x = x.replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k")
      .replace(/aa+/g, "a").replace(/ee+/g, "i").replace(/oo+/g, "u").replace(/([bcdfghjklmnprstvxy])\1+/g, "$1");
  } else {
    x = x.replace(/़/g, "").replace(/ँ/g, "ं");
  }
  return x;
}

function askNormalize(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .replace(/\*\*/g, " ").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function askSynKey(w) {
  for (const [key, variants] of ASK_SYN) {
    for (const v of variants) if (w === v || (v.length >= 3 && w.startsWith(v))) return key;
  }
  return null;
}

// The words of a question that matter, tidied, with shared meanings joined.
function askTokens(text, keepLastRaw) {
  const raw = askNormalize(text).split(" ").filter(Boolean);
  const out = [];
  raw.forEach((w, i) => {
    if (ASK_STOP.has(w)) return;
    const t = askTidyWord(w);
    if (!t) return;
    const key = askSynKey(t);
    // While someone is still typing, the last word is half a word: keep it
    // as written so it can match the start of a longer one.
    if (keepLastRaw && i === raw.length - 1) out.push({ t, key, partial: true });
    else out.push({ t, key });
  });
  return out;
}

function askGrams(text) {
  const s = ` ${askTokens(text).map((x) => x.t).join(" ")} `;
  const g = new Set();
  const chars = Array.from(s);
  for (let i = 0; i + 3 <= chars.length; i += 1) g.add(chars.slice(i, i + 3).join(""));
  return g;
}

// At most one letter wrong, missing, extra, or two swapped.
function askNear(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n] <= 1;
}

// How alike two words are, 0..1.
function askSim(q, d) {
  if (q.key && q.key === d.key) return 1;
  const a = q.t, b = d.t;
  if (a === b) return 1;
  if (q.partial && a.length >= 2 && b.startsWith(a)) return 0.9;
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a[p] === b[p]) p += 1;
  if (p >= 3 && p >= n * 0.6) return 0.55 + 0.4 * (p / Math.max(a.length, b.length));
  if (n >= 4 && askNear(a, b)) return 0.8;
  return 0;
}

// The guide, ready to search. Built once per guide version.
function askBuildIndex(cards) {
  const docs = [];
  const df = new Map();
  for (const card of cards || []) {
    const seen = new Set();
    for (const lang of Object.keys(card.t || {})) {
      const x = card.t[lang];
      for (const text of [x.q, ...(x.asks || [])]) {
        const toks = askTokens(text);
        if (!toks.length) continue;
        docs.push({ card, lang, toks, grams: askGrams(text) });
        for (const tk of toks) seen.add(tk.key || tk.t);
      }
    }
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = Math.max(1, (cards || []).length);
  const idf = (tk) => Math.log(1 + N / (df.get(tk.key || tk.t) || 0.5));
  return { cards: cards || [], byId: new Map((cards || []).map((c) => [c.id, c])), docs, idf };
}

// Every card, best first, for one question.
function askRank(index, text, opts) {
  const o = opts || {};
  const q = askTokens(text, Boolean(o.typing));
  if (!q.length || !index || !index.docs.length) return [];
  const qg = askGrams(text);
  const qw = q.map((tk) => index.idf(tk));
  const qSum = qw.reduce((s, x) => s + x, 0) || 1;
  const best = new Map();
  for (const doc of index.docs) {
    let cov = 0;
    const used = new Array(doc.toks.length).fill(0);
    q.forEach((tk, i) => {
      let m = 0, at = -1;
      doc.toks.forEach((dt, j) => { const s = askSim(tk, dt); if (s > m) { m = s; at = j; } });
      cov += qw[i] * m;
      if (at >= 0) used[at] = Math.max(used[at], m);
    });
    cov /= qSum;
    const dw = doc.toks.map((dt) => index.idf(dt));
    const dSum = dw.reduce((s, x) => s + x, 0) || 1;
    const back = dw.reduce((s, w, j) => s + w * used[j], 0) / dSum;
    let inter = 0;
    for (const g of qg) if (doc.grams.has(g)) inter += 1;
    const tri = inter / Math.max(1, qg.size + doc.grams.size - inter);
    let score = 0.58 * cov + 0.27 * back + 0.15 * tri;
    if (o.lang && doc.lang === o.lang) score += 0.02;
    const prev = best.get(doc.card.id);
    if (!prev || score > prev.score) best.set(doc.card.id, { card: doc.card, score, lang: doc.lang });
  }
  const out = [...best.values()];
  if (o.screen) for (const r of out) if ((r.card.screens || []).includes(o.screen)) r.score += 0.05;
  return out.sort((a, b) => b.score - a.score);
}

// Answer, offer three, or say nothing fits.
function askDecide(ranked) {
  const [a, b] = ranked || [];
  if (!a || a.score < 0.42) return { kind: "none", top: [] };
  const gap = b ? a.score - b.score : 1;
  if ((a.score >= 0.5 && gap >= 0.08) || a.score >= 0.78) return { kind: "answer", top: [a] };
  return { kind: "choices", top: ranked.filter((r) => r.score >= 0.3).slice(0, 3) };
}

// Is this about the person's OWN money — a payment they made, money that
// did not arrive, a balance that looks wrong? The guide can't see any of
// that, so these go to a person.
var ASK_ME = /(^|[^\p{L}])(i|i've|ive|my|mine|me|maine|mene|mai|main|mera|meri|mere|mujhe|hamne|humne|hamara|मैंने|मैने|मेरा|मेरी|मेरे|मुझे|हमने|हमारा|நான்|என்|எனது|எனக்கு|என்னுடைய)(?=$|[^\p{L}])/iu;
var ASK_HAPPENED = /(?:^|[^\p{L}\p{M}])(sent|paid|transferred|deducted|debited|not received|didn'?t (get|receive|arrive|come)|not (arrived|credited|come)|haven'?t (got|received)|missing|stuck|where is my|bheje|bheja|bhejе|bhja|bheji|nahi (mil|aa|aay|pahunch|pohoch)|nahin (mil|aa|pahunch)|nai mil|kat gay|kat gaya|kata|cut ho|katt|भेजे|भेजा|भेजी|नहीं मिल|नही मिल|नहीं आ|नहीं पहुं|नहीं पहुँ|कट गए|कट गया|அனுப்பினேன்|அனுப்பிய|வரவில்லை|கிடைக்கவில்லை|போகவில்லை|சேரவில்லை|கழிந்த)/iu;
function askIsPersonal(text) {
  const s = String(text || "");
  const happened = ASK_HAPPENED.test(s);
  if (!happened) return false;
  return /\d/.test(s) || ASK_ME.test(s);
}

// Bold in an answer is written **like this**.
function askPlain(text) { return String(text || "").replace(/\*\*/g, ""); }
