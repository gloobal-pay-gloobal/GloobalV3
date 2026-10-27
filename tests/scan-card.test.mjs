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
test("the screen is black for the camera and light for the card", () => {
  const src = app();
  assert.match(src, /background: scanPayee \? scanPageTint\(scanPayee\.gloobalId\) : "#000"/,
    "the scan overlay is either always black or always coloured");
  // A dark frame is what lets somebody see the picture they are aiming.
  assert.match(src, /BLACK WHILE AIMING, LIGHT ONCE IT LANDS/);
});

// ── THE COLOUR IS ON THE CARD, NOT BEHIND IT ────────────────────────────
//
// Built the other way round first — a dark coloured field, a white card
// floating on it — and inverted on sight: "make background colour light
// white and make that box of data colorful".
//
// He is right, and the reason is worth keeping: the field is the biggest
// thing on the screen and the card is the only thing anybody reads.
// Colouring the field spent all that area in the place nobody looks.
test("the card carries the hue and the page stays white", () => {
  const src = app();
  assert.match(src, /background: scanBackdropCss\(scanPayee\.gloobalId\)/,
    "the confirm card is not drawn in the payee's colour");
  // And the things on it flipped with it.
  assert.match(src, /fontSize: 16, fontWeight: 800, color: "#FFFFFF"/, "the name is still dark on a dark card");
  assert.match(src, /color: "rgba\(255,255,255,0\.72\)"/, "the card's label is still grey on colour");
});

test("every page tint is still white to look at", () => {
  // "Light white" is the brief. A tint that stops being white has
  // reinvented the thing he asked me to take away.
  const { scanPageTint, SCAN_BACKDROPS, scanBackdropFor } = backdrop(
    ["scanPageTint", "SCAN_BACKDROPS", "scanBackdropFor"]
  );
  const seen = new Set();
  for (let i = 0; i < 400 && seen.size < SCAN_BACKDROPS.length; i += 1) {
    const id = `G-${i * 7919}`;
    const key = scanBackdropFor(id).key;
    if (seen.has(key)) continue;
    seen.add(key);
    const hex = scanPageTint(id);
    assert.match(hex, /^#[0-9A-F]{6}$/, `${key}'s tint is not a hex colour`);
    const n = parseInt(hex.slice(1), 16);
    for (const ch of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) {
      assert.ok(ch >= 235, `${key}'s page tint ${hex} has a channel at ${ch} — that is a coloured page, not a white one`);
    }
  }
  assert.equal(seen.size, SCAN_BACKDROPS.length, "some colours never produced a tint");
});

test("the page and the card are always the same hue", () => {
  // Two tables would be two things to keep in step, and a page in one
  // hue behind a card in another looks like two unrelated decisions.
  assert.match(backdropSrc(), /function scanPageTint\(seed\) \{\s*\n\s*const pick = scanBackdropFor\(seed\);/);
});

test("Pay is white on the card, and its text passes on white", () => {
  // A violet button on a teal card is two unrelated colours arguing over
  // the most important control on the screen.
  const src = app();
  assert.match(src, /background: "#FFFFFF", color: scanBackdropFor\(scanPayee\.gloobalId\)\.from/);
  const { SCAN_BACKDROPS } = backdrop(["SCAN_BACKDROPS"]);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  for (const b of SCAN_BACKDROPS) {
    const contrast = 1.05 / (lum(b.from) + 0.05);
    assert.ok(contrast >= 7, `Pay in ${b.key} reads ${contrast.toFixed(2)}:1 on white`);
  }
});

test("the Gloobal ID keeps a white ground under it", () => {
  // ColoredGloobalId draws every symbol in a different colour from a
  // rotating rainbow, chosen to read on the app's white surface. Half of
  // them — the blues, the deep violet — would disappear into a dark card.
  const src = app();
  const at = src.indexOf("THE ID KEEPS ITS OWN WHITE GROUND");
  assert.ok(at > 0, "the id lost its own ground");
  const block = src.slice(at, at + 900);
  assert.match(block, /background: "#FFFFFF", borderRadius: 999/);
  assert.match(block, /<ColoredGloobalId id=\{scanPayee\.gloobalId\} \/>/,
    "the id is no longer drawn by the app's own component");
});

test("the title is readable on both grounds", () => {
  // White over the camera, where it needs a shadow to survive whatever
  // the lens is pointed at; ink once the page goes light, where white
  // would simply be gone.
  const src = app();
  assert.match(src, /color: scanPayee \? T\.ink : "#FFFFFF"/);
  assert.match(src, /textShadow: scanPayee \? "none" : "0 1px 8px rgba\(0,0,0,0\.5\)"/);
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

// ── THE MESSAGE HANGS OFF THE CARD, IT IS NOT IN IT ─────────────────────
//
// "Can you keep them message BELOW that pay box like a two side hanging
// and little flowing."
//
// It was a panel inside the card, under Pay. Moved out, it stops being
// one more thing in the box somebody is reading to decide whether to pay
// — which is exactly where a shopkeeper's aside does not belong — and
// becomes something plainly attached to them and plainly not part of the
// decision.
test("the ribbon is outside the card, below it", () => {
  const src = app();
  const cardOpen = src.indexOf("The payee's own hue, derived from the code");
  const pay = src.indexOf(">Pay</button></div>");
  const ribbon = src.indexOf("scanPayee.creator.scanNote");
  assert.ok(cardOpen > 0 && pay > cardOpen, "the Pay button is no longer inside the card");
  assert.ok(ribbon > pay, "the message is still drawn inside the card");
  // The card and the ribbon share a wrapper, so the ribbon can be wider
  // than the card without widening it.
  assert.match(src, /maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center"/);
});

test("it hangs the same amount off each side", () => {
  // A band exactly the card's width reads as a second card that happens
  // to be shorter. Both ends showing is what makes it a ribbon.
  const src = app();
  assert.match(src, /width: "calc\(100% \+ 30px\)"/);
  const { SCAN_BACKDROPS } = backdrop(["SCAN_BACKDROPS"]);
  assert.ok(SCAN_BACKDROPS.length > 0);
  // Pulled up under the card's edge, so it hangs from it rather than
  // floating below it with a gap.
  assert.match(src, /marginTop: -14,/);
  // Two folds, one at each end, mirrored.
  assert.match(src, /clipPath: "polygon\(0 0, 100% 0, 100% 100%\)"/);
  assert.match(src, /clipPath: "polygon\(0 0, 100% 0, 0 100%\)"/);
});

test("a fold is darker than the band it folds under", () => {
  // It is in shadow. Equal shades would make the ends read as a wider
  // rectangle rather than as a crease.
  const { scanRibbonInk, scanBackdropFor, SCAN_BACKDROPS } = backdrop(
    ["scanRibbonInk", "scanBackdropFor", "SCAN_BACKDROPS"]
  );
  const sum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
  };
  const seen = new Set();
  for (let i = 0; i < 400 && seen.size < SCAN_BACKDROPS.length; i += 1) {
    const id = `G-${i * 7919}`;
    const pick = scanBackdropFor(id);
    if (seen.has(pick.key)) continue;
    seen.add(pick.key);
    const ink = scanRibbonInk(id);
    assert.ok(sum(ink.fold) < sum(ink.bar), `${pick.key}'s fold is not darker than its band`);
    assert.ok(sum(ink.bar) < sum(pick.from), `${pick.key}'s band is not darker than the card`);
  }
  assert.equal(seen.size, SCAN_BACKDROPS.length);
});

test("the flow stops for anybody who asked it to", () => {
  const src = app();
  assert.match(src, /animation: "gloobalScanRibbon 5\.5s ease-in-out infinite"/);
  assert.match(src, /@keyframes gloobalScanRibbon \{/);
  assert.match(src, /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*@keyframes gloobalScanRibbon \{ 0%, 100% \{ transform: none; \} \}/);
});

test("the card declares its own box model", () => {
  // Measured while checking the ribbon's overhang: the wrapper came back
  // 340 and the card inside it 384 — its own horizontal padding added on
  // top, because nothing here had declared one. There IS a global
  // `* { box-sizing: border-box }` in this app, but it lives in a style
  // tag inside SendMoney, so this card's width depended on whether that
  // screen had ever mounted.
  const src = app();
  const at = src.indexOf("THE CARD WAS 44px WIDER THAN IT ASKED TO BE");
  assert.ok(at > 0, "the note explaining the box model is gone");
  assert.match(src.slice(at, at + 900), /boxSizing: "border-box"/);
});
