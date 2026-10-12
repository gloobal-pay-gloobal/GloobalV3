// src/utils/idGenerators.js
function isoToFlag(iso2) {
  return iso2.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
// A transaction ID is twenty of the eight Gloobal symbols and nothing else —
// the same alphabet a Gloobal ID is written in, and the same length and shape
// the backend's own referenceId now uses (createPrototypeTransactionReference
// in Backend/server.js), so a locally-minted ID and a server-minted one are
// indistinguishable in a receipt.
//
// This used to insert a space every four symbols, making the value 24
// characters of which four were whitespace. Every consumer then had to know to
// strip them (ReceiptModal still does, for rows saved before this change), and
// an ID copied out of one screen would not match the same ID typed into
// another. Grouping is a display concern; the value itself is 20 symbols.
var TXN_ID_LENGTH = 20;
function genTxnId() {
  let s = "";
  for (let i = 0; i < TXN_ID_LENGTH; i++) {
    s += DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)];
  }
  return s;
}
// ── A SUGGESTED ID SOMEBODY CAN ACTUALLY HOLD IN THEIR HEAD ────────────
//
// Twelve symbols drawn independently is twelve things to remember, and
// nobody remembers twelve things. The suggestion was being refreshed until
// something looked nice, which is a person doing by hand what this should
// do for them.
//
// The shape is: a MOTIF of four, written twice, then four free symbols.
//
//     ●■○=  ●■○=  +−●□
//     └─────┬────┘ └┬─┘
//      say it twice  the part that is only yours
//
// One short motif to learn, and the repetition does the work of making it
// stick. The motif's four symbols are all DIFFERENT on purpose: "circle,
// square, minus, equals" is four names said once, where ●●■○ would make
// somebody count a repeat, and counting is what makes a symbol string hard.
//
// ── WHY THE LAST FOUR STAY FREE ────────────────────────────────────────
//
// This is the part that matters, and it is not a style choice.
//
// A Gloobal ID is how money finds a person. Today's free-random suggestion
// draws from 8^12 — about 68.7 BILLION — and that size is doing real work:
// a mistyped ID almost always names nobody, so the payment fails instead of
// reaching a stranger. The accident is a safety net.
//
// Patterns dissolve it. A fully patterned ID is a small set: alternating
// (●■●■●■●■●■●■) has 56 members in the whole world, blocks of four has 512,
// blocks of three 4,096. Two things then go wrong at once. The suggestions
// run out — four thousand users and every patterned ID is taken. And far
// worse, NEIGHBOURING IDS BECOME REAL: with free-random IDs one wrong
// symbol lands on nothing, but when everyone's ID is patterned, the ID one
// symbol away from yours is probably somebody's. A typo stops failing and
// starts paying the wrong person. That is typosquatting, for payments.
//
// Half-patterned keeps both. 1,680 motifs × the free tail leaves 6,583,920
// suggestable IDs — room for far more people than this app will have — and
// two people who happen to draw the same motif still differ across four
// independent symbols rather than by a single keystroke.
//
// And none of this narrows what anybody MAY have. A person typing their own
// ID still has all 68.7 billion; this only decides what the app offers.
var GLOOBAL_ID_MOTIF_LENGTH = 4;

// Three or more of the same symbol in a row is the one local shape that is
// genuinely hard to hold: ●●● and ●●●● are told apart by counting, and a
// person reading their ID back off a screen will get it wrong. Two in a row
// is fine and often pleasant.
function gloobalIdHasRun(symbols) {
  for (let i = 0; i + 2 < symbols.length; i++) {
    if (symbols[i] === symbols[i + 1] && symbols[i + 1] === symbols[i + 2]) return true;
  }
  return false;
}

// Four DISTINCT symbols, drawn without replacement so the motif is four
// names rather than a pattern with a repeat inside it.
function gloobalIdMotif() {
  const pool = DIAL_SYMBOLS.slice();
  const motif = [];
  for (let i = 0; i < GLOOBAL_ID_MOTIF_LENGTH && pool.length; i++) {
    motif.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return motif;
}

function gloobalIdFreeSymbols(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  }
  return out;
}

function genSuggestedId(length = 12) {
  // The shape is three groups of four. Any other length — and nothing asks
  // for one today — falls back to the free draw rather than returning
  // something a caller did not ask for.
  if (length !== GLOOBAL_ID_MOTIF_LENGTH * 3) return gloobalIdFreeSymbols(length).join("");

  // Bounded, because a loop that cannot fail is still a loop that can spin.
  // Nearly every draw passes; forty attempts is far past paranoid.
  for (let attempt = 0; attempt < 40; attempt++) {
    const motif = gloobalIdMotif();
    const tail = gloobalIdFreeSymbols(GLOOBAL_ID_MOTIF_LENGTH);
    // A tail that repeats the motif is the motif three times — a tidier
    // shape, and a much smaller one (4,096 IDs rather than six million).
    // Refused so the suggestion cannot quietly collapse into it.
    if (tail.join("") === motif.join("")) continue;
    const symbols = motif.concat(motif, tail);
    if (gloobalIdHasRun(symbols)) continue;
    return symbols.join("");
  }

  // Never the shape at the cost of never an ID.
  return gloobalIdFreeSymbols(length).join("");
}
// A set of distinct suggestions to choose between, keeping `seed` as the
// first entry when one is supplied so a caller that already generated an
// ID does not see it replaced the moment the row renders.
//
// The distinctness loop is not really about collisions — two independent
// 12-symbol draws from an 8-symbol alphabet collide about once in 68
// billion — it is about not shipping a list that CAN render three
// identical rows. `attempts` bounds it so a caller asking for more
// distinct IDs than the alphabet could produce returns a short list
// rather than spinning forever.
function genSuggestedIdSet(count = 1, length = 12, seed = "") {
  const out = seed && seed.length === length ? [seed] : [];
  let attempts = 0;
  while (out.length < count && attempts < count * 12) {
    attempts += 1;
    const candidate = genSuggestedId(length);
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

