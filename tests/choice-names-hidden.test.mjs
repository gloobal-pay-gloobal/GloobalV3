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
// A gate was added here to settle that, and then taken off again: the
// balance is a number somebody could use against you, while these are
// your own labels on a screen you are already mid-payment on. The
// consistency was made the other way round — the strip opens hidden, and
// one tap opens it. See "the eye is just an eye" below.
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

describe("the eye is just an eye", () => {
  const body = strip(send);

  test("the toggle is named, not inlined into the onClick", () => {
    // This used to assert that the inline toggle was GONE, on the
    // grounds that it was the bug. It is the intended behaviour now, so
    // what is left worth asserting is only that it lives in a named
    // handler — which is where the reasoning about it sits, and the
    // thing anybody changing this will read first.
    assert.match(body, /onClick=\{handleToggleChoiceNames\}/);
    assert.doesNotMatch(body, /onClick=\{\(\) => setChoiceNamesHidden/,
      "the toggle was inlined back into the JSX, away from the note explaining it");
  });

  test("it is a plain toggle, and that is now deliberate", () => {
    // ── THE GATE WENT BACK OFF ────────────────────────────────────────
    //
    // A previous patch put requireBiometric on this eye. That was built
    // to answer "sometimes it asks, sometimes it doesn't" — and the real
    // cause turned out to be that this control had NO check while the
    // dashboard's balance eye had one, so the two looked alike and
    // behaved differently.
    //
    // Adding a check made them consistent and made this worse. The
    // balance is a number somebody could use against you; these are your
    // own labels for your own spending, on a screen you are already
    // mid-payment on, having passed a check to get into the app at all.
    // A fingerprint prompt to read the word "Donation" on your own phone
    // is friction charged for nothing.
    //
    // The consistency went the other way instead: the strip still opens
    // HIDDEN, which is the part that protects anything, and opening it
    // is one tap. This test exists so that putting the gate back is a
    // decision somebody makes on purpose rather than a tidy-up.
    const at = body.indexOf("const handleToggleChoiceNames");
    assert.ok(at > 0, "the eye's handler is gone");
    const toggle = body.slice(at, body.indexOf(";", at) + 1);
    assert.match(toggle, /setChoiceNamesHidden\(\(v\) => !v\)/);
    assert.doesNotMatch(toggle, /requireBiometric|Biometric/,
      "the choices eye has a verification gate on it again");
  });

  test("and no verification screen is rendered for it", () => {
    assert.doesNotMatch(body, /showChoiceBiometric/,
      "the choice-names verify screen is back");
    // The PAYMENT's gate is untouched — that one guards money.
    assert.equal((readSource(SEND).match(/<BiometricVerifyScreen/g) || []).length, 1,
      "the payment's own verification screen was removed or duplicated");
  });

  test("the Essentials figure keeps ITS gate, which is a different thing", () => {
    // Asked for separately and for a different reason: that figure says
    // something about a person rather than about their own labels.
    const cat = strip(readSource("frontend/features/choices/CategoryScreen.jsx"));
    assert.match(cat, /await requireBiometric\(/,
      "removing the choices gate also removed the Essentials one");
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
