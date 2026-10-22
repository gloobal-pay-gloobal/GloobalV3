// tests/install-prompt.test.mjs
//
//   node --test tests/install-prompt.test.mjs
//
// Asking people to install the app.
//
// Gloobal has been installable since the preview project was set up —
// manifest, service worker, maskable icons, standalone display, the lot —
// and until now nothing ever ASKED. People who arrived by link have been
// running a payments app in a browser tab.
//
// ── THE PROPERTY THAT MATTERS MOST ──────────────────────────────────────
//
// It is not "does the banner appear". It is that the banner NEVER PROMISES
// A TAP THAT DOES NOTHING, because the three platforms are not the same
// and a banner is easy to write as though they were:
//
//   Chromium  — a real `beforeinstallprompt` event, a real install dialog.
//   Safari/iOS — NO install API exists. Share → Add to Home Screen, by
//               hand, in Apple's menu. All we can do is point.
//   Inside Instagram, Gmail, Facebook on iOS — not even that. There is no
//               Add to Home Screen item in those browsers at all.
//
// An "Install" button on an iPhone would be a lie; "tap Share → Add to
// Home Screen" inside Instagram would be a worse one, because the person
// would go looking for a menu item that is not there and conclude the app
// is broken. Most of what follows is about the third case.
//
// The other property: that it does not pester. One dismissal silences it
// for the whole of that sign-in, and dismissal is keyed on the SESSION,
// not a date or a counter, so "every time they log in" means exactly that.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SRC = "frontend/components/common/installPrompt.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const source = readSource(SRC);

// The half with no JSX in it: the three questions the component asks
// before it draws anything. Sliced out so it can be run rather than
// pattern-matched, because "which platform is this" is logic and reading
// it back as a regex proves nothing about what it answers.
const PURE = source.slice(
  source.indexOf("function gloobalAppIsInstalled"),
  source.indexOf("function useInstallPrompt")
);

// A browser, to whatever depth these functions look at one.
function fakeBrowser({ ua = "", standalone, displayMode = [], referrer = "", storage = true } = {}) {
  const held = new Map();
  const navigator = { userAgent: ua, maxTouchPoints: /iPad/.test(ua) ? 5 : 0 };
  if (standalone !== undefined) navigator.standalone = standalone;
  // An iPad has called itself a Macintosh since iPadOS 13, which is the
  // reason maxTouchPoints is consulted at all.
  if (/Macintosh/.test(ua) && /TOUCH/.test(ua)) navigator.maxTouchPoints = 5;
  const window = {
    navigator,
    matchMedia: (query) => ({ matches: displayMode.includes(query) }),
    localStorage: storage
      ? {
        getItem: (k) => (held.has(k) ? held.get(k) : null),
        setItem: (k, v) => held.set(k, String(v))
      }
      : {
        getItem() { throw new Error("blocked"); },
        setItem() { throw new Error("blocked"); }
      }
  };
  const document = { referrer };
  return { window, navigator, document, held };
}

function load(browser, fingerprint = () => "sig1") {
  return new Function(
    "window", "navigator", "document", "gloobalSessionFingerprint",
    `${PURE}
     return { gloobalAppIsInstalled, gloobalInstallPlatform, gloobalInstallDismissed, gloobalInstallDismiss };`
  )(browser.window, browser.navigator, browser.document, fingerprint);
}

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

describe("nobody who already has it is ever asked again", () => {
  test("a standalone window counts as installed", () => {
    const lib = load(fakeBrowser({ ua: ANDROID_CHROME, displayMode: ["(display-mode: standalone)"] }));
    assert.equal(lib.gloobalAppIsInstalled(), true);
  });

  test("an iPhone home-screen launch counts, which only navigator.standalone reports", () => {
    // Safari does not answer the display-mode query the way Chromium does,
    // and this is the single signal that tells an installed iPhone app
    // apart from a Safari tab. Lose it and every installed iPhone user
    // gets told to install the app they are standing inside.
    const lib = load(fakeBrowser({ ua: IPHONE_SAFARI, standalone: true }));
    assert.equal(lib.gloobalAppIsInstalled(), true);
  });

  test("a native shell around the page counts", () => {
    const lib = load(fakeBrowser({ ua: ANDROID_CHROME, referrer: "android-app://com.gloobal.pay/" }));
    assert.equal(lib.gloobalAppIsInstalled(), true);
  });

  test("a browser that refuses to answer is left alone rather than pestered", () => {
    // matchMedia throwing is not evidence that the app is uninstalled, and
    // the cost of the two guesses is not symmetric: a missed banner costs
    // one person one install, a wrong banner nags somebody forever inside
    // the app they already have.
    const browser = fakeBrowser({ ua: ANDROID_CHROME });
    browser.window.matchMedia = () => { throw new Error("nope"); };
    const lib = load(browser);
    assert.equal(lib.gloobalAppIsInstalled(), true, "it guessed 'not installed' on an error");
  });

  test("an ordinary browser tab does not", () => {
    const lib = load(fakeBrowser({ ua: ANDROID_CHROME }));
    assert.equal(lib.gloobalAppIsInstalled(), false);
    const safari = load(fakeBrowser({ ua: IPHONE_SAFARI, standalone: false }));
    assert.equal(safari.gloobalAppIsInstalled(), false);
  });
});

describe("the three platforms are told three different things", () => {
  test("Chromium gets the real prompt route", () => {
    assert.equal(load(fakeBrowser({ ua: ANDROID_CHROME })).gloobalInstallPlatform(), "prompt");
  });

  test("Safari on iOS gets the two-step route, not a button", () => {
    assert.equal(load(fakeBrowser({ ua: IPHONE_SAFARI })).gloobalInstallPlatform(), "ios");
  });

  test("an iPad is an iPad even while calling itself a Mac", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15 TOUCH";
    assert.equal(load(fakeBrowser({ ua })).gloobalInstallPlatform(), "ios");
    // and a real Mac is not
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    assert.equal(load(fakeBrowser({ ua: mac })).gloobalInstallPlatform(), "prompt");
  });

  test("the browsers inside other apps are told the truth instead of a recipe", () => {
    // This is the case the whole platform split exists for. None of these
    // has an Add to Home Screen item, so printing the two steps would send
    // somebody hunting through a menu that does not contain them.
    const inApps = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.23.113",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/300.0"
    ];
    for (const ua of inApps) {
      assert.equal(load(fakeBrowser({ ua })).gloobalInstallPlatform(), "ios-elsewhere", ua.slice(-30));
    }
  });

  test("Chrome and Firefox for iOS are the same case: a share sheet without the item", () => {
    for (const tag of ["CriOS/126.0", "FxiOS/126.0", "EdgiOS/126.0"]) {
      const ua = `Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tag} Mobile/15E148`;
      assert.equal(load(fakeBrowser({ ua })).gloobalInstallPlatform(), "ios-elsewhere", tag);
    }
  });

  test("the 'elsewhere' case never renders the two steps or an Install button", () => {
    const body = strip(source.slice(source.indexOf("function InstallBanner")));
    // The steps are behind `ios`, which is exclusive of `elsewhere`, and
    // the button's branch returns null for it. Both are asserted because
    // either one alone would let the other regress.
    assert.match(body, /\{ios \? <InstallIosSteps \/> : elsewhere \? null :/,
      "the banner's main branch no longer sends 'elsewhere' past both the steps and the button");
    assert.match(body, /!install\.canPrompt && !ios && !elsewhere/,
      "the browser-menu line can now reach an in-app browser, which has no such menu");
    const row = strip(source.slice(source.indexOf("function InstallProfileRow")));
    assert.match(row, /\{!ios && !elsewhere && <button/,
      "Profile offers an Install button on a platform that cannot install");
  });
});

describe("every sign-in, and no more than that", () => {
  test("dismissing silences it for this sign-in", () => {
    const browser = fakeBrowser({ ua: ANDROID_CHROME });
    const lib = load(browser);
    assert.equal(lib.gloobalInstallDismissed(), false);
    lib.gloobalInstallDismiss();
    assert.equal(lib.gloobalInstallDismissed(), true);
  });

  test("the next sign-in brings it back", () => {
    // The requirement in the founder's words: "every time the login or
    // relogin without app". A date or a counter would both fail this —
    // what changes at a sign-in and at nothing else is the session, which
    // is why the key is the session fingerprint.
    const browser = fakeBrowser({ ua: ANDROID_CHROME });
    let session = "sig-first";
    const lib = load(browser, () => session);
    lib.gloobalInstallDismiss();
    assert.equal(lib.gloobalInstallDismissed(), true);
    session = "sig-second";
    assert.equal(lib.gloobalInstallDismissed(), false, "a new sign-in did not bring it back");
  });

  test("it is keyed on the session, not on a clock", () => {
    assert.doesNotMatch(strip(source), /Date\.now|new Date|setTimeout|dismissCount|\+ 1\b/,
      "the dismissal has grown a clock or a counter");
    assert.match(strip(source), /gloobalSessionFingerprint/,
      "it no longer asks the session who it is");
  });

  test("signed out, nothing is treated as dismissed", () => {
    // An empty fingerprint is "nobody is signed in". Comparing "" to a
    // stored "" would read as dismissed forever, which is how a banner
    // keyed on a blank value silently disappears for everybody.
    const browser = fakeBrowser({ ua: ANDROID_CHROME });
    const lib = load(browser, () => "");
    lib.gloobalInstallDismiss();
    assert.equal(lib.gloobalInstallDismissed(), false);
  });

  test("a phone with storage blocked still renders rather than throwing", () => {
    const lib = load(fakeBrowser({ ua: ANDROID_CHROME, storage: false }));
    assert.equal(lib.gloobalInstallDismissed(), false);
    assert.doesNotThrow(() => lib.gloobalInstallDismiss());
  });

  test("the credential itself is never what gets written", () => {
    const browser = fakeBrowser({ ua: ANDROID_CHROME });
    const lib = load(browser, () => "abc123");
    lib.gloobalInstallDismiss();
    const written = [...browser.held.values()].join("|");
    assert.equal(written, "abc123");
    // Which is the FOLD of the token, not the token — the fold lives in
    // sessionStore.js and is asserted there and in balance-mask.test.mjs.
    // Named here so that moving it back inline is a two-test failure.
    assert.match(strip(readSource("backend/services/api/sessionStore.js")),
      /function gloobalSessionFingerprint\(\)/,
      "the shared fingerprint has left sessionStore.js");
  });
});

describe("the install event is handled the one way it can be", () => {
  const hook = strip(source.slice(source.indexOf("function useInstallPrompt"), source.indexOf("function InstallIosSteps")));

  test("it is caught and kept, not asked for at the moment of the tap", () => {
    // beforeinstallprompt fires ONCE, early, and is gone if nobody calls
    // preventDefault on it. A listener registered when somebody taps the
    // button is a listener that has already missed it.
    assert.match(hook, /useEffect48\(\(\) => \{/);
    assert.match(hook, /event\.preventDefault\(\)/, "the event is not claimed, so Chrome keeps its own banner and ours never fires");
    assert.match(hook, /eventRef\.current = event/);
    assert.match(hook, /window\.addEventListener\("beforeinstallprompt"/);
  });

  test("a spent event is dropped rather than re-fired", () => {
    // The event is single-use whatever the person chose. Holding one that
    // has already been prompted gives a button that silently does nothing,
    // which is the exact failure this whole file exists to avoid.
    const prompt = hook.slice(hook.indexOf("const promptInstall"));
    const clears = (prompt.match(/eventRef\.current = null/g) || []).length;
    assert.ok(clears >= 2, `the spent event is cleared on ${clears} of the two paths`);
    assert.match(prompt, /catch/, "a browser that refuses leaves the button stuck on 'Installing…'");
  });

  test("everything is unhooked on unmount", () => {
    for (const name of ["beforeinstallprompt", "appinstalled"]) {
      assert.match(hook, new RegExp(`removeEventListener\\("${name}"`), `${name} is never removed`);
    }
  });

  test("installing while it is on screen takes it off screen", () => {
    assert.match(hook, /window\.addEventListener\("appinstalled"/,
      "somebody who installs from the browser's own menu keeps being asked to");
    assert.match(hook, /setInstalled\(true\)/);
  });
});

describe("where it is rendered", () => {
  const dash = strip(readSource(DASH));

  test("the banner is on the home tab, above the balance card", () => {
    const home = dash.slice(dash.indexOf('activeTab === "home" &&'));
    const banner = home.indexOf("<InstallBanner />");
    const wallet = home.indexOf("T.gradWallet");
    assert.ok(banner >= 0, "the dashboard no longer renders the banner");
    assert.ok(wallet >= 0 && banner < wallet,
      "the banner has moved below the balance card, where the people who need it will not scroll");
  });

  test("and nowhere near the login screen", () => {
    // Interrupting somebody mid-PIN with a download offer is the one place
    // this must never appear.
    assert.doesNotMatch(strip(readSource("frontend/components/dialogs/registerLogin.jsx")), /InstallBanner|InstallProfileRow/);
  });

  test("Profile carries the permanent way back, above Exit", () => {
    const profile = dash.slice(dash.indexOf('activeTab === "profile" &&'));
    const row = profile.indexOf("<InstallProfileRow");
    const exit = profile.indexOf("onClick={onLogout}");
    assert.ok(row >= 0, "Profile has no Install row");
    assert.ok(exit > row, "the Install row has moved below Exit");
  });

  test("it is in the bundle at all", () => {
    // A new file that is not in FRONTEND_MODULES is silently not included,
    // and the failure is a blank screen rather than a build error.
    const build = readSource("build_app.mjs");
    const at = build.indexOf("const FRONTEND_MODULES");
    const modules = build.slice(at, build.indexOf("\n];", at));
    assert.match(modules, /"components\/common\/installPrompt\.jsx"/);
    // Before every screen that renders it, since definitions must precede
    // use for anything the bundle evaluates at load time.
    assert.ok(
      modules.indexOf("installPrompt.jsx") < modules.indexOf("screens/Dashboard/Dashboard.jsx"),
      "the banner is emitted after the screen that draws it"
    );
  });
});
