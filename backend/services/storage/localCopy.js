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

// The account's own read-only views. Paths are matched without their query,
// except where the query changes the answer (the stored key keeps it).
var GLOOBAL_LOCAL_COPY_PATHS = [
  /^\/api\/profile\/[^/?]+$/,
  /^\/api\/bank\/[^/?]+$/,
  /^\/api\/assets\/[^/?]+$/,
  /^\/api\/assets\/paylater\/[^/?]+$/,
  /^\/api\/assets\/settlements\/[^/?]+$/,
  /^\/api\/transactions\/history\/[^/?]+$/,
  /^\/api\/coin\/[^/?]+$/,
  /^\/api\/passport\/[^/?]+$/,
  /^\/api\/essentials\/me$/,
  /^\/api\/creator-share\/(overview|distribution)$/,
  /^\/api\/referrals\/[^/?]+$/,
  /^\/api\/bank-transfers$/,
  /^\/api\/bank-transfers\/accounts$/,
  /^\/api\/notifications\/unread-count$/
];

function gloobalLocalCopyWanted(method, path) {
  if (method !== "GET" || typeof path !== "string") return false;
  const bare = path.split("?")[0];
  // The coin's public pages share the /api/coin/ prefix; they are not this
  // account's and change for everyone.
  if (bare === "/api/coin/supply" || bare === "/api/coin/holders") return false;
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
