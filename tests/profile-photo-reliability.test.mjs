// tests/profile-photo-reliability.test.mjs
//
// Saving a profile photo, and being told the truth about whether it saved.
//
// ── The report ───────────────────────────────────────────────────────────
//
// "Profile photo is not saving after updating." The photo's own plumbing
// turned out to be sound — server/tests/profile-photo.test.mjs proves the
// route stores, replaces, removes and re-reads it against a real database,
// and the happy path below proves the screen keeps it across a reload and a
// sign-out. What was NOT sound was what happened when the save failed.
//
// The picture was shown the instant it was picked, written to the local
// cache, and the upload was fired and never looked at again:
//
//   if (symbolId) pushOwnProfilePhoto(symbolId, photo);   // no await
//   ...
//   () => false                                           // every failure
//
// So a photo that never reached the server looked exactly like one that did.
// On that device it was the account's photo — on every other device, and to
// anyone scanning the account, it did not exist. Three ways in:
//
//   1. an image that could not be downscaled under the 200KB cap was given
//      up on permanently, pending flag cleared, never retried
//   2. any network failure resolved `false` in silence — and Render's free
//      tier takes 20-50s to wake, which lands exactly here
//   3. the once-per-session sync retired itself after one failed attempt
//
// These assert the fix: the answer is waited for, a failure is said out
// loud, an unsendable picture is put back rather than left masquerading as
// saved, and a transient failure stays pending and is retried.
//
//   node --test tests/profile-photo-reliability.test.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOnce, openPage, teardown, login, ACCOUNTS } from "./browser-harness.mjs";

const A = ACCOUNTS.india;

// An 8x8 PNG. The client re-encodes whatever it is handed to JPEG through a
// canvas, so what lands on the server is a JPEG either way.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoU2P8z8Dwn4EIwDiqkGGoKPz//z9RYQkAlvMV8Vtr1O0AAAAASUVORK5CYII=";

let photoFile = "";

before(async () => {
  await buildOnce();
  photoFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-photo-")), "avatar.png");
  fs.writeFileSync(photoFile, Buffer.from(PNG_B64, "base64"));
});

after(async () => {
  await teardown();
});

// The photo controls live on the Profile tab, not the home tab.
async function openProfileTab(page) {
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("button, a, div, span")].find(
      (n) => n.textContent.trim() === "Profile" && n.querySelector("svg")
    );
    if (el) el.click();
  });
  await page.waitForTimeout(1500);
}

// Is the account's own uploaded photo on screen? The fallback is the G mark,
// so "a JPEG is being displayed" is the question — the client always
// re-encodes to JPEG, and nothing else on these screens is one.
function photoOnScreen(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("img")].some((i) =>
      String(i.getAttribute("src") || "").startsWith("data:image/jpeg")
    )
  );
}

// The toast clears itself after 1800ms, so it is watched for rather than
// read after the fact — a poll that starts late sees an empty screen and
// cannot tell "said nothing" from "said it and moved on".
async function watchToasts(page) {
  await page.evaluate(() => {
    window.__toasts = [];
    const seen = new Set();
    const sweep = () => {
      const text = document.body.innerText || "";
      for (const re of [/Photo updated/, /Couldn't save your photo[^\n]*/, /couldn't be prepared[^\n]*/]) {
        const m = text.match(re);
        if (m && !seen.has(m[0])) {
          seen.add(m[0]);
          window.__toasts.push(m[0]);
        }
      }
    };
    window.__toastSweep = setInterval(sweep, 100);
  });
}

function toastsSeen(page) {
  return page.evaluate(() => (window.__toasts || []).join(" | "));
}

// What the SERVER holds — the only authority. Asked with the session's own
// bearer token, through the same route the app uses.
function serverPhoto(page) {
  return page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem("gloobal.session.v1") || "{}");
    const id = s.user && s.user.symbolId;
    const r = await fetch(`https://gloobal-pay.onrender.com/api/users/${encodeURIComponent(id)}/photo`, {
      headers: { Authorization: `Bearer ${s.token}` }
    });
    const j = await r.json();
    return j.photo || null;
  });
}

function pendingFlag(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k.startsWith("gloobal.profilePhotoPending.")) return localStorage.getItem(k);
    }
    return null;
  });
}

// Sign out, the way tests/browser.test.mjs does it: the control reads
// "Exit", and signing out lands on REGISTRATION rather than on login — the
// device has been handed back to nobody in particular — so getting back to
// the PIN screen costs a flip.
async function signOut(page) {
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  const exit = page.getByRole("button", { name: /^Exit$/i }).first();
  await exit.waitFor({ timeout: 20000 });
  await exit.evaluate((node) => node.click());
  const flip = page.getByLabel("Flip to log in", { exact: true });
  await flip.waitFor({ timeout: 25000 });
  await flip.evaluate((node) => node.click());
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
}

// Sign back in from that registration screen, the way
// tests/browser.test.mjs's loginAsAnotherAccount does: the ID field is
// empty after a real sign-out, so the Gloobal ID is entered symbol by
// symbol before the PIN.
async function signInAfterSignOut(page, account) {
  for (let i = 0; i < 12; i += 1) {
    await page.getByLabel("Delete last symbol", { exact: true }).click({ force: true });
  }
  for (const symbol of account.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByLabel("Log in", { exact: true }).click({ force: true });
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of account.pin) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ force: true });
  }
  await page.getByLabel("Log in", { exact: true }).click({ force: true });
  await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 30000 });
}

async function choosePhoto(page) {
  await page.locator('input[type="file"]').first().setInputFiles(photoFile);
  await page.waitForTimeout(2500);
}

describe("a photo that saves", () => {
  test("it reaches the server, says so, and survives a reload and a sign-out", async () => {
    const { page, context } = await openPage({ account: A });
    await login(page, A);
    await openProfileTab(page);

    assert.equal(await photoOnScreen(page), false, "the account starts on the fallback mark");
    assert.equal(await serverPhoto(page), null, "the account starts with no photo on the server");

    await watchToasts(page);
    await choosePhoto(page);

    // 1-3. The server has it, and the screen says it saved rather than
    // merely showing it.
    const saved = await serverPhoto(page);
    assert.ok(saved && saved.startsWith("data:image/jpeg"), `the server did not get the photo: ${saved}`);
    assert.equal(await photoOnScreen(page), true);
    assert.match(await toastsSeen(page), /Photo updated/);
    // Nothing is left pending once the server has confirmed it.
    assert.equal(await pendingFlag(page), null, "a confirmed save is still marked pending");

    // 4. Reload. A reload lands on the PIN screen, so re-entering it IS the
    // refresh path a person takes.
    await page.reload();
    await page.waitForTimeout(2000);
    await login(page, A);
    await openProfileTab(page);
    assert.equal(await photoOnScreen(page), true, "the photo did not survive a reload");

    // 5. And a real sign-out/sign-in. The control is labelled "Exit".
    await signOut(page);
    await signInAfterSignOut(page, A);
    await openProfileTab(page);
    await page.waitForTimeout(2500);
    assert.equal(await photoOnScreen(page), true, "the photo did not survive a sign-out");
    assert.ok((await serverPhoto(page)) === saved, "the server copy changed across the session");

    await context.close();
  });

  test("with the local cache wiped, the photo comes back from the server", async () => {
    // 6. The cache-is-only-a-cache property. The fake API's state lives in
    // the browser context, so a second context is a different server too —
    // the way to ask this question within one context is to throw the cache
    // away and see the photo return anyway. What is left to hydrate from is
    // GET /api/users/:symbolId/photo and nothing else.
    const { page, context } = await openPage({ account: A });
    await login(page, A);
    await openProfileTab(page);
    await choosePhoto(page);
    assert.ok(await serverPhoto(page), "the photo never reached the server");

    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("gloobal.profile.")) localStorage.removeItem(k);
      }
    });
    assert.equal(
      await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("gloobal.profile.")).length),
      0,
      "the cache was not actually cleared"
    );

    await page.reload();
    await page.waitForTimeout(2000);
    await login(page, A);
    await openProfileTab(page);
    await page.waitForTimeout(2500);
    assert.equal(await photoOnScreen(page), true, "with no cache, the photo was not hydrated from the server");
    await context.close();
  });

  test("an account with no photo shows the fallback mark", async () => {
    // 7. The fallback still works — a missing photo is not an error state.
    const { page, context } = await openPage({ account: ACCOUNTS.britain });
    await login(page, ACCOUNTS.britain);
    await openProfileTab(page);
    assert.equal(await serverPhoto(page), null);
    assert.equal(await photoOnScreen(page), false, "an account with no photo is not on the fallback");
    await context.close();
  });
});

describe("a photo that does NOT save", () => {
  test("the failure is said out loud, stays pending, and is retried until it sticks", async () => {
    const B = ACCOUNTS.india2;
    const { page, context } = await openPage({ account: B });

    // 7. Force the save to fail the way a cold Render instance does: the
    // request never completes.
    await page.route("**/api/profile/**/photo", (route) => route.abort("failed"));

    await login(page, B);
    await openProfileTab(page);
    assert.equal(await serverPhoto(page), null, "this account should start with no photo");

    await watchToasts(page);
    await choosePhoto(page);

    // The screen must NOT claim it saved.
    const said = await toastsSeen(page);
    assert.doesNotMatch(said, /Photo updated/, "a failed save reported success");
    assert.match(said, /Couldn't save your photo/, "a failed save said nothing at all");
    // 8. Still nothing on the server, and the attempt is remembered.
    assert.equal(await serverPhoto(page), null, "the server got a photo the request never delivered");
    assert.equal(await pendingFlag(page), "1", "a failed save was not left pending for a retry");

    // 9. The retry. Let the route through and come back to the dashboard.
    await page.unroute("**/api/profile/**/photo");
    await page.reload();
    await page.waitForTimeout(2000);
    await login(page, B);
    await openProfileTab(page);
    await page.waitForTimeout(2500);

    const after = await serverPhoto(page);
    assert.ok(after && after.startsWith("data:image/jpeg"), `the pending photo was never retried: ${after}`);
    assert.equal(await pendingFlag(page), null, "the pending mark survived a successful retry");
    assert.equal(await photoOnScreen(page), true);

    await context.close();
  });
});
