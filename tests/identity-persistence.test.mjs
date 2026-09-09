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

// The whole referralLink expression, however many lines it spans. It used
// to be one line and is now a ternary over three, and a test that reads to
// the first newline would silently stop checking the branch that matters.
const referralLinkExpression = (() => {
  const at = dash.indexOf("const referralLink =");
  assert.ok(at > 0, "referralLink not found in Dashboard.jsx");
  const end = dash.indexOf(";", dash.indexOf("`", at));
  return dash.slice(at, end + 1);
})();

describe("1. the referral link identifies the account, not the persona", () => {
  test("it is built from this account's own short referral code", () => {
    // The link used to carry the Gloobal ID itself, which percent-encodes to
    // 84 characters because every dial-pad symbol is multi-byte UTF-8. It now
    // carries the short ASCII code the server mints per account
    // (ensureReferralCode in server.js), which resolves to exactly the same
    // account — see server/tests/referral-short-link.test.mjs.
    assert.match(
      referralLinkExpression,
      /referralCode/,
      "the referral link must be built from the account's short referral code"
    );
    assert.match(
      referralLinkExpression,
      /\$\{GLOOBAL_API_BASE\}\/r\//,
      "it must still point at the backend's /r/ route"
    );
  });

  test("its fallback is the account's own Gloobal ID", () => {
    // referralCode arrives on the account payload, so it is empty until the
    // server has answered once. The fallback covers that window — and it has
    // to be the PERSONAL id for the same reason the primary path does.
    assert.match(
      referralLinkExpression,
      /personalGloobalId/,
      "the fallback must carry the account's own Gloobal ID"
    );
  });

  test("it is NOT built from the role-aware id", () => {
    // shareableGloobalId becomes the Creator ID in Creator mode. A referral
    // belongs to the account: the network is fetched with the personal ID,
    // /r/ resolves a real user, and referralCount is counted against it.
    // Sharing the Creator ID handed people a code that identifies no account
    // at all. Checked across the WHOLE expression, not just its first line.
    assert.ok(
      !/shareableGloobalId/.test(referralLinkExpression),
      "referralLink must not use shareableGloobalId"
    );
  });

  test("the displayed ID is now the account's own too", () => {
    // This used to assert the opposite: that the displayed ID legitimately
    // switched to a separate Creator ID. That Creator ID turned out to be a
    // random client-side value registered with nothing (see
    // qr-panel-and-identity.test.mjs), so both roles now show the account's
    // real Gloobal ID — which is what the referral link had always needed.
    assert.match(dash, /const shareableGloobalId = personalGloobalId;/);
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
