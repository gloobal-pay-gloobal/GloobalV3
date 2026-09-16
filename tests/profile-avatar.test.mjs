// tests/profile-avatar.test.mjs
//
// The shared profile photo pieces (frontend/components/common/profileAvatar.jsx)
// and the client calls behind them (backend/services/api/gloobalApi.js).
//
// ProfileAvatar is not mounted anywhere yet, so the component is checked at
// source level. The counterparty photo cache is plain JS, so it is sliced out
// of the file and actually run — "one request per Gloobal ID" is a behaviour,
// and a regex over the source could not tell a working dedupe from a broken one.

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";

const SRC = readSource("frontend/components/common/profileAvatar.jsx");

const slice = (from, to) => {
  const start = SRC.indexOf(from);
  const end = to ? SRC.indexOf(to, start) : SRC.length;
  assert.ok(start >= 0 && end > start, `could not slice ${from}..${to}`);
  return SRC.slice(start, end);
};

const componentSource = slice("function ProfileAvatar(", "\n// ── Counterparty photos");

describe("ProfileAvatar", () => {
  test("is declared with the contract's props and defaults", () => {
    assert.match(SRC, /function ProfileAvatar\(\{\s*photo,\s*name,\s*size = 56,\s*ring\s*\}\)/);
  });

  test("only a data:image URL that is not the logo counts as a photo", () => {
    const isPhoto = new Function(
      "G_LOGO_DATA_URI",
      slice("function profileAvatarIsPhoto(", "\nfunction ProfileAvatar(") + "\nreturn profileAvatarIsPhoto;"
    )("data:image/png;base64,LOGO");
    assert.equal(isPhoto("data:image/jpeg;base64,/9j/AAAA"), true);
    assert.equal(isPhoto("data:image/png;base64,iVBORw0K"), true);
    assert.equal(isPhoto("data:image/png;base64,LOGO"), false, "the G logo default is not a photo");
    assert.equal(isPhoto("https://gloobal-pay.onrender.com/photo.jpg"), false);
    assert.equal(isPhoto("blob:https://gloobalv3.netlify.app/abc"), false);
    assert.equal(isPhoto("javascript:alert(1)"), false);
    assert.equal(isPhoto(null), false);
    assert.equal(isPhoto(undefined), false);
    assert.equal(isPhoto({ src: "data:image/png;base64,x" }), false);
  });

  test("the photo <img> is gated on that check, and falls back on a load error", () => {
    assert.match(componentSource, /const showPhoto = profileAvatarIsPhoto\(photo\) && failedSrc !== photo;/);
    assert.match(componentSource, /\{showPhoto\s*\?\s*<img\s+src=\{photo\}/);
    assert.match(componentSource, /onError=\{\(\) => setFailedSrc\(photo\)\}/);
    // The photo src appears exactly once — no second path that renders it ungated.
    assert.equal((componentSource.match(/src=\{photo\}/g) || []).length, 1);
  });

  test("has the test hooks the other screens and suites rely on", () => {
    assert.match(componentSource, /data-testid="profile-avatar"/);
    assert.match(componentSource, /data-avatar-state=\{showPhoto \? "photo" : "fallback"\}/);
  });

  test("the fallback is the white G logo on the brand disc, like the dashboard circle", () => {
    assert.match(componentSource, /src=\{G_LOGO_DATA_URI\}/);
    assert.match(componentSource, /filter: "brightness\(0\) invert\(1\)"/);
    assert.match(componentSource, /objectFit: "contain"/);
    assert.match(componentSource, /T\.gradWallet \|\| T\.accent/);
    assert.match(componentSource, /objectFit: "cover"/);
  });

  test("alt text names the person, or Gloobal for the logo", () => {
    assert.match(componentSource, /alt=\{`\$\{displayName\} profile photo`\}/);
    assert.match(componentSource, /alt="Gloobal"/);
  });

  test("uses only Agent F's hook aliases", () => {
    const imports = SRC.match(/^import \{([^}]*)\} from "react";$/m);
    assert.ok(imports, "react import line");
    const aliases = imports[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[1]);
    const allowed = new Set(["useState37", "useState38", "useState39", "useEffect27", "useEffect28", "useEffect29", "useRef20", "useRef21", "useCallback12"]);
    for (const alias of aliases) assert.ok(allowed.has(alias), `unexpected alias ${alias}`);
  });
});

// ── The counterparty photo cache, run for real ──────────────────────────────

function loadCache(getUserPhoto) {
  const calls = [];
  const GloobalApi = {
    getUserPhoto: (id) => {
      calls.push(id);
      return getUserPhoto(id);
    }
  };
  const body =
    slice("function profileAvatarIsPhoto(", "\nfunction ProfileAvatar(") +
    slice("var COUNTERPARTY_PHOTO_CACHE", "\nfunction useCounterpartyPhoto(") +
    "\nreturn { loadCounterpartyPhoto, clearCounterpartyPhotoCache, COUNTERPARTY_PHOTO_CACHE };";
  const api = new Function("GloobalApi", "G_LOGO_DATA_URI", body)(GloobalApi, "data:image/png;base64,LOGO");
  return { ...api, calls };
}

describe("loadCounterpartyPhoto", () => {
  const PHOTO = "data:image/jpeg;base64,/9j/AAAA";

  test("concurrent and later callers share one request per Gloobal ID", async () => {
    let resolve;
    const cache = loadCache(() => new Promise((r) => (resolve = r)));
    const a = cache.loadCounterpartyPhoto("○○○○○○○○○○○○");
    const b = cache.loadCounterpartyPhoto("○○○○○○○○○○○○");
    assert.equal(a, b, "the in-flight promise is shared");
    await Promise.resolve();
    await Promise.resolve();
    resolve(PHOTO);
    assert.equal(await a, PHOTO);
    assert.equal(await cache.loadCounterpartyPhoto("○○○○○○○○○○○○"), PHOTO);
    assert.deepEqual(cache.calls, ["○○○○○○○○○○○○"]);
  });

  test("a known 'no photo' is cached; a non-data URL is not a photo", async () => {
    const cache = loadCache((id) => Promise.resolve(id === "a" ? null : "https://x/y.jpg"));
    assert.equal(await cache.loadCounterpartyPhoto("a"), null);
    assert.equal(await cache.loadCounterpartyPhoto("a"), null);
    assert.equal(await cache.loadCounterpartyPhoto("b"), null);
    assert.deepEqual(cache.calls, ["a", "b"]);
  });

  test("a failed read resolves null and is retried next time, not cached", async () => {
    let fail = true;
    const cache = loadCache(() => (fail ? Promise.reject(new Error("cold start")) : Promise.resolve(PHOTO)));
    assert.equal(await cache.loadCounterpartyPhoto("x"), null);
    fail = false;
    assert.equal(await cache.loadCounterpartyPhoto("x"), PHOTO);
    assert.deepEqual(cache.calls, ["x", "x"]);
  });

  test("an empty id makes no request", async () => {
    const cache = loadCache(() => Promise.resolve(PHOTO));
    assert.equal(await cache.loadCounterpartyPhoto(""), null);
    assert.equal(await cache.loadCounterpartyPhoto(null), null);
    assert.deepEqual(cache.calls, []);
  });

  test("clearCounterpartyPhotoCache forgets everything, including a read in flight", async () => {
    let resolve;
    const cache = loadCache(() => new Promise((r) => (resolve = r)));
    const pending = cache.loadCounterpartyPhoto("x");
    await Promise.resolve();
    await Promise.resolve();
    cache.clearCounterpartyPhotoCache();
    resolve(PHOTO);
    await pending;
    assert.equal(cache.COUNTERPARTY_PHOTO_CACHE.size, 0, "the old account's read did not repopulate the cache");
  });

  test("useCounterpartyPhoto goes through the same loader", () => {
    const hook = slice("function useCounterpartyPhoto(");
    assert.match(hook, /loadCounterpartyPhoto\(key\)/);
    assert.match(hook, /return \{ photo: [^,]+, loading: (true|false) \}/);
    assert.doesNotMatch(hook, /GloobalApi\./, "the hook never fetches around the cache");
  });
});

// ── GloobalApi calls ────────────────────────────────────────────────────────

describe("GloobalApi photo and notification calls", () => {
  const { GloobalApi, GloobalApiError } = loadDomain(["GloobalApi", "GloobalApiError"]);
  const realFetch = globalThis.fetch;
  let requests;

  const fakeFetch = (respond) => {
    requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
      const [status, payload] = respond(String(url), init);
      return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
    };
  };

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("getUserPhoto encodes the id, returns the data URL, and null on 404", async () => {
    fakeFetch(() => [200, { success: true, photo: "data:image/png;base64,iVBORw0K" }]);
    assert.equal(await GloobalApi.getUserPhoto("○/○"), "data:image/png;base64,iVBORw0K");
    assert.match(requests[0].url, /\/api\/users\/%E2%97%8B%2F%E2%97%8B\/photo$/);
    assert.equal(requests[0].method, "GET");

    fakeFetch(() => [404, { success: false, code: "user_not_found" }]);
    assert.equal(await GloobalApi.getUserPhoto("nobody"), null);

    fakeFetch(() => [500, { success: false, message: "boom" }]);
    await assert.rejects(GloobalApi.getUserPhoto("x"), (err) => err instanceof GloobalApiError && err.status === 500);
  });

  test("setProfilePhoto PUTs the photo, and null to remove", async () => {
    fakeFetch(() => [200, { success: true, hasPhoto: true }]);
    assert.deepEqual(await GloobalApi.setProfilePhoto("○○", "data:image/jpeg;base64,/9j/"), { hasPhoto: true });
    assert.equal(requests[0].method, "PUT");
    assert.match(requests[0].url, /\/api\/profile\/%E2%97%8B%E2%97%8B\/photo$/);
    assert.deepEqual(requests[0].body, { photo: "data:image/jpeg;base64,/9j/" });

    fakeFetch(() => [200, { success: true, hasPhoto: false }]);
    assert.deepEqual(await GloobalApi.setProfilePhoto("○○", null), { hasPhoto: false });
    assert.deepEqual(requests[0].body, { photo: null });
  });

  test("notification calls hit the contract routes and normalise the answers", async () => {
    fakeFetch(() => [200, { success: true, notifications: [{ id: "n1" }], unreadCount: 2 }]);
    assert.deepEqual(await GloobalApi.getNotifications({ limit: 20, before: "2026-09-01T00:00:00.000Z" }), {
      notifications: [{ id: "n1" }],
      unreadCount: 2
    });
    assert.match(requests[0].url, /\/api\/notifications\?limit=20&before=2026-09-01T00%3A00%3A00.000Z$/);

    fakeFetch(() => [200, { success: true, notifications: [], unreadCount: 0 }]);
    await GloobalApi.getNotifications();
    assert.match(requests[0].url, /\/api\/notifications$/);

    fakeFetch(() => [200, { success: true, unreadCount: 4 }]);
    assert.equal(await GloobalApi.getUnreadNotificationCount(), 4);
    assert.match(requests[0].url, /\/api\/notifications\/unread-count$/);

    fakeFetch(() => [200, { success: true, notification: { id: "a/b" }, unreadCount: 3 }]);
    assert.deepEqual(await GloobalApi.markNotificationRead("a/b"), { notification: { id: "a/b" }, unreadCount: 3 });
    assert.equal(requests[0].method, "PATCH");
    assert.match(requests[0].url, /\/api\/notifications\/a%2Fb\/read$/);

    fakeFetch(() => [200, { success: true, updated: 3, unreadCount: 0 }]);
    assert.deepEqual(await GloobalApi.markAllNotificationsRead(), { updated: 3, unreadCount: 0 });
    assert.equal(requests[0].method, "POST");
    assert.match(requests[0].url, /\/api\/notifications\/read-all$/);
  });
});
