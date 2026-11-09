// backend/services/storage/localCopy.js
//
// The phone's own copy of what the server last said about THIS account.
//
//   server     the only record of money. Every payment, every write, every
//              balance a payment is checked against happens there.
//   this file  a saved copy of a few read-only answers (profile, balance,
//              history, coin, PayLater…), kept in IndexedDB on the phone so
//              the app still has something true-as-of-a-time to show when
//              the server can't be reached: no signal, or Render asleep.
//
// Rules, and why:
//   - GET only, and only the paths in GLOOBAL_LOCAL_COPY_PATHS. A write is
//     never answered from here: a payment "succeeding" from a saved copy
//     would be a lie about money.
//   - Only used when the server gave NO answer (status 0). A real answer,
//     even an error, always wins, so a saved copy can never hide a refusal.
//   - Each copy is stamped with the account it belongs to and is ignored for
//     anyone else. Sign-out and a rejected token wipe the lot.
//   - Nothing secret goes in: no PIN, no token, no face pattern. These are
//     the same answers the screens already show.
//   - Every IndexedDB call is guarded. Private mode, a full disk or a browser
//     without IndexedDB means "no saved copy", never a crash.
//
// When a saved copy is shown, GLOOBAL_LOCAL_COPY_EVENT fires with the time it
// was saved, so the app can say "Offline · saved at 10:42" instead of
// passing an old balance off as a live one.

var GLOOBAL_LOCAL_COPY_DB = "gloobal-local";
var GLOOBAL_LOCAL_COPY_STORE = "copies";
var GLOOBAL_LOCAL_COPY_EVENT = "gloobal:savedCopy";
var GLOOBAL_LOCAL_COPY_LIVE_EVENT = "gloobal:liveCopy";
// A copy older than this is not shown at all: a balance from last month is
// more misleading than "couldn't reach the server".
var GLOOBAL_LOCAL_COPY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1e3;

// ── WHAT THE PHONE MAY KEEP, AND WHAT MUST COME FROM THE SERVER ─────────
//
// Three groups. Paths are matched without their query; the stored key keeps
// the query, so "history, sent only" and "history, all" are separate copies.
// Checked against every read the app makes by tests/offline-audit.mjs.
//
// 1. YOUR OWN VIEWS. What the server last said about this account: shown
//    from the phone when the server can't be reached, with the notice.
var GLOOBAL_LOCAL_COPY_PATHS = [
  // Money you hold, read-only
  /^\/api\/bank\/[^/?]+$/,
  /^\/api\/assets\/[^/?]+$/,
  /^\/api\/assets\/paylater\/[^/?]+$/,
  /^\/api\/assets\/settlements\/[^/?]+$/,
  /^\/api\/coin\/[^/?]+$/,
  /^\/api\/essentials\/me$/,
  /^\/api\/bank-transfers$/,
  /^\/api\/bank-transfers\/accounts$/,
  /^\/api\/creator-share\/(overview|distribution)$/,
  // History (the list, all / sent / received, and the old route)
  /^\/api\/transactions\/[^/?]+$/,
  /^\/api\/transactions\/history\/[^/?]+$/,
  // Who you are
  /^\/api\/profile\/[^/?]+$/,
  /^\/api\/passport\/[^/?]+$/,
  /^\/api\/users\/[^/?]+\/photo$/,
  /^\/api\/referrals\/[^/?]+$/,
  /^\/api\/interest\/status\/[^/?]+$/,
  /^\/api\/hooman$/,
  // Your shop
  /^\/api\/creator\/[^/?]+\/(profile|items|suppliers|purchases|reviews|insights)$/,
  /^\/api\/shops$/,
  /^\/api\/shops\/summary$/,
  // Your choices, chats, complaints, rent, notices
  /^\/api\/categories$/,
  /^\/api\/categories\/tags$/,
  /^\/api\/category-links$/,
  /^\/api\/support\/conversations(\/[^/?]+)?$/,
  /^\/api\/support\/payments$/,
  /^\/api\/complaints(\/[^/?]+)?$/,
  /^\/api\/names\/threads(\/[^/?]+)?$/,
  /^\/api\/helloo\/chats\/[^/?]+\/messages$/,
  /^\/api\/rent\/(links|places)(\/[^/?]+)?$/,
  /^\/api\/rent\/profile$/,
  /^\/api\/notifications$/,
  /^\/api\/notifications\/unread-count$/,
  // 2. GLOOBAL'S OWN PAGES. The same for everyone and slow to change (what a
  //    product is, the guide, coverage, the coin's totals). A saved copy is
  //    fine; the notice still says it's saved.
  /^\/api\/products\/[^/?]+$/,
  /^\/api\/guide$/,
  /^\/api\/coverage(\/(view|me|books|numbers))?$/,
  /^\/api\/coin\/(supply|holders)$/,
  /^\/api\/bazaar\/(showcase|categories)$/
];

// 3. LIVE ONLY. Never answered from the phone, even if a pattern above would
//    match: each is a question whose answer must be true NOW, usually just
//    before money moves or an ID is taken. (Every write, POST/PUT/PATCH/DELETE,
//    is live only as well; that is checked before this list.)
var GLOOBAL_LOCAL_COPY_LIVE_ONLY = [
  /^\/api\/users\/resolve$/,          // who an ID or number belongs to, before paying
  /^\/api\/payees\/current$/,         // the payee's current ID
  /^\/api\/users\/available$/,        // is this ID free
  /^\/api\/referrals\/code\/[^/?]+$/, // is this referral code real
  /^\/api\/corridor\/limit$/,         // how much may be sent right now
  /^\/api\/face\/status\/[^/?]+$/,    // face check state, guards payments
  /^\/api\/profile\/[^/?]+\/live-photo\/pending$/,
  /^\/api\/bank-transfers\/(?!accounts$)[^/?]+$/, // one transfer's status: is it done yet
  /^\/api\/creator\/resolve\/[^/?]+$/,
  /^\/api\/names\/(?!threads$)[^/?]+$/, // a name's price and owner
  /^\/api\/rent\/name-available$/,
  /^\/api\/rent\/listings(\/[^/?]+)?$/, // search results
  /^\/api\/bazaar\/(suggest|words)$/,
  /^\/api\/bazaar$/,
  /^\/api\/geo\//,
  /^\/api\/push\//
];

function gloobalLocalCopyWanted(method, path) {
  if (method !== "GET" || typeof path !== "string") return false;
  const bare = path.split("?")[0];
  if (GLOOBAL_LOCAL_COPY_LIVE_ONLY.some((re) => re.test(bare))) return false;
  return GLOOBAL_LOCAL_COPY_PATHS.some((re) => re.test(bare));
}

// Who the copy belongs to: the signed-in account, by its phone number (which
// a Gloobal ID rename never changes), else its ID. No account, no copy.
function gloobalLocalCopyOwner() {
  try {
    const raw = typeof gloobalSessionReadRaw === "function" ? gloobalSessionReadRaw() : null;
    const user = raw && raw.user;
    if (!user) return "";
    return String(user.mobileNumber || user.symbolId || "");
  } catch (e) {
    return "";
  }
}

var gloobalLocalCopyDbPromise = null;

function gloobalLocalCopyOpen() {
  if (gloobalLocalCopyDbPromise) return gloobalLocalCopyDbPromise;
  gloobalLocalCopyDbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) return resolve(null);
      const req = indexedDB.open(GLOOBAL_LOCAL_COPY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(GLOOBAL_LOCAL_COPY_STORE)) db.createObjectStore(GLOOBAL_LOCAL_COPY_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return gloobalLocalCopyDbPromise;
}

function gloobalLocalCopyTx(mode, run) {
  return gloobalLocalCopyOpen().then((db) => new Promise((resolve) => {
    if (!db) return resolve(null);
    try {
      const tx = db.transaction(GLOOBAL_LOCAL_COPY_STORE, mode);
      const store = tx.objectStore(GLOOBAL_LOCAL_COPY_STORE);
      const req = run(store);
      tx.oncomplete = () => resolve(req && "result" in req ? req.result : true);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  }));
}

// Saved after every good answer. Fire-and-forget: a failed save costs
// nothing but the copy.
function gloobalLocalCopySave(path, data) {
  const owner = gloobalLocalCopyOwner();
  if (!owner || data === undefined || data === null) return Promise.resolve(null);
  const record = { owner, path, at: Date.now(), data };
  return gloobalLocalCopyTx("readwrite", (store) => store.put(record, `${owner}|${path}`));
}

// The saved copy for this account and path, or null. Too old, someone
// else's, or unreadable all count as none.
async function gloobalLocalCopyRead(path) {
  const owner = gloobalLocalCopyOwner();
  if (!owner) return null;
  const record = await gloobalLocalCopyTx("readonly", (store) => store.get(`${owner}|${path}`));
  if (!record || record.owner !== owner || record.path !== path) return null;
  if (!(Date.now() - record.at <= GLOOBAL_LOCAL_COPY_MAX_AGE_MS)) return null;
  return record;
}

// Sign-out and a rejected token: nothing of the account stays on the phone.
function gloobalLocalCopyClear() {
  return gloobalLocalCopyTx("readwrite", (store) => store.clear());
}

function gloobalLocalCopyAnnounce(name, detail) {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (e) {
    /* no-op */
  }
}

// ── PHONE FIRST, THEN THE SERVER ────────────────────────────────────────
//
// A screen that can redraw itself when the real answer lands subscribes
// here with the paths it shows. For those paths only, httpClient answers
// from the phone's copy when the server is slower than
// GLOOBAL_LOCAL_COPY_FAST_MS, fires GLOOBAL_LOCAL_COPY_UPDATING_EVENT (the
// app says "Updating…"), and when the server's answer arrives and differs,
// fires GLOOBAL_LOCAL_COPY_FRESH_EVENT so the subscribed screen reads again.
//
// A path nobody listens for is never answered early: a screen that cannot
// redraw would keep the old figure until it was reopened.
var GLOOBAL_LOCAL_COPY_UPDATING_EVENT = "gloobal:savedCopyUpdating";
var GLOOBAL_LOCAL_COPY_FRESH_EVENT = "gloobal:freshCopy";
var GLOOBAL_LOCAL_COPY_FAST_MS = 700;
var gloobalLocalCopyListeners = [];

// Subscribe `fn` to fresh answers for paths matching `test` (a RegExp on the
// path without its query). Several paths landing together call `fn` once.
// Returns the unsubscribe, so it can be a useEffect's return value.
function gloobalOnFresh(test, fn) {
  const entry = { test, timer: null };
  gloobalLocalCopyListeners.push(entry);
  const onFresh = (e) => {
    const path = e && e.detail && e.detail.path;
    if (!path || !test.test(String(path).split("?")[0])) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => fn(path), 250);
  };
  if (typeof window !== "undefined") window.addEventListener(GLOOBAL_LOCAL_COPY_FRESH_EVENT, onFresh);
  return () => {
    clearTimeout(entry.timer);
    gloobalLocalCopyListeners = gloobalLocalCopyListeners.filter((x) => x !== entry);
    if (typeof window !== "undefined") window.removeEventListener(GLOOBAL_LOCAL_COPY_FRESH_EVENT, onFresh);
  };
}

function gloobalLocalCopyHasListener(path) {
  const bare = String(path || "").split("?")[0];
  return gloobalLocalCopyListeners.some((l) => l.test.test(bare));
}
