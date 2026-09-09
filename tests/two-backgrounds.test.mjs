// tests/two-backgrounds.test.mjs
//
// This app has TWO backgrounds.
//
//   FLAGS   — registration and login
//   SYMBOLS — every screen after login
//
// It had five, and two of them were pointed the wrong way: registration
// rendered DashboardAmbientBg, the dashboard's own background, on the screen
// you see before a dashboard exists — while the flags lived only on the
// Coverage screen, which is post-login.
//
// The other three were layer soup. FinGeoField drew circles and squares,
// FinDotField drew dots, FinSymbolField drew the symbols, and two wrappers
// stacked them in different combinations on different screens. Only the
// symbols carry meaning here — the ID is symbols, the pad is symbols, the
// splash is symbols — so only the symbols survive.
//
// Two exceptions, both deliberate, both asserted below so that neither can
// be "tidied away" by someone applying the rule mechanically:
//
//   - the splash keeps SplashSymbolField (its own choreography, and it
//     paints before any of this is mounted)
//   - Coverage keeps FlagFlowBox (the flags are its content — you tap them)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const src = (p) => readSource(p);
const code = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const BG = "frontend/components/common/backgrounds.jsx";
const REG = "frontend/components/dialogs/registerLogin.jsx";

describe("registration and login wear flags", () => {
  test("registration renders the flag field", () => {
    assert.match(code(REG), /<FlagFlowBox count=\{14\} opacityBoost=\{1\.6\} varied \/>/);
  });

  test("and no longer borrows the dashboard's background", () => {
    assert.ok(
      !/<DashboardAmbientBg/.test(code(REG)),
      "registration is rendering the dashboard's background again"
    );
  });

  test("those flags are decoration, not a country picker", () => {
    // FlagFlowBox is tappable when given `countries` and `onPick` — that is
    // how Coverage uses it. On registration the real picker is the grid, and
    // a second, half-hidden way to choose a country would be a trap.
    const reg = code(REG);
    const at = reg.indexOf("<FlagFlowBox");
    const tag = reg.slice(at, reg.indexOf("/>", at));
    assert.ok(!/countries=/.test(tag), "the registration flags are pickable");
    assert.ok(!/onPick=/.test(tag), "the registration flags are pickable");
  });
});

describe("every screen after login wears symbols, and only symbols", () => {
  test("there is one post-login background component", () => {
    const bg = code(BG);
    assert.match(bg, /function AppSymbolBg\(\{ zIndex = 0 \}\)/);
    // The two old names still resolve, so no call site had to change in the
    // same commit that changed what they draw.
    assert.match(bg, /function DashboardAmbientBg\(\) \{\s*return <AppSymbolBg \/>;\s*\}/);
    assert.match(bg, /function SendMoneyAmbientBg\(\) \{\s*return <AppSymbolBg \/>;\s*\}/);
  });

  test("the shapes and the dots are gone from the file, not just unused", () => {
    const bg = code(BG);
    assert.ok(!/function FinGeoField/.test(bg), "FinGeoField is still here");
    assert.ok(!/function FinDotField/.test(bg), "FinDotField is still here");
  });

  test("nothing anywhere still renders them", () => {
    for (const p of [BG, REG, "frontend/screens/Dashboard/Dashboard.jsx",
                     "frontend/screens/SendMoney/SendMoney.jsx", "frontend/App.jsx"]) {
      const s = code(p);
      assert.ok(!/<FinGeoField/.test(s), `${p} renders FinGeoField`);
      assert.ok(!/<FinDotField/.test(s), `${p} renders FinDotField`);
    }
  });

  test("it draws the dial symbols in the dial-pad colours", () => {
    // Not FIN_SYMBOLS, the generic set. The point of this background is that
    // it is the SAME alphabet as the ID, the pad and the splash.
    const bg = code(BG);
    assert.match(bg, /symbols=\{DIAL_PAD_SYMBOLS\}/);
    assert.match(bg, /colors=\{DIAL_PAD_COLORS\}/);
  });
});

describe("the two exceptions survive", () => {
  test("the splash keeps its own field", () => {
    assert.match(
      code("frontend/components/common/launchSplash.jsx"),
      /<SplashSymbolField \/>/
    );
  });

  test("Coverage keeps its flags, and they are still tappable", () => {
    const cov = code("frontend/screens/Coverage/GloobalCoverageScreen.jsx");
    assert.match(cov, /<FlagFlowBox/);
    assert.match(cov, /onPick=\{selectCountry\}/);
  });

  test("the reason for both is written down", () => {
    // A rule with two exceptions and no note is a rule someone "fixes".
    assert.match(src(BG), /the Coverage screen keeps FlagFlowBox/);
    assert.match(src(BG), /the splash keeps its own SplashSymbolField/);
  });
});

describe("the painted background is gone", () => {
  test("T.bg is a flat colour again", () => {
    // It was a 16-symbol SVG painted into the token. With a live symbol flow
    // on every post-login screen it became a second symbol layer, and on
    // registration it fought the flags.
    const theme = code("frontend/constants/theme.js");
    assert.match(theme, /bg: "#F6F5FC",/);
    assert.ok(!/BG_FIELD_URI/.test(theme), "the painted field is still in the token");
  });

  test("and the token it needed is gone with it", () => {
    // bgPlain only existed to opt registration and the splash OUT of the
    // painted field. Nothing to opt out of now.
    for (const p of [REG, "frontend/components/common/launchSplash.jsx",
                     "frontend/constants/theme.js"]) {
      assert.ok(!/bgPlain/.test(code(p)), `${p} still refers to bgPlain`);
    }
  });
});

describe("the symbol field reaches every post-login screen", () => {
  const SCREENS = [
    "frontend/features/assets/AssetsScreen.jsx",
    "frontend/screens/About/AboutUsScreen.jsx",
    "frontend/features/paylater/PayLaterScreen.jsx",
    "frontend/features/essentials/EssentialsScreen.jsx",
    "frontend/screens/Banks/GloobalBankScreen.jsx",
    "frontend/screens/Coin/GloobalCoinScreen.jsx",
    "frontend/screens/Coin/SendCoinScreen.jsx",
    "frontend/screens/Coin/CoinHoldersScreen.jsx",
    "frontend/screens/Coin/CountryHoldersScreen.jsx"
  ];

  test("each full-screen surface renders it", () => {
    // Only five screens ever had an ambient background. The rest had the
    // painted token field, and when that went they had nothing at all.
    for (const p of SCREENS) {
      assert.match(code(p), /<AppSymbolBg zIndex=\{-1\} \/>/, `${p} has no background`);
    }
  });

  test("at zIndex -1, so it cannot paint over the screen", () => {
    // Their content is static, and a POSITIONED element paints above static
    // siblings whatever the source order — a field at 0 would cover the
    // screen. Each root is position:fixed WITH a zIndex, so it opens a
    // stacking context and -1 lands below the content but above the root's
    // own background.
    for (const p of SCREENS) {
      const s2 = code(p);
      const at = s2.indexOf("<AppSymbolBg");
      assert.ok(/position: "fixed", inset: 0, zIndex: \d+/.test(s2.slice(Math.max(0, at - 400), at)),
        `${p}: the field is not inside a fixed, z-indexed root`);
    }
  });
});

describe("the animation travels with the component", () => {
  test("AppSymbolBg declares its own keyframes", () => {
    // The particles START off-screen (top:-10%, left:-10%) and are carried
    // in BY the animation. With the keyframes defined elsewhere, using this
    // component on a new screen does not degrade subtly — it renders
    // eighteen particles parked outside the viewport and a blank
    // background. That is exactly what happened the first time My Assets
    // was rendered on its own.
    const bg = code(BG);
    assert.match(bg, /@keyframes finDrift/);
    assert.match(bg, /@keyframes finGlow/);
    assert.match(bg, /prefers-reduced-motion: reduce/);
  });

  test("the dead keyframes went with the fields they animated", () => {
    const app = code("frontend/App.jsx");
    assert.ok(!/@keyframes finDotPulse/.test(app), "finDotPulse outlived FinDotField");
    assert.ok(!/@keyframes finGeoSpin/.test(app), "finGeoSpin outlived FinGeoField");
  });
});
