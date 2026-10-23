// tests/choice-names-hidden.test.mjs
//
//   node --test tests/choice-names-hidden.test.mjs
//
// The choices strip on the Send screen, and the four faults reported
// against it.
//
// ── WHAT THE EYE WAS ACTUALLY DOING ─────────────────────────────────────
//
// The report was "verification of my choice is not good, sometimes it ask
// sometimes ask but I can entre without verification". The truth was
// simpler and worse: this control had NO check on it at all. The whole
// handler was
//
//     onClick={() => setChoiceNamesHidden((v) => !v)}
//
// What sometimes asked was the DASHBOARD's balance eye — a different
// control, in a different file, which does go through requireBiometric.
// So the founder was comparing two controls that looked the same and
// behaved differently, and the inconsistency was real even though the
// "sometimes" was not.
//
// The other three: the strip opened VISIBLE, every hidden tile wore the
// same character, and the "for <choice>" line printed a bare name while
// every tile beside it drew a picture.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const MASK = "frontend/components/common/balanceMask.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const send = readSource(SEND);
const mask = readSource(MASK);

describe("the names start hidden", () => {
  test("the strip opens masked, not visible", () => {
    // A mask you have to switch on has already failed by the time you
    // think to switch it on. The private names are exactly the ones
    // nobody remembers to hide before opening the screen in company.
    assert.match(strip(send), /const \[choiceNamesHidden, setChoiceNamesHidden\] = useState15\(true\);/,
      "the choices strip opens with the names readable again");
  });

  test("and nothing remembers the reveal past the screen", () => {
    // The founder chose "until you leave the Send screen". The screen is
    // conditionally rendered by App.jsx, so unmounting resets the state —
    // which only holds while nobody writes it somewhere that outlives the
    // mount. This is the test that fails the day somebody "helpfully"
    // persists it.
    const body = strip(send);
    const at = body.indexOf("choiceNamesHidden");
    const region = body.slice(at, at + 4000);
    assert.doesNotMatch(region, /localStorage|sessionStorage/,
      "the reveal is being persisted, so it would outlive the screen");
    assert.match(strip(readSource("frontend/App.jsx")), /activeScreen === "send" && <div/,
      "the Send screen is no longer conditionally rendered, so its state would not reset");
  });
});

describe("the eye asks who you are", () => {
  const body = strip(send);

  test("it no longer toggles on its own", () => {
    // The exact line that was the whole bug.
    assert.doesNotMatch(body, /onClick=\{\(\) => setChoiceNamesHidden\(\(v\) => !v\)\}/,
      "the eye is a bare toggle again — it reveals private names with no check");
  });

  test("showing goes through requireBiometric; hiding does not", () => {
    const at = body.indexOf("const handleToggleChoiceNames");
    assert.ok(at > 0, "the eye's handler is gone");
    const toggle = body.slice(at, body.indexOf("\n  };", at));
    // Hiding needs no permission. Only revealing does.
    assert.match(toggle, /if \(!choiceNamesHidden\)/);
    assert.match(toggle, /setShowChoiceBiometric\(true\)/);

    const verifyAt = body.indexOf("const handleChoiceBiometricVerify");
    assert.ok(verifyAt > 0, "the verify handler is gone");
    const verify = body.slice(verifyAt, body.indexOf("\n  };", verifyAt));
    assert.match(verify, /await requireBiometric\(/);
    assert.match(verify, /setChoiceNamesHidden\(false\)/);
  });

  test("a refused check leaves the names hidden", () => {
    // Which is the entire point of putting a gate on the eye: a gate that
    // opens anyway is a prompt, not a gate.
    const verifyAt = body.indexOf("const handleChoiceBiometricVerify");
    const verify = body.slice(verifyAt, body.indexOf("\n  };", verifyAt));
    const refused = verify.slice(verify.indexOf("if (!ok)"));
    assert.doesNotMatch(refused.slice(0, refused.indexOf("}")), /setChoiceNamesHidden\(false\)/,
      "the names are revealed on a failed check");
    assert.match(verify, /names stay hidden/);
  });

  test("it is the same screen the payment uses, not a second one", () => {
    // A second kind of "prove it's you" is a second thing to get wrong,
    // and this file already renders the real one for the payment.
    assert.equal((send.match(/<BiometricVerifyScreen/g) || []).length, 2,
      "the choice gate is not using the screen the payment uses");
    assert.match(body, /showChoiceBiometric && <BiometricVerifyScreen/);
    assert.match(body, /onVerify=\{handleChoiceBiometricVerify\}/);
  });
});

describe("a character each, not one character four times", () => {
  // The pure half of the mask, sliced out and run. ChoiceNameMask ends up
  // in JSX, but the picker is arithmetic and is worth running rather than
  // pattern-matching: "are these four different" is the actual question.
  const PURE = mask.slice(mask.indexOf("var BALANCE_MASK_CAST"), mask.indexOf("var BALANCE_MASK_MARKS"));

  function load(signature) {
    let sig = signature;
    // gloobalSessionFingerprint, NOT balanceMaskSignature: the latter is
    // declared inside the slice and would shadow anything injected under
    // that name, so the fixture would silently feed it an empty salt and
    // every sign-in would deal the same hand. Same dependency
    // balance-mask.test.mjs injects, for the same reason.
    return Object.assign(
      new Function("gloobalSessionFingerprint", "window", `${PURE}
        return { BALANCE_MASK_CAST, choiceMaskPick };`)(
        () => sig,
        { localStorage: { getItem: () => null, setItem: () => {} } }
      ),
      { signIn: (next) => { sig = next; } }
    );
  }

  test("four choices get four different characters", () => {
    // The fault as reported: every hidden tile wore the same face, because
    // ChoiceNameMask asked balanceMaskPick, which answers "which character
    // is this SIGN-IN" — one answer, however many times you ask it.
    const lib = load("sig-one");
    const ids = ["c1", "c2", "c3", "c4"];
    const drawn = ids.map((id) => lib.choiceMaskPick(id));
    assert.equal(new Set(drawn).size, 4, `four choices drew ${new Set(drawn).size} character(s): ${drawn}`);
  });

  test("the same choice keeps its character while the session lasts", () => {
    // Otherwise a re-render reshuffles the row under somebody's thumb.
    const lib = load("sig-one");
    const first = lib.choiceMaskPick("c3");
    for (let i = 0; i < 40; i += 1) assert.equal(lib.choiceMaskPick("c3"), first);
  });

  test("and the whole deal changes at the next sign-in", () => {
    // The part that matters. A fixed pairing is easier to recognise, and
    // that is the problem — anyone who watches once learns that the bear
    // is Donation, and the mask then hides the name from everyone except
    // the person it is hiding from.
    const lib = load("sig-one");
    const ids = ["c1", "c2", "c3", "c4", "c5", "c6"];
    const before = ids.map((id) => lib.choiceMaskPick(id)).join("|");
    let changed = 0;
    for (let round = 0; round < 30; round += 1) {
      lib.signIn(`sig-${round}`);
      if (ids.map((id) => lib.choiceMaskPick(id)).join("|") !== before) changed += 1;
    }
    assert.ok(changed >= 28, `the deal held across ${30 - changed} of 30 sign-ins`);
  });

  test("it leaks nothing about the choice beyond telling it apart", () => {
    const lib = load("sig-one");
    // Every answer is one of the ten drawn characters and nothing else —
    // no name, no colour, no budget reaching the mask.
    for (const id of ["Darling", "Donation", "Dream", "x", "", "0"]) {
      assert.ok(lib.BALANCE_MASK_CAST.includes(lib.choiceMaskPick(id)), `${id} drew something not in the cast`);
    }
    const fn = strip(mask).slice(strip(mask).indexOf("function choiceMaskPick"));
    assert.doesNotMatch(fn.slice(0, fn.indexOf("\n}")), /name|budget|amount|total|color/i,
      "the character is being derived from something about the category");
  });

  test("both call sites pass the choice's own id", () => {
    const body = strip(send);
    assert.match(body, /<ChoiceNameMask size=\{13\} line=\{17\} seed=\{pickedChoice\.id\} \/>/,
      "the 'for <choice>' line is unseeded, so it shows the session character");
    assert.match(body, /<ChoiceNameMask size=\{15\} seed=\{category\.id\} \/>/,
      "the tiles are unseeded, so they all show the same character");
  });

  test("the balance keeps its own one-per-sign-in character", () => {
    // Seeding is opt-in. The balance has one mask and must keep asking
    // the question it has always asked.
    const face = strip(mask).slice(strip(mask).indexOf("function BalanceMaskFace"));
    assert.match(face, /seed == null \? balanceMaskPick\(\) : choiceMaskPick\(seed\)/);
    assert.match(strip(readSource("frontend/screens/Dashboard/Dashboard.jsx")),
      /<BalanceMaskFace size=\{balanceFontSize\} nudge=\{\d+\} \/>/,
      "the dashboard balance has grown a seed");
  });
});

describe("the chosen category shows its face", () => {
  test("the 'for' line draws the glyph, not just the name", () => {
    // It printed "for hosting" in plain text while every tile beside it
    // drew a photograph or an emoji on a coloured chip — so the one
    // category actually attached to the payment was the only one on the
    // screen with nothing to recognise it by.
    const body = strip(send);
    const at = body.indexOf("{pickedChoice && <div");
    assert.ok(at > 0, "the 'for <choice>' line is gone");
    const line = body.slice(at, at + 1600);
    assert.match(line, /<ChoiceGlyph category=\{pickedChoice\}/,
      "the chosen choice is still named without being shown");
  });

  test("and blurs it with the rest when the names are hidden", () => {
    // The same treatment the chips get. Removing it instead would leave
    // the line as the one place the mask does not reach.
    const body = strip(send);
    const at = body.indexOf("{pickedChoice && <div");
    const line = body.slice(at, at + 1600);
    assert.match(line, /filter: choiceNamesHidden \? "blur\(/,
      "the chosen choice's icon stays sharp while its name is masked");
  });
});
