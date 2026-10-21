// tests/pin-pad.test.mjs
//
//   node --test tests/pin-pad.test.mjs
//
// The PIN pad, and the two things it was getting wrong.
//
// ── A MASKED PIN THAT WAS NOT MASKED ───────────────────────────────────
//
// A PIN screen draws six boxes, masks them, and puts an eye above them
// to reveal them. The pad underneath then printed the same PIN as plain
// text two centimetres below — "999 999" — whatever the eye said,
// because the eye had never been passed down to it. It had been in
// front of everybody for exactly as long as the screen had existed.
//
// ── A PAD THAT GAVE NO SIGN OF WORKING ─────────────────────────────────
//
// The API sleeps on Render's free plan and takes 20 to 50 seconds to
// wake. The pad had visibly accepted six digits and then did nothing
// for most of a minute, so people typed them again — which is how a
// slow login becomes a failed one.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const PAD = "frontend/components/inputs/dialPads.jsx";
const AUTH = "frontend/components/dialogs/registerLogin.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const APP = "frontend/App.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

describe("a PIN is not printed under the pad", () => {
  const pad = strip(readSource(PAD));
  const auth = strip(readSource(AUTH));

  test("every screen that masks its boxes also silences the pad", () => {
    // Three of them: setting a PIN, signing in with one, and the modal
    // that stands in for a fingerprint. All three mask the boxes above
    // the pad, so all three must stop the pad repeating the value.
    const calls = auth.split("<PhoneDialPad").slice(1).map((tail) => tail.slice(0, tail.indexOf("/>")));
    assert.equal(calls.length, 3, `expected three PIN pads, found ${calls.length}`);
    for (const call of calls) {
      assert.match(call, /showValue=\{false\}/,
        `a PIN screen prints its PIN under the pad: ${call.slice(0, 80)}`);
    }
  });

  test("the digits still show where the digits are the point", () => {
    // A phone number and an OTP are not secrets being typed in public.
    assert.match(pad, /showValue = true/, "the default stopped being 'show'");
  });

  test("the mask covers the value, not just the boxes", () => {
    // The guard is on the whole value line, before the mask branch, so
    // there is no path that prints it.
    assert.match(pad, /\{!showValue \? null : maskable \?/,
      "the value line can still be reached on a screen that asked for it to be gone");
  });
});

describe("the pad sends itself, once", () => {
  const pad = strip(readSource(PAD));
  const effect = pad.slice(pad.indexOf("const sentRef"), pad.indexOf("const DOT_COLORS"));

  test("it sends when the last digit lands", () => {
    assert.match(effect, /if \(value\.length !== maxLength\)/);
    assert.match(effect, /sentRef\.current = value;\s*\n\s*onSubmit\(\);/);
  });

  test("it does not send the same six digits twice", () => {
    // Keyed on the VALUE, not a boolean. A flag would latch after the
    // first send and the pad would go quiet on the correction.
    assert.match(effect, /if \(sentRef\.current === value\) return;/);
    assert.match(effect, /if \(value\.length < maxLength\) sentRef\.current = "";/,
      "a deleted digit does not re-arm the pad, so a corrected PIN never sends");
  });

  test("busy is NOT a dependency of that effect", () => {
    // If it were, the effect would re-run the moment a request finished
    // and send the same six digits again — the exact double-submit this
    // is here to prevent.
    const deps = effect.slice(effect.lastIndexOf("}, ["));
    assert.doesNotMatch(deps, /busy/, "finishing a request re-sends the PIN");
    assert.match(deps, /\[value, maxLength, autoSubmit, onSubmit\]/);
  });

  test("only the PIN screens opt in", () => {
    // A phone number is not complete at its maximum length — several
    // countries are shorter — so sending on the last digit would send
    // the wrong number.
    assert.match(pad, /autoSubmit = false/, "every pad in the app now submits itself");
  });
});

describe("the pad says what is happening", () => {
  const pad = strip(readSource(PAD));

  test("the keys are disabled, not merely ignored", () => {
    // press() already ignored them. A pad that still LOOKS live is a
    // pad people keep pressing, which was the whole complaint.
    assert.match(pad, /if \(busy\) return;/, "a key press during the wait does something again");
    assert.match(pad, /disabled=\{busy\}/, "the keys stay lit while the server thinks");
    assert.match(pad, /opacity: busy \? 0\.45 : 1/);
  });

  test("the submit key becomes the status and is never removed", () => {
    // It keeps the 3x4 grid square, and it is where a person is already
    // looking when they finish typing.
    assert.match(pad, /aria-label=\{busy \? "Checking your PIN" : done \? "Accepted" : "Log in"\}/);
    assert.match(pad, /aria-busy=\{busy \? "true" : void 0\}/);
    assert.match(pad, /className="dial-in-wait"/, "there is nothing to watch while it waits");
  });

  test("the wait animation stops for people who asked for less motion", () => {
    assert.match(pad, /prefers-reduced-motion: reduce[\s\S]{0,200}dial-in-wait/,
      "the pulsing dots ignore prefers-reduced-motion");
  });

  test("a tap on the key is still harmless", () => {
    // autoSubmit has already sent that value, and canSubmit is false
    // while busy — so the key cannot send a second time.
    assert.match(pad, /const canSubmit = !busy && !!onSubmit/);
  });
});

describe("the fingerprint asks without being asked", () => {
  const auth = strip(readSource(AUTH));
  const screen = auth.slice(auth.indexOf("function BiometricVerifyScreen"), auth.indexOf("const CONTENT_TYPES"));

  test("it fires once, on arrival", () => {
    assert.match(screen, /const \[autoTried, setAutoTried\] = useState6\(false\);/);
    assert.match(screen, /if \(autoTried \|\| !onVerify\) return;/,
      "it can fire more than once");
    assert.match(screen, /setTimeout\(\(\) => \{ onVerify\(\); \}, 350\);/,
      "the prompt fires in the same commit that mounts the screen");
  });

  test("it does not insist", () => {
    // A cancelled prompt is a decision. Nothing retries it.
    assert.doesNotMatch(screen, /catch[\s\S]{0,120}onVerify\(\)/,
      "a declined prompt is put straight back");
  });

  test("the button stays, and says it is the second try", () => {
    // Browsers may refuse a passkey call that no tap started, and the
    // refusal is silent — so the button is the only way back.
    assert.match(auth, /\? "Try again"/, "a refused auto-attempt leaves a dead end");
    assert.match(auth, /: "Verify"/, "the first visit already calls it a retry");
  });
});

describe("My Choices is behind the same check as everything else", () => {
  const dash = strip(readSource(DASH));
  const app = strip(readSource(APP));

  test("the tab asks before it opens", () => {
    assert.match(dash, /const ok = await requireBiometric\(\{\s*\n\s*pinReason: "Confirm it's you to open My Choices\."/,
      "the Choices tab opens without a check");
    assert.match(dash, /onClick=\{openChoices\}/, "the tab bar still switches straight to it");
  });

  test("it is the shared gate, not a private one", () => {
    // requireBiometric is the passkey where there is one and
    // POST /api/pin/verify where there is not, so an account with
    // biometrics switched off is checked exactly as strictly.
    assert.doesNotMatch(dash, /choicesUnlocked = true[^;]*;\s*\n\s*setActiveTab\("choices"\);\s*\n\s*\}\s*catch/,
      "a failed check still opens the tab");
    assert.match(dash, /if \(!ok\) return;/, "declining the check opens it anyway");
  });

  test("once per session, not once per tap", () => {
    // Asking every time somebody crosses the tab bar is a prompt people
    // learn to clear without reading.
    assert.match(dash, /if \(choicesUnlocked\) \{ setActiveTab\("choices"\); return; \}/);
    assert.match(dash, /if \(choicesChecking\) return;/, "two taps start two checks");
  });

  test("the app map goes through the gate too", () => {
    // A second door into a guarded room is how a guard gets bypassed,
    // and the map is a list of doors.
    assert.match(dash, /else if \(deepLinkTarget === "choices"\) openChoices\(\);/,
      "the map opens Choices without the check");
  });
});

describe("the map knows about every screen", () => {
  const app = strip(readSource(APP));
  const entries = app.slice(app.indexOf("const appMapEntries = ["), app.indexOf("const effectiveLoginCountry"));

  test("My Choices and My Essentials are on it", () => {
    // Choices is a whole tab of the app and was on no branch of the
    // map; Essentials was reachable only from inside Accounts.
    assert.match(entries, /key: "choices"[\s\S]{0,140}label: "My Choices"/,
      "a tab of the app is missing from the map of the app");
    assert.match(entries, /key: "essentials"[\s\S]{0,140}label: "My Essentials"/);
  });

  test("they sit where they belong", () => {
    // Neither moves money: one is a reading of where it went, the other
    // is what an account is for.
    assert.match(entries, /key: "choices", section: "Your money"/);
    assert.match(entries, /key: "essentials", section: "Your money"/);
  });

  test("they are locked before there is an account, like their neighbours", () => {
    const choices = entries.slice(entries.indexOf('key: "choices"'));
    assert.match(choices.slice(0, 200), /locked: !everRegistered/,
      "the map offers a signed-out visitor somebody's spending");
  });

  test("the dashboard can actually reach both", () => {
    const dash = strip(readSource(DASH));
    assert.match(dash, /else if \(deepLinkTarget === "essentials"\) setShowEssentials\(true\);/,
      "the map has an entry that goes nowhere");
  });
});
