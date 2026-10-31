// src/components/common/installPrompt.jsx
import { useState as useState49, useEffect as useEffect48, useRef as useRef28 } from "react";
import { Download, X as X11, Share as Share3, SquarePlus } from "lucide-react";

// ── ASKING PEOPLE TO KEEP THE APP ───────────────────────────────────────
//
// Gloobal is a PWA and has been installable the whole time — manifest,
// service worker, icons, standalone display, all of it in
// gloobal-essentials-preview/vite.config.js. Nothing has ever ASKED. So
// people who found it through a link have been using a payments app in a
// browser tab, through an address bar, with no icon on their phone, not
// because they chose that but because nobody told them there was another
// way.
//
// ── THE THREE PLATFORMS, AND THEY ARE NOT THE SAME ──────────────────────
//
// This is the part worth being honest about rather than papering over,
// because a banner that promises one tap and delivers nothing is worse
// than no banner.
//
//   CHROME, EDGE, Android and desktop: a real hook. The browser fires
//   `beforeinstallprompt`, we keep it, and our own button opens the
//   native install dialog. One tap, and it works.
//
//   SAFARI ON IPHONE: no install API exists. None. The only route is
//   Share → Add to Home Screen, performed by the person, in Apple's own
//   menu. We can show them where to tap and nothing more, so that is
//   exactly what this does — the two steps, with the two symbols Apple
//   actually draws, so they are looking for the right thing.
//
//   AND INSIDE ANOTHER APP'S BROWSER — Instagram, Gmail, Facebook — on
//   iOS there is no Add to Home Screen at all. Telling somebody to tap a
//   menu item their browser does not have is the worst of the three
//   failures, so that case says the true thing: open it in Safari first.
//
// Nobody who already has the app installed ever sees any of this.

// Already installed, by every signal a browser offers.
//
// display-mode is the standard and covers Chrome, Edge and installed PWAs
// everywhere; navigator.standalone is Apple's older one and is the only
// one that answers on an iPhone; the android-app referrer is a TWA, which
// is this app wrapped in a native shell and about as installed as it gets.
function gloobalAppIsInstalled() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia && window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (typeof document !== "undefined" && String(document.referrer || "").startsWith("android-app://")) return true;
  } catch (e) {
    // A browser that will not answer is one we do not pester.
    return true;
  }
  return false;
}

// Which of the three cases this is.
//
// iPad has reported itself as a Mac since iPadOS 13, which is why the
// touch-point test is here: a Macintosh with a touchscreen is an iPad, and
// an iPad installs the Apple way.
function gloobalInstallPlatform() {
  if (typeof navigator === "undefined") return "unsupported";
  const ua = String(navigator.userAgent || "");
  const touchMac = /Macintosh/.test(ua) && Number(navigator.maxTouchPoints) > 1;
  const apple = /iPhone|iPad|iPod/.test(ua) || touchMac;
  if (!apple) return "prompt";
  // On iOS every browser is Safari underneath, but only Safari's own
  // chrome has the Add to Home Screen item. Chrome and Firefox for iOS
  // have a share sheet; the embedded browsers inside Instagram, Facebook
  // and Gmail do not.
  const embedded = /FBAN|FBAV|Instagram|Line\/|Twitter|LinkedInApp|GSA\//.test(ua);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if (embedded || otherBrowser) return "ios-elsewhere";
  return "ios";
}

// Dismissed for THIS SIGN-IN, which is what was asked for: the banner
// comes back every time somebody signs in, and a tap on the cross clears
// it until they do.
//
// Keyed on the session's fingerprint rather than on a date or a counter.
// A date would hide it from somebody who signs in once a week; a counter
// would need somewhere to count. The fingerprint changes at exactly the
// moments "a new sign-in" means, and nowhere else — see
// gloobalSessionFingerprint in backend/services/api/sessionStore.js.
var GLOOBAL_INSTALL_DISMISS_KEY = "gloobal.installDismissed";

function gloobalInstallDismissed() {
  try {
    const held = window.localStorage.getItem(GLOOBAL_INSTALL_DISMISS_KEY);
    if (!held) return false;
    const now = typeof gloobalSessionFingerprint === "function" ? gloobalSessionFingerprint() : "";
    // No fingerprint means nobody is signed in, and a banner shown to
    // nobody signed in is not this banner's job anyway.
    return Boolean(now) && held === now;
  } catch (e) {
    return false;
  }
}

function gloobalInstallDismiss() {
  try {
    const now = typeof gloobalSessionFingerprint === "function" ? gloobalSessionFingerprint() : "";
    if (now) window.localStorage.setItem(GLOOBAL_INSTALL_DISMISS_KEY, now);
  } catch (e) {
    // Storage blocked. The banner comes back on the next render rather
    // than the next sign-in, which is a worse experience and not a broken
    // one, and there is nothing else to do about it.
  }
}

// Everything a caller needs to decide whether to draw anything.
//
// `beforeinstallprompt` fires once, early, and is lost if nobody calls
// preventDefault on it — so this listens from mount and keeps the event,
// rather than asking for it at the moment somebody taps.
function useInstallPrompt() {
  const [installed, setInstalled] = useState49(gloobalAppIsInstalled);
  const [canPrompt, setCanPrompt] = useState49(false);
  const [dismissed, setDismissed] = useState49(gloobalInstallDismissed);
  const eventRef = useRef28(null);

  useEffect48(() => {
    if (typeof window === "undefined") return undefined;
    const onBeforePrompt = (event) => {
      event.preventDefault();
      eventRef.current = event;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      eventRef.current = null;
      setCanPrompt(false);
      setInstalled(true);
    };
    // Somebody can install from the browser's own menu while this is on
    // screen, and on desktop they can also drag the window out of
    // standalone. Both change the answer without a reload.
    const media = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
    const onDisplay = () => setInstalled(gloobalAppIsInstalled());
    window.addEventListener("beforeinstallprompt", onBeforePrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (media && media.addEventListener) media.addEventListener("change", onDisplay);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforePrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (media && media.removeEventListener) media.removeEventListener("change", onDisplay);
    };
  }, []);

  const promptInstall = async () => {
    const event = eventRef.current;
    if (!event) return false;
    try {
      event.prompt();
      const choice = await event.userChoice;
      // The event is single-use whatever they chose. Chrome will fire a
      // fresh one later if it decides to; holding a spent one would give
      // us a button that silently does nothing.
      eventRef.current = null;
      setCanPrompt(false);
      return choice && choice.outcome === "accepted";
    } catch (e) {
      eventRef.current = null;
      setCanPrompt(false);
      return false;
    }
  };

  const dismiss = () => {
    gloobalInstallDismiss();
    setDismissed(true);
  };

  const platform = gloobalInstallPlatform();
  return {
    installed,
    platform,
    canPrompt,
    dismissed,
    dismiss,
    promptInstall,
    // Whether there is anything worth saying at all. Chrome before its
    // event has fired still gets the banner, with the menu route in the
    // words — the event is not guaranteed to arrive, and "Install" in the
    // browser's own menu is true regardless.
    offerable: !installed && platform !== "unsupported"
  };
}

// The two steps on an iPhone, drawn rather than described.
//
// Apple's share symbol is a box with an arrow leaving the top of it, and
// it is the thing people cannot find when they are told to "tap share".
// Showing it is most of the instruction.
function InstallIosSteps({ onDark }) {
  const ink = onDark ? "rgba(255,255,255,0.92)" : T.inkSoft;
  const strong = onDark ? "#FFFFFF" : T.ink;
  return <div
    style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12.5, color: ink, lineHeight: 1.45 }}
  ><span style={{ display: "flex", alignItems: "center", gap: 7 }}><Share3 size={15} color={strong} />
      Tap <strong style={{ color: strong }}>Share</strong> at the bottom of Safari
    </span><span style={{ display: "flex", alignItems: "center", gap: 7 }}><SquarePlus size={15} color={strong} />
      Then <strong style={{ color: strong }}>Add to Home Screen</strong>
    </span></div>;
}

// The banner, after signing in.
//
// Not on the login screen: that is where somebody is trying to type a PIN,
// and it is the worst moment to interrupt. Here they have already seen the
// app work, which is the honest moment to ask whether they want to keep
// it.
function InstallBanner() {
  const install = useInstallPrompt();
  const [busy, setBusy] = useState49(false);
  if (!install.offerable || install.dismissed) return null;

  const ios = install.platform === "ios";
  const elsewhere = install.platform === "ios-elsewhere";

  // ── WHY THIS IS NOT ANOTHER VIOLET SLAB ─────────────────────────────
  //
  // It was, first: the same dark gradient as the wallet card, sitting
  // directly above the wallet card. Rendered, the two ran together into
  // one block and the eye could not find the edge between them — and the
  // balance card is the thing this screen is FOR. A banner that makes the
  // balance harder to find has cost more than it could possibly win.
  //
  // So the loud object stays the one that was already loud, and this is a
  // notice in the app's soft violet: unmistakably Gloobal, unmistakably
  // secondary, with the single saturated thing on it being the button you
  // are meant to press.
  return <div
    data-testid="install-banner"
    style={{
      position: "relative",
      borderRadius: T.radiusLg,
      background: T.accentSoft,
      border: `1px solid rgba(${T.accentRgb},0.16)`,
      padding: "14px 15px",
      display: "flex",
      flexDirection: "column",
      gap: 11
    }}
  ><div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}><span
    aria-hidden="true"
    style={{ width: 36, height: 36, borderRadius: 12, background: T.gradButton, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><Download size={17} color="#fff" /></span><div style={{ flex: 1, minWidth: 0 }}><div
    style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, letterSpacing: -0.2 }}
  >
        Keep <GloobalWordmark /> on your phone
      </div><div
    style={{ fontSize: 12, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}
  >{elsewhere
    ? "Open this page in Safari to add it to your home screen."
    : "Opens like an app, works offline."}</div></div><button
    onClick={install.dismiss}
    aria-label="Not now"
    className="v2-tap"
    style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: `rgba(${T.accentRgb},0.10)`, color: T.accent, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}
  ><X11 size={14} /></button></div>{ios ? <InstallIosSteps /> : elsewhere ? null : <button
    onClick={async () => {
      if (busy) return;
      setBusy(true);
      // No event yet is not a dead end: every Chromium browser has
      // "Install app" in its own menu, and saying so is true whether or
      // not the event ever arrives.
      if (install.canPrompt) await install.promptInstall();
      setBusy(false);
    }}
    className="v2-tap"
    style={{
      alignSelf: "flex-start",
      border: "none",
      borderRadius: 999,
      padding: "10px 20px",
      background: T.gradButton,
      color: "#fff",
      fontSize: 13.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >{install.canPrompt ? (busy ? "Installing…" : "Install") : "How to install"}</button>}{!install.canPrompt && !ios && !elsewhere && <div
    style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}
  >
      Open your browser's menu and choose <strong style={{ color: T.ink }}>Install app</strong>.
    </div>}</div>;
}

// And the way back, for somebody who dismissed it twice and then changed
// their mind. A row in Profile, which disappears the moment the app is
// installed — a permanent "Install" on a screen inside the installed app
// is a control that can only confuse.
function InstallProfileRow({ onToast }) {
  const install = useInstallPrompt();
  if (!install.offerable) return null;
  const ios = install.platform === "ios";
  const elsewhere = install.platform === "ios-elsewhere";

  return <div
    data-testid="install-profile-row"
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
  ><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span
    aria-hidden="true"
    style={{ width: 34, height: 34, borderRadius: 11, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><Download size={16} color={T.accent} /></span><div style={{ flex: 1, minWidth: 0 }}><div
    style={{ fontSize: 14, fontWeight: 800, color: T.ink }}
  >
        Install <GloobalWordmark />
      </div><div style={{ fontSize: 12, color: T.inkSoft, marginTop: 1 }}>
        An icon on your home screen
      </div></div>{!ios && !elsewhere && <button
    onClick={async () => {
      if (install.canPrompt) {
        const ok = await install.promptInstall();
        if (ok && onToast) onToast("Installing GLOOBAL…");
      } else if (onToast) {
        onToast("Open your browser's menu and choose Install app.");
      }
    }}
    className="v2-tap"
    style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "9px 18px", background: T.gradButton, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
  >
        Install
      </button>}</div>{ios && <InstallIosSteps />}{elsewhere && <div
    style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}
  >
      Open this page in Safari first — this browser cannot add it to your
      home screen.
    </div>}</div>;
}
