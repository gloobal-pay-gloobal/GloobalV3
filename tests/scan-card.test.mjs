// tests/scan-card.test.mjs
//
// THE CARD SOMEBODY READS IN THE HALF-SECOND BEFORE MONEY MOVES.
//
// Three changes, all asked for from a phone:
//
//   * the screen stopped being black once a code resolves,
//   * the scan mark and a new way into a shop moved to the corner,
//   * a creator can put one line on their own code.
//
// What is pinned here is the part that is easy to get subtly wrong: the
// colour must be DERIVED, not stored, or it can drift between the scan
// card and the payment; and the message must not be able to push the Pay
// button around.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const backdropSrc = () => readSource("frontend/features/scan/scanBackdrop.js");
const app = () => readSource("frontend/App.jsx");
const server = () => readSource("server/server.js");

function backdrop(names) {
  // eslint-disable-next-line no-new-func
  return new Function(`${backdropSrc()}; return { ${names.join(", ")} };`)();
}

// ── THE COLOUR CANNOT MOVE, BECAUSE THERE IS NOTHING TO MOVE ────────────
//
// "when you keep background as light blue for example don't change colour
// into something else."
//
// Held in state, that is a promise somebody has to keep at every screen
// boundary. Derived from the scanned ID it is a property of the thing
// itself: the same code gives the same colour on the card, behind the
// amount, behind the PIN, and again next week.
test("the same code always gives the same colour", () => {
  const { scanBackdropCss, scanBackdropFor } = backdrop(["scanBackdropCss", "scanBackdropFor"]);
  const id = "G-4471-2209-8831";
  const first = scanBackdropCss(id);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(scanBackdropCss(id), first, "the colour changed between two reads of one id");
  }
  assert.equal(scanBackdropFor(id).key, scanBackdropFor(id).key);
});

test("different codes mostly give different colours", () => {
  // Not a uniqueness claim — twelve buckets cannot hold every account —
  // but the spread has to be even, or one colour would be most of them
  // and the field would say nothing at all.
  const { scanBackdropFor, SCAN_BACKDROPS } = backdrop(["scanBackdropFor", "SCAN_BACKDROPS"]);
  const counts = Object.create(null);
  const N = 6000;
  for (let i = 0; i < N; i += 1) {
    const id = `G-${1000 + (i * 7919) % 9000}-${1000 + (i * 104729) % 9000}-${1000 + (i * 1299709) % 9000}`;
    const key = scanBackdropFor(id).key;
    counts[key] = (counts[key] || 0) + 1;
  }
  const used = Object.keys(counts);
  assert.equal(used.length, SCAN_BACKDROPS.length, "some colours are unreachable");
  const even = N / SCAN_BACKDROPS.length;
  for (const key of used) {
    assert.ok(
      counts[key] > even * 0.5 && counts[key] < even * 1.5,
      `${key} got ${counts[key]} of ${N}, which is not an even share — the hash is biased`
    );
  }
});

test("an empty or missing id still gives a colour", () => {
  // A card with no id is a card that should still not be black.
  const { scanBackdropCss } = backdrop(["scanBackdropCss"]);
  for (const bad of ["", null, undefined, 0]) {
    assert.match(scanBackdropCss(bad), /^linear-gradient\(/);
  }
});

test("every backdrop is dark enough for white text on it", () => {
  // The title sits on this field in white, and the card is white too. The
  // LIGHTER stop is the one that has to pass, since the darker one passes
  // trivially.
  const { SCAN_BACKDROPS } = backdrop(["SCAN_BACKDROPS"]);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const seen = new Set();
  for (const b of SCAN_BACKDROPS) {
    assert.ok(!seen.has(b.key), `two backdrops are called ${b.key}`);
    seen.add(b.key);
    const contrast = 1.05 / (lum(b.to) + 0.05);
    assert.ok(
      contrast >= 4.5,
      `${b.key}'s lighter stop ${b.to} gives white text ${contrast.toFixed(2)}:1, under 4.5:1`
    );
    assert.ok(lum(b.from) < lum(b.to), `${b.key} does not travel from dark to light`);
  }
});

test("none of them is the app's own violet", () => {
  // This field is about WHO IS BEING PAID. A row of Gloobal-violet
  // backdrops would say Gloobal instead of saying them.
  const { SCAN_BACKDROPS } = backdrop(["SCAN_BACKDROPS"]);
  for (const b of SCAN_BACKDROPS) {
    for (const hex of [b.from, b.to]) {
      assert.ok(!/^#7C3AED$/i.test(hex), `${b.key} uses the accent itself`);
    }
  }
});

// ── BLACK IS STILL RIGHT, BUT ONLY WHILE AIMING ─────────────────────────
test("the screen is black for the camera and coloured for the card", () => {
  const src = app();
  assert.match(src, /background: scanPayee \? scanBackdropCss\(scanPayee\.gloobalId\) : "#000"/,
    "the scan overlay is either always black or always coloured");
  // A dark frame is what lets somebody see the picture they are aiming.
  assert.match(src, /BLACK WHILE AIMING, COLOURED ONCE IT LANDS/);
});

test("the backdrop is in the build", () => {
  assert.match(readSource("build_app.mjs"), /"features\/scan\/scanBackdrop\.js"/,
    "a source file missing from FRONTEND_MODULES is silently not in the app");
});

// ── THE CORNER, NOT UNDER THE PAY BUTTON ────────────────────────────────
test("the scan mark moved out of the card and into the corner", () => {
  // Under Pay is the row a thumb is already heading for. A control there
  // is one somebody reaches past, or hits by accident, on the screen
  // where a mistake costs money.
  const src = app();
  const card = src.slice(src.indexOf('{scanPayee.creator ? "Gloobal Shop" : "Gloobal ID"}'));
  const cardOnly = card.slice(0, card.indexOf("</div>}</div>}</div>;"));
  assert.doesNotMatch(cardOnly, /aria-label="Scan another code"/,
    "the scan control is still inside the card");
  assert.match(src, /label="Scan another code"\s*\n\s*><ScannerIcon size=\{NAV_GLYPH_SIZE\}/,
    "the corner scan control is missing or not drawn at the nav glyph size");
});

test("a shop gets a second corner control; a person does not", () => {
  const src = app();
  const corner = src.slice(src.indexOf("THE CORNER, ONCE A CODE HAS LANDED"));
  const block = corner.slice(0, corner.indexOf("</div> : <span"));
  assert.match(block, /\{scanPayee\.creator \? <NavIconButton/,
    "the shop control is not conditional on there being a shop");
  assert.match(block, /<Store4 size=\{NAV_GLYPH_SIZE\}/);
  assert.match(block, /See what \$\{creatorDisplayName\(scanPayee\.creator\)\} sells/);
});

test("that control hands the shop over already resolved", () => {
  // The scan screen looked the creator up to draw this card. Asking the
  // next screen to look it up again is a spinner between a tap and a page
  // that could have opened instantly.
  const src = app();
  assert.match(src, /setDashboardDeepLink\(\{ creator \}\)/);
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(dash, /typeof deepLinkTarget === "object" && deepLinkTarget\.creator/);
  assert.match(dash, /setOpenCreator\(deepLinkTarget\.creator\)/);
  // Checked before the string comparisons, or an object would fall
  // through every one of them into the final else.
  const effect = dash.slice(dash.indexOf("if (!deepLinkTarget) return;"));
  assert.ok(
    effect.indexOf("deepLinkTarget.creator") < effect.indexOf('deepLinkTarget === "bank"'),
    "the object target is tested after the string ones"
  );
});

// ── ONE LINE FROM THE CREATOR ───────────────────────────────────────────
test("the message sits under Pay, never above it", () => {
  // Above, it would sit between the name and the button and push the
  // button down the screen on every card that has one — and a message is
  // not a condition of paying, so it must not look like one standing in
  // the way.
  const src = app();
  const pay = src.indexOf(">Pay</button>");
  const note = src.indexOf("scanPayee.creator.scanNote");
  assert.ok(pay > 0 && note > pay, "the creator's message is drawn before the Pay button");
});

test("the message is only drawn when there is one", () => {
  assert.match(app(), /\{scanPayee\.creator && scanPayee\.creator\.scanNote \?/,
    "an empty message would draw an empty box under Pay");
});

test("the server caps the message and trims it", () => {
  const src = server();
  assert.match(src, /body\.scanNote\.length > 120/,
    "a long message would push the Pay button off a small screen");
  assert.match(src, /set\['creatorProfile\.scanNote'\] = body\.scanNote\.trim\(\)/);
  assert.match(src, /invalid_scan_note/);
  // And the model agrees with the route, rather than each capping its own.
  assert.match(readSource("server/models/User.js"), /scanNote: \{ type: String, trim: true, default: '', maxlength: 120 \}/);
});

test("the message is sent to everybody, unlike the address", () => {
  // A message written FOR the person scanning is of no use if only its
  // author can read it. The address is the opposite and stays gated.
  const src = server();
  const pub = src.slice(src.indexOf("function publicCreator"));
  const body = pub.slice(0, pub.indexOf("\n}\n"));
  assert.match(body, /scanNote: profile\.scanNote \|\| ''/);
  assert.match(body, /address: profile\.addressPublic \? \(profile\.address \|\| ''\) : ''/,
    "the address stopped being gated on the switch that gates it");
});

test("the creator can write it, and is told who reads it", () => {
  const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(src, /id="creator-scan-note"/);
  assert.match(src, /e\.target\.value\.slice\(0, 120\)/,
    "the box lets somebody type past what the server will keep");
  assert.match(src, /scanNote: scanNote\.trim\(\)/, "the field is never saved");
  assert.match(src, /Anybody who scans your code sees this, right under the Pay button\./,
    "nothing on the form says who reads it");
});
