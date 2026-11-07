// The live photo rules (lib/livePhoto.js), against in-memory collections.
//
//   node --test tests/live-photo.test.mjs
//
// No database: the rules are what this checks — one face per GLOOBAL ID, a
// different face needs the PIN and waits 24 hours, the owner can cancel, a
// fresh photo of the owner cancels too, and no route ever answers with the
// encrypted descriptor. The real crypto module runs, with a test key.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire(import.meta.url);
process.env.FACE_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const faceCrypto = require("../lib/faceCrypto");
const lib = require("../lib/livePhoto");

// ── A tiny in-memory stand-in for the Mongoose calls the lib makes ─────────
function collection() {
  const rows = [];
  const match = (row, q) => Object.entries(q || {}).every(([k, v]) => {
    if (v && typeof v === "object" && !(v instanceof Date) && ("$ne" in v || "$lte" in v)) {
      if ("$ne" in v) return String(row[k]) !== String(v.$ne);
      if ("$lte" in v) return row[k] <= v.$lte;
    }
    return String(row[k]) === String(v);
  });
  const chain = (value) => ({ select: () => chain(value), lean: () => Promise.resolve(value), then: (a, b) => Promise.resolve(value).then(a, b) });
  return {
    rows,
    find: (q) => chain(rows.filter((r) => match(r, q)).map((r) => ({ ...r }))),
    findOne: (q) => chain(rows.find((r) => match(r, q)) ? { ...rows.find((r) => match(r, q)) } : null),
    exists: async (q) => rows.some((r) => match(r, q)),
    async findOneAndUpdate(q, doc) {
      const i = rows.findIndex((r) => match(r, q));
      if (i >= 0) rows[i] = { ...rows[i], ...doc };
      else rows.push({ ...doc });
      return { ...rows[i >= 0 ? i : rows.length - 1] };
    },
    async findOneAndDelete(q) {
      const i = rows.findIndex((r) => match(r, q));
      return i >= 0 ? rows.splice(i, 1)[0] : null;
    },
    async deleteOne(q) {
      const i = rows.findIndex((r) => match(r, q));
      if (i >= 0) rows.splice(i, 1);
    },
    async updateOne(q, { $set }) {
      const i = rows.findIndex((r) => match(r, q));
      if (i >= 0) rows[i] = { ...rows[i], ...$set };
      else rows.push({ ...q, ...$set });
    },
  };
}

const MODEL = "human-faceres@3.3";
// Descriptors: a "person" is a random direction; the same person again is a
// small nudge of it. Human's own similarity puts nudges well above 0.5 and
// strangers well below.
const person = (seed) => {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647) - 0.5;
  return Array.from({ length: 1024 }, () => rnd() * 2);
};
const again = (d, amt = 0.2) => d.map((v, i) => v + Math.sin(i * 7.1) * amt);
const PHOTO = (tag) => `data:image/jpeg;base64,/9j/${Buffer.from("photo-" + tag).toString("base64")}`;

function rig() {
  const models = { FaceTemplate: collection(), ProfilePhoto: collection(), PendingPhotoChange: collection() };
  const sent = [];
  let clock = Date.parse("2026-11-07T06:00:00Z");
  const live = lib.createLivePhoto({
    models,
    faceCrypto,
    validateProfilePhoto: (p) => (typeof p === "string" && p.startsWith("data:image/jpeg;base64,")
      ? { ok: true, dataUrl: p, mimeType: "image/jpeg", bytes: p.length }
      : { ok: false, status: 400, code: "invalid_photo", message: "bad" }),
    checkPin: async (_user, pin) => (pin === "246813" ? { ok: true } : { ok: false, status: 401, message: "That PIN is wrong." }),
    notify: async (user, n) => sent.push({ userId: String(user._id), ...n }),
    now: () => clock,
  });
  const post = async (userId, body) => {
    let status = 200, json = null;
    const res = { status(s) { status = s; return res; }, json(j) { json = j; return res; }, set() { return res; } };
    await live.postLivePhoto({ authUser: { _id: userId }, body }, res);
    return { status, body: json };
  };
  const call = async (fn, userId) => {
    let json = null;
    const res = { json(j) { json = j; return res; }, status() { return res; } };
    await live[fn]({ authUser: { _id: userId } }, res);
    return json;
  };
  return { models, sent, live, post, call, tick: (ms) => { clock += ms; } };
}

test("Human's similarity: the same person is 0.5 or more, a stranger less", () => {
  const a = person(11);
  assert.ok(lib.humanSimilarity(a, again(a)) >= 0.5, String(lib.humanSimilarity(a, again(a))));
  assert.ok(lib.humanSimilarity(a, person(99)) < 0.5, String(lib.humanSimilarity(a, person(99))));
  assert.equal(lib.humanSimilarity(a, a), 1);
});

test("a first live photo is saved and becomes the account's face, encrypted", async () => {
  const r = rig();
  const out = await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL, method: "speech" });
  assert.equal(out.status, 200);
  assert.equal(out.body.status, "saved");
  assert.equal(out.body.faceChecks, true);
  assert.equal(r.models.ProfilePhoto.rows[0].dataUrl, PHOTO("a"));
  const t = r.models.FaceTemplate.rows[0];
  assert.ok(t.ciphertext && t.iv && t.authTag);
  assert.ok(!JSON.stringify(t).includes(String(person(1)[0])), "descriptor must not be stored in the clear");
  assert.ok(!JSON.stringify(out.body).includes("ciphertext"));
});

test("the same face on a second account is refused", async () => {
  const r = rig();
  await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
  const out = await r.post("u2", { photo: PHOTO("b"), descriptor: again(person(1)), model: MODEL });
  assert.equal(out.status, 409);
  assert.equal(out.body.code, "face_taken");
  assert.equal(r.models.ProfilePhoto.rows.length, 1, "nothing saved for the second account");
  // A different person is fine.
  const ok = await r.post("u2", { photo: PHOTO("c"), descriptor: person(2), model: MODEL });
  assert.equal(ok.status, 200);
});

test("the same person retaking their photo is live at once", async () => {
  const r = rig();
  await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
  const out = await r.post("u1", { photo: PHOTO("a2"), descriptor: again(person(1)), model: MODEL });
  assert.equal(out.status, 200);
  assert.equal(r.models.ProfilePhoto.rows[0].dataUrl, PHOTO("a2"));
});

test("a different face needs the PIN, then waits 24 hours with a notification", async () => {
  const r = rig();
  await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
  const ask = await r.post("u1", { photo: PHOTO("x"), descriptor: person(5), model: MODEL });
  assert.equal(ask.status, 403);
  assert.equal(ask.body.code, "different_face_needs_pin");
  const wrong = await r.post("u1", { photo: PHOTO("x"), descriptor: person(5), model: MODEL, pin: "111111" });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.code, "wrong_pin");
  const ok = await r.post("u1", { photo: PHOTO("x"), descriptor: person(5), model: MODEL, pin: "246813" });
  assert.equal(ok.status, 202);
  assert.equal(ok.body.status, "pending");
  assert.equal(r.models.ProfilePhoto.rows[0].dataUrl, PHOTO("a"), "old photo stays until the wait is over");
  assert.equal(r.sent.at(-1).event, "photo_change_pending");

  r.tick(23 * 3600 * 1000);
  assert.equal(await r.live.applyDue({ _id: "u1" }), false);
  assert.equal((await r.call("getPending", "u1")).pending.photo, PHOTO("x"));

  r.tick(2 * 3600 * 1000);
  assert.equal(await r.live.applyDue({ _id: "u1" }), true);
  assert.equal(r.models.ProfilePhoto.rows[0].dataUrl, PHOTO("x"));
  assert.equal(r.models.PendingPhotoChange.rows.length, 0);
  assert.equal(r.sent.at(-1).event, "photo_change_live");
  // The new face is now the account's face.
  const same = await r.post("u1", { photo: PHOTO("x2"), descriptor: again(person(5)), model: MODEL });
  assert.equal(same.status, 200);
});

test("the owner can cancel a waiting change, and a fresh photo of the owner cancels it too", async () => {
  const r = rig();
  await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
  await r.post("u1", { photo: PHOTO("x"), descriptor: person(5), model: MODEL, pin: "246813" });
  assert.equal((await r.call("cancelPending", "u1")).cancelled, true);
  r.tick(25 * 3600 * 1000);
  assert.equal(await r.live.applyDue({ _id: "u1" }), false);
  assert.equal(r.models.ProfilePhoto.rows[0].dataUrl, PHOTO("a"));

  await r.post("u1", { photo: PHOTO("y"), descriptor: person(6), model: MODEL, pin: "246813" });
  await r.post("u1", { photo: PHOTO("a3"), descriptor: again(person(1)), model: MODEL });
  assert.equal(r.models.PendingPhotoChange.rows.length, 0);
});

test("a face waiting out its 24 hours on one account can't be used on another", async () => {
  const r = rig();
  await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
  await r.post("u1", { photo: PHOTO("x"), descriptor: person(5), model: MODEL, pin: "246813" });
  const out = await r.post("u2", { photo: PHOTO("b"), descriptor: again(person(5)), model: MODEL });
  assert.equal(out.status, 409);
});

test("bad input is refused before anything is stored", async () => {
  const r = rig();
  for (const body of [
    { photo: "nope", descriptor: person(1), model: MODEL },
    { photo: PHOTO("a"), descriptor: [1, 2, 3], model: MODEL },
    { photo: PHOTO("a"), descriptor: person(1).map((v, i) => (i === 3 ? NaN : v)), model: MODEL },
    { photo: PHOTO("a"), descriptor: person(1), model: "" },
  ]) {
    const out = await r.post("u1", body);
    assert.equal(out.status, 400, JSON.stringify(out.body));
  }
  assert.equal(r.models.ProfilePhoto.rows.length + r.models.FaceTemplate.rows.length, 0);
});

test("without an encryption key the photo is saved and the response says no face checks ran", async () => {
  const key = process.env.FACE_ENCRYPTION_KEY;
  delete process.env.FACE_ENCRYPTION_KEY;
  try {
    const r = rig();
    const out = await r.post("u1", { photo: PHOTO("a"), descriptor: person(1), model: MODEL });
    assert.equal(out.status, 200);
    assert.equal(out.body.faceChecks, false);
    assert.equal(r.models.FaceTemplate.rows.length, 0);
  } finally {
    process.env.FACE_ENCRYPTION_KEY = key;
  }
});

test("server.js wires the routes, skips the 64 KB parser for them, and guards the old upload", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /livePhotoLib\.registerLivePhotoRoutes\(app,/);
  assert.match(src, /req\.method === 'POST' && livePhotoLib\.LIVE_PHOTO_PATH\.test\(req\.path\)/);
  assert.match(src, /code: 'live_photo_required'/);
  assert.match(src, /await livePhoto\.applyDue\(user\);\s*const stored = await ProfilePhoto/);
  assert.ok(lib.LIVE_PHOTO_PATH.test("/api/profile/abc/live-photo"));
  assert.ok(!lib.LIVE_PHOTO_PATH.test("/api/profile/abc/live-photo/pending"));
});
