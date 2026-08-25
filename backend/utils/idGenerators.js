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
function genSuggestedId(length = 12) {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)];
  }
  return s;
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

