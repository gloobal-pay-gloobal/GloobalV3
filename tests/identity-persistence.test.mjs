// tests/identity-persistence.test.mjs
//
// Four reported faults, all in the same area: things about WHO an account is
// that either pointed at the wrong identity or did not survive a re-login.
//
//   1. The referral share offered an ID that was not the account's Gloobal ID.
//   2. The Gloobal ID update history was empty again after every login.
//   3. Personal Details never showed the account's mobile number.
//   4. The first profile photo persisted; every later one was lost on reload.
//
// Three of the four are the same shape of mistake: state that was only ever
// held in memory, or read from the wrong source, when the durable copy
// already existed. The backend was recording the ID history the whole time;
// the photo had a storage helper that the change handler never called.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const app = readSource("frontend/App.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const server = readSource("server/server.js");

describe("1. the referral link identifies the account, not the persona", () => {
  test("it is built from the personal Gloobal ID", () => {
    // shareableGloobalId becomes the Creator ID in Creator mode. A referral
    // belongs to the account: the network is fetched with the personal ID,
    // /r/:symbolId resolves a real user by that field, and referralCount is
    // counted against it. Sharing the Creator ID handed people a code that
    // identifies no account at all.
    assert.match(
      dash,
      /const referralLink = `\$\{GLOOBAL_API_BASE\}\/r\/\$\{encodeURIComponent\(personalGloobalId\)\}`/,
      "the referral link must carry the account's own Gloobal ID"
    );
  });

  test("it is NOT built from the role-aware id", () => {
    const at = dash.indexOf("const referralLink =");
    const line = dash.slice(at, dash.indexOf("\n", at));
    assert.ok(!/shareableGloobalId/.test(line), "referralLink must not use shareableGloobalId");
  });

  test("the ID shown on screen is still allowed to be role-aware", () => {
    // Deliberately unchanged: the displayed ID and the QR legitimately switch
    // to the Creator ID, because scanning the two means different things.
    // Only the REFERRAL link was wrong.
    assert.match(dash, /const shareableGloobalId = shareRole === "merchant"/);
  });
});

describe("2. the Gloobal ID update history outlives the session", () => {
  test("the server sends what each ID was renamed to", () => {
    // Stored on every rename since renames were first recorded, but never
    // serialized — so a client could only reconstruct the succession by
    // assuming the entries were contiguous and in order.
    const at = server.indexOf("const serializeSymbolIdHistory = (user) => {");
    assert.ok(at > 0, "serializeSymbolIdHistory not found");
    const fn = server.slice(at, at + 1400);
    assert.match(fn, /replacedBy: entry\.replacedBy \|\| null/);
  });

  test("the client reads the server's record", () => {
    assert.match(app, /idHistory=\{\(registeredUser && registeredUser\.symbolIdHistory\) \|\| \[\]\}/);
    assert.match(dash, /const serverIdHistory = useMemo5\(/);
  });

  test("the screen renders the combined list, not just this session's", () => {
    // The whole bug: the screen read a state array that starts empty on every
    // mount. If it ever reads that alone again, this fails.
    assert.match(dash, /\{combinedIdHistory\.length === 0 \?/);
    assert.match(dash, /\{combinedIdHistory\.map\(\(h, i\) => \{/);
    assert.ok(
      !/\{idUpdateHistory\.(map|length)/.test(dash),
      "the Update History screen must not read the session-only list directly"
    );
  });

  test("this session's own renames still appear immediately", () => {
    // A rename must show up before any reload has fetched it back, so the
    // in-session list is kept and merged rather than replaced.
    assert.match(dash, /setIdUpdateHistory\(\(h\) => \[/);
    assert.match(dash, /idUpdateHistory\s*\n?\s*\.concat\(serverIdHistory\)/);
  });

  test("a rename is not listed twice once the server also reports it", () => {
    assert.match(dash, /const key = `\$\{h\.previousId\}->\$\{h\.id\}`/);
  });

  test("the account's original ID is not shown as a rename", () => {
    // The 'created' entry has no replacedBy: it records the account coming
    // into existence, which is not an update.
    assert.match(dash, /\.filter\(\(entry\) => entry && entry\.replacedBy && entry\.symbolId\)/);
  });
});

describe("3. personal details shows the mobile number", () => {
  test("the number is passed in from the session", () => {
    assert.match(app, /mobileNumber=\{fullMobileNumber\}/);
    assert.match(dash, /mobileNumber = ""/);
  });

  test("it is rendered as a row, and omitted when there isn't one", () => {
    // An empty row reading "Mobile —" is worse than no row.
    assert.match(dash, /\.\.\.\(mobileNumber \? \[\["Mobile", mobileNumber\]\] : \[\]\)/);
  });
});

describe("4. an updated profile photo is written, not just displayed", () => {
  test("the change handler persists as well as sets state", () => {
    // Was `onChangeProfilePhoto={setProfilePhoto}` — state only. The first
    // photo appeared to stick only because the documentation step calls
    // persistLocalProfile right after it.
    const at = app.indexOf("const handleChangeProfilePhoto = (photo) => {");
    assert.ok(at > 0, "handleChangeProfilePhoto not found");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /setProfilePhoto\(photo\)/);
    assert.match(fn, /persistLocalProfile\(symbolId, documentedName\.trim\(\), photo\)/);
  });

  test("it writes under the account's current id", () => {
    const at = app.indexOf("const handleChangeProfilePhoto = (photo) => {");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /\(registeredUser && registeredUser\.symbolId\) \|\| secureId/);
  });

  test("the Dashboard is wired to the persisting handler", () => {
    assert.match(app, /onChangeProfilePhoto=\{handleChangeProfilePhoto\}/);
    // Comments stripped first. handleChangeProfilePhoto's own comment quotes
    // the old `onChangeProfilePhoto={setProfilePhoto}` to explain what was
    // wrong with it, and grepping that prose as if it were code makes the
    // explanation of the bug look like the bug. (Third time in this project;
    // strip comments before asserting a thing is ABSENT.)
    const appCode = app.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/onChangeProfilePhoto=\{setProfilePhoto\}/.test(appCode),
      "the raw state setter must not be passed as the photo handler"
    );
  });

  test("it does nothing rather than writing under a missing id", () => {
    // Writing to `gloobal.profile.undefined` would be a photo nobody can
    // ever read back, and would look identical to the bug being fixed.
    const at = app.indexOf("const handleChangeProfilePhoto = (photo) => {");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /if \(symbolId\) persistLocalProfile/);
  });
});
