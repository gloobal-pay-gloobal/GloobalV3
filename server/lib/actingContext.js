// server/lib/actingContext.js
//
// ── WHO IS HELPING, FOR THIS ONE REQUEST ─────────────────────────────────
//
// A helper uses the account of someone they look after (lib/care.js) with a
// short session token that names both: the account it opens (`sub`) and the
// helper using it (`act`). requireAuth runs everything after it inside this
// context, so code far from the request — the PIN model, the action log —
// can ask "is this a helper, and who?" without every route passing it on.
//
// The one thing it changes on its own: a PIN check for the account being
// helped is a check of the HELPER's own PIN (models/Pin.js). The person
// looked after has no phone and no PIN; the helper confirms with theirs.
const { AsyncLocalStorage } = require('async_hooks');

const store = new AsyncLocalStorage();

function runActing({ dependentId, helperId }, fn) {
  return store.run({ dependentId: String(dependentId), helperId: String(helperId) }, fn);
}
function acting() {
  return store.getStore() || null;
}

module.exports = { runActing, acting };
