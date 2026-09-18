// tests/fake-camera.mjs
//
// A configurable fake lens, so the camera CONTROLS can be tested.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// The only camera stub in this suite was inline in scanner-optics.test.mjs:
// getUserMedia replaced by a canvas captureStream. That is exactly right for
// what it tests — the constraints the app HANDS the browser — but a canvas
// track reports no torch, no zoom and no focusMode at all, so every control
// that is drawn "only where the hardware has one" is drawn nowhere, and the
// behaviour behind those controls could only be asserted by grepping source.
// A regex can tell you `advanced: [constraint]` appears in the file. It
// cannot tell you the button sent ONE constraint, that the value was inside
// the range the lens reported, or that the label followed the lens rather
// than the request.
//
// So this keeps the canvas captureStream — a real MediaStream with a real
// video track, needing no hardware — and overrides the three methods the
// component actually interrogates on its video track:
//
//   getCapabilities()  what the lens says it can do      (configurable)
//   getSettings()      where the lens says it is now     (configurable)
//   applyConstraints() the request                       (recorded, and it
//                                                         can refuse, obey,
//                                                         or lie)
//
// ── What it is NOT ───────────────────────────────────────────────────────
//
// Headless Chromium with a canvas behind it. No lens, no LED, no sensor.
// Nothing here verifies that a real phone's torch lights or that its optics
// move; it verifies what the app ASKS FOR and what it DISPLAYS given an
// answer. Real-device behaviour stays a manual check.
//
// ── The three ways a device can disappoint you ───────────────────────────
//
// All three are configurable because the component defends against all three:
//
//   rejects    applyConstraints throws. The honest failure.
//   ignores    applyConstraints RESOLVES and nothing changes. The common
//              one: a camera already held by another app, or a device that
//              advertises a capability and declines it. This is the case a
//              button that trusts its own request gets wrong.
//   settles    applyConstraints resolves on a DIFFERENT value than asked —
//              a lens quantising 4.5x to the 3x step it actually has.
//
// And one more shape of the same problem:
//
//   unreported getSettings() omits the key entirely, so there is nothing to
//              read back and the caller's fallback has to carry it.

// Build the page init script for a fake camera.
//
// config:
//   torch        boolean            — the lens reports a torch at all
//   zoom         {min,max,step?}    — the zoom range it reports; step may be
//                                     omitted to exercise the caller's own
//                                     fallback. Omit `zoom` for no zoom.
//   zoomRaw      any                — put this under caps.zoom verbatim,
//                                     overriding `zoom`. For the engines
//                                     that report zoom as a bare boolean.
//   focusMode    string[]           — e.g. ["continuous","manual"]; []/omitted
//                                     for a fixed-focus track.
//   initialTorch boolean            — where the torch starts (default off)
//   initialZoom  number             — where the lens starts (default zoom.min)
//   rejects      string[]           — constraint keys the device refuses; an
//                                     applyConstraints call mentioning one
//                                     rejects WHOLE, the way a real one does.
//   ignores      string[]           — keys it resolves and then does nothing
//                                     about.
//   settles      {key: value}       — keys where it lands on its own value
//                                     rather than the requested one.
//   unreported   string[]           — keys getSettings() leaves out.
//   width/height number             — the canvas behind the stream.
//
// Returns [fn, arg] ready to spread into page.addInitScript.
export function fakeCameraInit(config = {}) {
  return [installFakeCameraInPage, normalise(config)];
}

// The same thing, applied. `target` is a Playwright Page or BrowserContext.
//
// On a Page this must be followed by a reload: openPage() has already
// navigated, and an init script only runs on the navigations after it.
export async function installFakeCamera(target, config = {}) {
  const [fn, arg] = fakeCameraInit(config);
  await target.addInitScript(fn, arg);
}

function normalise(config) {
  return {
    torch: Boolean(config.torch),
    zoom: config.zoom ? { min: config.zoom.min, max: config.zoom.max, step: config.zoom.step } : null,
    zoomRaw: Object.prototype.hasOwnProperty.call(config, "zoomRaw") ? config.zoomRaw : undefined,
    hasZoomRaw: Object.prototype.hasOwnProperty.call(config, "zoomRaw"),
    focusMode: Array.isArray(config.focusMode) ? config.focusMode.slice() : [],
    initialTorch: Boolean(config.initialTorch),
    initialZoom: typeof config.initialZoom === "number" ? config.initialZoom : null,
    rejects: Array.isArray(config.rejects) ? config.rejects.slice() : [],
    ignores: Array.isArray(config.ignores) ? config.ignores.slice() : [],
    settles: config.settles && typeof config.settles === "object" ? { ...config.settles } : {},
    unreported: Array.isArray(config.unreported) ? config.unreported.slice() : [],
    width: config.width || 1280,
    height: config.height || 720,
    // How the camera refuses to open at all: a DOMException name, the
    // message the engine would carry, how many asks it refuses before
    // relenting, and what the Permissions API says about it meanwhile.
    fail: config.fail || null,
    failMessage: config.failMessage || "",
    failTimes: config.failTimes == null ? null : config.failTimes,
    permission: config.permission || null
  };
}

// Runs IN THE PAGE. Everything it needs is in `cfg`; it closes over nothing
// from this module, because Playwright serialises it across.
function installFakeCameraInPage(cfg) {
  const calls = [];
  const requests = [];
  const state = {
    torch: cfg.initialTorch,
    zoom: cfg.initialZoom != null ? cfg.initialZoom : cfg.zoom ? cfg.zoom.min : null
  };

  const clone = (v) => {
    try {
      return JSON.parse(JSON.stringify(v == null ? null : v));
    } catch (e) {
      return String(v);
    }
  };

  const capabilities = () => {
    const caps = {};
    if (cfg.torch) caps.torch = true;
    if (cfg.focusMode.length) caps.focusMode = cfg.focusMode.slice();
    if (cfg.hasZoomRaw) {
      caps.zoom = cfg.zoomRaw;
    } else if (cfg.zoom) {
      caps.zoom = { min: cfg.zoom.min, max: cfg.zoom.max };
      // `step` omitted entirely when the config omits it, rather than set to
      // undefined: the caller's fallback only triggers on an absent/unusable
      // step, and a key present-but-undefined is a different shape.
      if (cfg.zoom.step != null) caps.zoom.step = cfg.zoom.step;
    }
    return caps;
  };

  const clamp = (value) => {
    if (!cfg.zoom) return value;
    return Math.min(cfg.zoom.max, Math.max(cfg.zoom.min, value));
  };

  window.__camera = {
    // Every applyConstraints argument, deep-cloned, in the order it arrived.
    // Cloned because the component reuses nothing but a reader here would
    // otherwise be asserting on a live object.
    calls,
    // Every getUserMedia constraint object, same treatment.
    requests,
    // The lens's own idea of where it is. What getSettings() reports, and
    // what the assertions compare the on-screen label against.
    state,
    config: cfg,
    // Constraint entries mentioning `key`, flattened out of `advanced`.
    entriesFor(key) {
      return calls
        .flatMap((c) => (Array.isArray(c && c.advanced) ? c.advanced : []))
        .filter((a) => a && Object.prototype.hasOwnProperty.call(a, key));
    },
    // Whole calls mentioning `key` — kept separate from entriesFor because
    // "one constraint per call" is a claim about the CALL, not the entry.
    callsFor(key) {
      return calls.filter((c) => Array.isArray(c && c.advanced) && c.advanced.some((a) => a && Object.prototype.hasOwnProperty.call(a, key)));
    }
  };
  // A plainer alias, for a page.evaluate that wants one expression.
  window.__cameraCalls = calls;

  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  }

  // The decision the Permissions API reports, when the config names one.
  // `permission: null` leaves whatever the browser already does, which is
  // how the "engine will not answer" path gets exercised; "unsupported"
  // removes navigator.permissions outright, which is the older-WebKit case.
  if (cfg.permission === "unsupported") {
    try {
      Object.defineProperty(navigator, "permissions", { value: undefined, configurable: true });
    } catch (e) { /* leave it */ }
  } else if (cfg.permission === "throws") {
    try {
      Object.defineProperty(navigator, "permissions", {
        value: { query: () => Promise.reject(new Error("not queryable")) },
        configurable: true
      });
    } catch (e) { /* leave it */ }
  } else if (cfg.permission) {
    try {
      Object.defineProperty(navigator, "permissions", {
        value: { query: () => Promise.resolve({ state: cfg.permission }) },
        configurable: true
      });
    } catch (e) { /* leave it */ }
  }

  navigator.mediaDevices.getUserMedia = function (constraints) {
    requests.push(clone(constraints || {}));

    // A camera that refuses to open. `failTimes` lets it refuse only the
    // first N asks, which is what a retry has to survive to prove anything:
    // the overlay is cleared, the same call is made again, and this time it
    // works.
    if (cfg.fail && requests.length <= (cfg.failTimes == null ? Infinity : cfg.failTimes)) {
      const err = new Error(cfg.failMessage || "");
      err.name = cfg.fail;
      return Promise.reject(err);
    }

    const canvas = document.createElement("canvas");
    canvas.width = cfg.width;
    canvas.height = cfg.height;
    const ctx = canvas.getContext("2d");
    const paint = () => {
      ctx.fillStyle = "#6b6b6b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // A moving pixel so the track keeps producing frames and the video
      // element reaches readyState 2 — a completely static canvas can stall
      // captureStream after its first frame.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect((Date.now() / 60) % canvas.width, 0, 4, 4);
    };
    paint();
    const stream = canvas.captureStream(10);
    const timer = setInterval(paint, 120);

    const track = stream.getVideoTracks()[0];
    if (track) {
      const nativeSettings = track.getSettings ? track.getSettings.bind(track) : () => ({});
      const nativeStop = track.stop.bind(track);

      track.getCapabilities = () => capabilities();

      track.getSettings = () => {
        const settings = Object.assign({}, nativeSettings());
        if (cfg.torch && cfg.unreported.indexOf("torch") === -1) settings.torch = state.torch;
        if (cfg.zoom && state.zoom != null && cfg.unreported.indexOf("zoom") === -1) settings.zoom = state.zoom;
        return settings;
      };

      track.applyConstraints = (constraints) => {
        calls.push(clone(constraints || {}));
        const advanced = (constraints && constraints.advanced) || [];
        const keys = advanced.flatMap((a) => Object.keys(a || {}));

        // One unsupported key rejects the WHOLE call on a real device,
        // taking the supported ones down with it. That is the entire reason
        // the component applies constraints one at a time, so the fake has
        // to behave the same way or the test proves nothing.
        if (keys.some((k) => cfg.rejects.indexOf(k) !== -1)) {
          const err = new Error("Fake lens refused: " + keys.join(", "));
          err.name = "OverconstrainedError";
          return Promise.reject(err);
        }

        for (const entry of advanced) {
          for (const key of Object.keys(entry || {})) {
            if (cfg.ignores.indexOf(key) !== -1) continue;
            if (Object.prototype.hasOwnProperty.call(cfg.settles, key)) {
              // The lens lands where IT wants to, not where it was asked.
              state[key] = key === "zoom" ? clamp(cfg.settles[key]) : cfg.settles[key];
              continue;
            }
            if (key === "torch") state.torch = Boolean(entry.torch);
            if (key === "zoom") state.zoom = clamp(Number(entry.zoom));
            // focusMode and pointsOfInterest are accepted and recorded, and
            // hold no state worth faking.
          }
        }
        return Promise.resolve();
      };

      track.stop = () => {
        clearInterval(timer);
        nativeStop();
      };
    }

    return Promise.resolve(stream);
  };
}
