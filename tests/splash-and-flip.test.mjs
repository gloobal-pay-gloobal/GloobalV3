// tests/splash-and-flip.test.mjs
//
// The launch splash, and the speed of the flipping logo it shares with the
// Gloobal Bank and Gloobal Coin screens.
//
// Reported together, because they are the same mark: "on our splash, one
// bank screen and one currency screen we have a logo which is flipping in
// our dial pad symbols and logo, currently they are flying too quick."
// One component (LivingLogoBoxVisual) draws it in all three places, so the
// speed is one number in one file — which is the payoff of having unified
// them earlier.
//
// The splash also gained a stated duration (3-5s), a line of copy, and the
// 0.00% / HOOMAN TO HOOMAN mark the product screens carry.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const splash = readSource("frontend/components/common/launchSplash.jsx");
const flip = readSource("frontend/components/common/flipIcons.jsx");

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("the mark turns slowly enough to read as a turn", () => {
  test("one flip takes 900ms, not 500", () => {
    // At 500 it snapped between faces — it read as a cut rather than a
    // rotation, and the point of this box (that the logo and the eight dial
    // symbols are nine faces of ONE object) only lands if you see it turn.
    assert.match(flip, /flipMs = 900,/);
  });

  test("a face is held 3.4s, not 2s", () => {
    // With a 900ms turn, a 2s face meant the box was rotating for nearly
    // half the time it was on screen. That is what reads as "flying".
    assert.match(flip, /var LIVING_LOGO_FACE_MS = 3400;/);
  });

  test("the turn always finishes before the next one is due", () => {
    // The invariant that keeps this coherent at any speed: if a flip
    // outlasts its face, the box is permanently mid-rotation and the faces
    // stop being distinguishable at all.
    const flipMs = Number(flip.match(/flipMs = (\d+),/)[1]);
    const faceMs = Number(flip.match(/var LIVING_LOGO_FACE_MS = (\d+);/)[1]);
    assert.ok(
      flipMs < faceMs,
      `a ${flipMs}ms turn cannot fit inside a ${faceMs}ms face`
    );
    // And leave real stillness, not just a hair.
    assert.ok(
      faceMs - flipMs >= 2000,
      `only ${faceMs - flipMs}ms of stillness per face — the mark still flies`
    );
  });

  test("the symbols inside the 0.00% dots are slower too, and smaller", () => {
    // Reported as "the symbols are big in comparison to 0, it's breaking
    // flow". The em here is the MARK's font size, not the dot's, which is
    // what made it easy to get wrong: the dot is 0.72em across, so a 0.55em
    // glyph filled 76% of it and at 800 weight reached the rim on all four
    // sides. The dot stopped reading as a zero with something inside it.
    const brand = readSource("frontend/components/common/brand.jsx");
    const at = brand.indexOf("function ZeroPercentMark(");
    assert.ok(at > 0, "ZeroPercentMark not found");
    const fn = brand.slice(at, brand.indexOf("\nfunction ", at + 10));

    const dot = Number(fn.match(/width: "([\d.]+)em"/)[1]);
    const glyph = Number(fn.match(/fontSize: "([\d.]+)em"/)[1]);
    assert.ok(
      glyph / dot <= 0.56,
      `the glyph fills ${Math.round((glyph / dot) * 100)}% of the dot — it must sit inside it, not burst out`
    );
    assert.match(fn, /transition: "transform 0\.9s/);
    assert.match(fn, /\}, 1800\);/);
  });

  test("the mark is the same rounded square on all three screens", () => {
    // Bank and Coin drew it as a full circle while the splash drew a
    // rounded square, so the same object was a disc on two screens and a
    // squircle on the third.
    //
    // The radius is a PERCENTAGE and lives in one constant. A fixed pixel
    // radius would have made the 124px hero look boxy and the 172px splash
    // box look barely rounded — the curve has to scale with the box.
    assert.match(flip, /var LIVING_LOGO_RADIUS = "24%";/);
    assert.match(flip, /borderRadius=\{shape === "circle" \? "50%" : LIVING_LOGO_RADIUS\}/);
    assert.match(splash, /var BOX_RADIUS = LIVING_LOGO_RADIUS;/);
    const code = splash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/borderRadius: "50%"/.test(code), "nothing on the splash is a disc any more");
  });

  test("all three screens get it from the same place", () => {
    // Bank and Coin render ProductScreenHero -> LivingLogoBox; the splash
    // renders LivingLogoBoxVisual directly. Both bottom out in the same
    // component, so this speed is one number rather than three.
    const hero = readSource("frontend/components/cards/GloobalTaglineCard.jsx");
    assert.match(hero, /<LivingLogoBox size=\{124\} shape="square" \/>/);
    assert.match(splash, /<LivingLogoBoxVisual/);
    assert.match(flip, /function LivingLogoBox\(/);
    assert.match(flip, /function LivingLogoBoxVisual\(/);
  });
});

describe("the splash is built from the theme, not from picked colours", () => {
  test("the ground is the app's own background", () => {
    // A short-lived version of this screen used T.gradWallet with a dotted
    // world and a glowing horizon, built to a reference image. It looked
    // like a launch screen and like nothing else in Gloobal — you opened it
    // and then the app appeared, in a different colour on a different
    // surface. T.bg is what every screen behind this one is, so the splash
    // now fades INTO the app rather than cutting to it.
    assert.match(splash, /background: T\.bg,/);
    const code = splash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/gradWallet/.test(code), "the deep gradient ground is gone");
    assert.ok(!/closest-side/.test(code), "so is the horizon it needed");
  });

  test("no raw hex is used where a token exists", () => {
    // White at various alphas is fine — it is not a brand colour. Brand
    // purples and the transaction pair must come from the theme.
    const code = splash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const brandHexes = code.match(/#(7C3AED|4C1D95|4F46E5|E23F45|0FA372|F6F5FC)/gi) || [];
    assert.deepEqual(
      brandHexes.filter((h) => !/4F46E5/i.test(h)),
      [],
      "brand colours must be read from T / the TXN constants"
    );
  });

  test("the character comes from drifting dial symbols", () => {
    // The registration flow's flowing-flags idea, with the app's own eight
    // symbols instead of countries — varied size and colour, spread over
    // the whole screen.
    assert.match(splash, /function SplashSymbolField\(\)/);
    assert.match(splash, /<SplashSymbolField \/>/);
    assert.match(splash, /symbol: DIAL_SYMBOLS\[/);
    assert.match(splash, /color: DIAL_PAD_COLORS\[/);
  });

  test("the field covers the screen rather than hugging its edges", () => {
    // Why this is not FinSymbolField: that component seeds every particle
    // on an EDGE at -10% and drifts it inward by at most driftMax. Behind a
    // dashboard that is right — the motion belongs at the margins. On a
    // screen with three elements the middle is empty, and a particle
    // entering at -84px and drifting 170px is still in the top tenth. The
    // field hugged the border and read as debris.
    assert.match(splash, /left: rand\(-2, 96\)/);
    assert.match(splash, /top: rand\(-2, 96\)/);
    // A wide size range is what makes it read as depth rather than pattern.
    const size = splash.match(/size: rand\((\d+), (\d+)\)/);
    assert.ok(Number(size[2]) / Number(size[1]) >= 3, "sizes must vary by at least 3x");
  });

  test("it brings its own keyframes", () => {
    // The splash paints before any other screen has mounted, so depending
    // on a style block owned by the dashboard or the coverage screen would
    // be depending on something that may not exist yet.
    assert.match(splash, /@keyframes splashSymbolDrift/);
    assert.match(splash, /prefers-reduced-motion: reduce/);
  });

  test("nothing on it is fetched", () => {
    // A splash paints on the first frame; anything that has to arrive over
    // the network cannot be on it. The world texture and the horizon are
    // both CSS.
    const code = splash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/https?:\/\//.test(code), "the splash must not load anything");
  });
});

describe("the splash lasts between 3 and 5 seconds", () => {
  test("the budget adds up, and lands inside the window", () => {
    const n = (name) => Number(splash.match(new RegExp(`var ${name} = (\\d+);`))[1]);
    const total = n("HOLD_LOGO_MS") + n("FLIP_MS") + n("HOLD_SYMBOL_MS") + n("FADE_MS");
    assert.ok(total >= 3000, `splash is only ${total}ms`);
    assert.ok(total <= 5000, `splash is ${total}ms — this screen blocks every launch`);
  });

  test("its flip matches the one the product screens use", () => {
    // Two different speeds for the same mark on two screens is exactly the
    // drift that unifying the component was meant to prevent.
    assert.equal(
      Number(splash.match(/var FLIP_MS = (\d+);/)[1]),
      Number(flip.match(/flipMs = (\d+),/)[1])
    );
  });

  test("reduced motion is shorter, since nothing moves", () => {
    // Nobody who asked their device for less motion wants to be held on a
    // static screen for the full duration to look at a mark that never
    // moves — but it still has to be long enough to read the new copy.
    const reduced = Number(splash.match(/var REDUCED_MOTION_HOLD_MS = (\d+);/)[1]);
    const full = Number(splash.match(/var HOLD_LOGO_MS = (\d+);/)[1]) +
      Number(splash.match(/var FLIP_MS = (\d+);/)[1]) +
      Number(splash.match(/var HOLD_SYMBOL_MS = (\d+);/)[1]);
    assert.ok(reduced < full, "the reduced-motion path must not be the longer one");
    assert.ok(reduced >= 1500, "but must still allow the copy to be read");
  });

  test("measured in a real browser, from the page's own clock", async () => {
    const { page, context } = await openPage({});

    // The splash mounts during page load, so timing it from this process
    // measures how much was LEFT when the test got control. A first version
    // of this did exactly that and reported 3.8s for a 4.75s splash. The
    // page times itself instead.
    await page.addInitScript(() => {
      window.__splash = { appeared: null, cleared: null };
      const find = () =>
        Array.from(document.querySelectorAll("div")).find((n) => {
          const s = getComputedStyle(n);
          return s.position === "fixed" && s.zIndex === "9999";
        });
      const check = () => {
        const layer = find();
        if (layer && window.__splash.appeared == null) window.__splash.appeared = performance.now();
        if (window.__splash.appeared != null && window.__splash.cleared == null) {
          if (!layer || Number(getComputedStyle(layer).opacity) < 0.05) {
            window.__splash.cleared = performance.now();
          }
        }
      };
      const start = () => {
        check();
        setInterval(check, 40);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
      else start();
    });
    await page.reload();

    await page.waitForFunction(() => window.__splash && window.__splash.cleared != null, undefined, {
      timeout: 15000
    });
    const t = await page.evaluate(() => window.__splash);
    const total = t.cleared - t.appeared;

    // Generous either side of the 4750ms budget: this is a wall-clock
    // measurement on a shared machine, and the point is the window, not the
    // millisecond.
    assert.ok(total >= 3000, `splash was only on screen for ${Math.round(total)}ms`);
    assert.ok(total <= 5600, `splash blocked the app for ${Math.round(total)}ms`);

    await context.close();
  });
});

describe("the splash says what Gloobal is and what it charges", () => {
  test("Pay is red and receive is green", () => {
    // Not decorative. TXN_OUT_COLOR and TXN_IN_COLOR are the exact two
    // colours every amount in the app is printed in — money leaving is red,
    // money arriving is green, on every history row and every receipt. The
    // first screen a person sees teaches the colour code they will read for
    // the rest of the app.
    assert.match(splash, /<span style=\{\{ color: TXN_OUT_COLOR \}\}>Pay<\/span>/);
    assert.match(splash, /<span style=\{\{ color: TXN_IN_COLOR \}\}>receive<\/span>/);
    // Hardcoded hexes here would be the same two colours today and a
    // silent divergence the first time the palette moves.
    const at = splash.indexOf(">Pay<");
    const line = splash.slice(Math.max(0, at - 400), at + 400);
    assert.ok(!/#E23F45|#0FA372|#FF6B6F|#34D399/.test(line), "the copy must read the palette, not copy it");
  });

  test("the second line is there", () => {
    assert.match(splash, />anywhere on Earth</);
  });

  test("the 0.00% box is the Bank/Coin component itself", () => {
    // Asked for as "exactly same box", and taking the component is the only
    // way that stays true. A rebuild of its padding, border, shadow, corner
    // badge and two marks is four values that can drift — and the reason
    // GloobalTaglineCard was extracted at all is that Bank and Coin had each
    // written it out separately and were already drifting apart.
    //
    // This replaces an earlier assertion that the splash must render the
    // marks BARE rather than the card. That was my design call, and it was
    // overruled: the box is the thing being recognised across screens.
    assert.match(splash, /<GloobalTaglineCard accentColor=\{T\.accent\} \/>/);
    assert.ok(
      !/<ZeroPercentMark/.test(splash),
      "the splash must take the card, not re-render its parts"
    );
    assert.ok(!/<HoomanMark/.test(splash));
  });

  test("and that card is the one Bank and Coin render", () => {
    const card = readSource("frontend/components/cards/GloobalTaglineCard.jsx");
    assert.match(card, /<ZeroPercentMark size=\{38\}/);
    assert.match(card, /<HoomanMark \/>/);
    for (const screen of [
      "frontend/screens/Banks/GloobalBankScreen.jsx",
      "frontend/screens/Coin/GloobalCoinScreen.jsx"
    ]) {
      assert.match(readSource(screen), /<GloobalTaglineCard accentColor=/, `${screen} must use the same card`);
    }
  });

  test("the copy holds its space while hidden, so nothing jumps", () => {
    // Faded in with opacity rather than mounted late. Mounting it would
    // re-centre the column and make the logo box hop upward the moment the
    // text arrives.
    assert.match(splash, /opacity: phase === "logo" \? 0 : 1/);
    const at = splash.indexOf('opacity: phase === "logo" ? 0 : 1');
    const block = splash.slice(at, at + 400);
    assert.ok(!/display: "none"/.test(block), "hiding it must not remove it from layout");
  });

  test("the copy arrives after the logo has had its beat", () => {
    // The screen is not asking to be read and watched at the same instant.
    assert.match(splash, /transform: phase === "logo" \? "translateY\(6px\)" : "translateY\(0\)"/);
  });
});
