// src/features/identity/liveFaceCheck.jsx
//
// ── THE LIVE PHOTO ─────────────────────────────────────────────────────────
//
// The founder: a person's photo is not uploaded, it is TAKEN, here, live.
// The same check runs at registration and whenever the photo is changed
// later, and (without a photo) to confirm a large payment.
//
// What it does, in order:
//
//   1. Camera only. There is no gallery button anywhere in this flow.
//   2. Three moves, drawn at random from six — turn left, turn right, look
//      up, look down, blink, smile — shown as three cards above the camera
//      so the person sees the whole sequence before it starts. Each move is
//      read off the face mesh against the person's OWN resting face, and
//      the head returns to the centre between turns. A photo held up to the
//      lens can't move; a recording can't know which three came up.
//      (Saying numbers out loud was dropped: speech recognition failed too
//      often, and nobody should have to say numbers aloud in a shop.)
//   3. Hold still for two seconds, with a countdown; the shutter takes it
//      sooner. The library's anti-spoof and liveness models score those
//      frames, a face descriptor is taken from them, and the photo is cut
//      from the best one. The descriptor taken now must match one taken
//      during step 2, so the face can't be swapped midway.
//   4. "This is you": keep it or retake.
//
// What leaves the phone: the photo, and the descriptor (a list of numbers
// the server stores encrypted, so the same face can't open two GLOOBAL IDs).
// The video doesn't; no microphone is used.
//
// ── THE FACE LIBRARY ──────────────────────────────────────────────────────
//
// @vladmandic/human (MIT): face detector, 468-point mesh, face descriptor,
// anti-spoof and liveness models in one package. About 2 MB of code and
// 10 MB of models, so it is imported only when this screen opens — never
// with the app — and the models are served from /face-models/ on our own
// origin (copied out of node_modules at build, vite.config.js). Nothing is
// fetched from a CDN.
//
// Everything this file decides is in the plain functions at the top (head
// direction, eyes closed, a smile), so they can be tested without a camera.
// The component only feeds them frames.
import { useState as useState97, useEffect as useEffect94, useRef as useRef56 } from "react";
import { Camera as Camera7, Eye as LiveEye, Smile as LiveSmile, Lock as Lock9, Check as Check13, ArrowLeft as ArrowLeft9, ArrowRight as LiveArrowRight, ArrowUp as LiveArrowUp, ArrowDown as LiveArrowDown, Loader as Loader9 } from "lucide-react";

// Which network produced a descriptor. Stored with it on the server, and
// descriptors from different models are never compared.
var LIVE_FACE_MODEL = "human-faceres@3.3";
var LIVE_FACE_MODEL_PATH = "/face-models/";

// ── Digits ────────────────────────────────────────────────────────────────

// ── The face, measured ────────────────────────────────────────────────────
//
// From the mesh, in the camera's own (un-mirrored) image coordinates:
//   yaw    nose tip across from the middle of the eyes, in eye-widths.
//          Turning to one's own LEFT moves the nose to the image's RIGHT,
//          so yaw goes UP.
//   pitch  nose tip below the eye line, in face-heights. Looking UP brings
//          the nose tip closer to the eye line, so pitch goes DOWN.
//   mouth  gap between the inner lips, in face-heights.
//   eyes   how open the eyes are: the lid gap of both eyes (upper lid 159 /
//          386 to lower lid 145 / 374), in eye-widths. Closed eyes bring it
//          near zero.
//   smile  the mouth's width, corner 61 to corner 291, in eye-widths. A
//          smile widens it.
// All are compared with the person's own resting values (the baseline),
// never with fixed numbers: faces differ more than heads turn.
function liveFacePose(mesh) {
  if (!Array.isArray(mesh) || mesh.length < 468) return null;
  const L = mesh[33], R = mesh[263], N = mesh[1], top = mesh[10], chin = mesh[152], up = mesh[13], lo = mesh[14];
  const eyeX = (L[0] + R[0]) / 2;
  const eyeY = (L[1] + R[1]) / 2;
  const eyeW = Math.hypot(R[0] - L[0], R[1] - L[1]);
  const faceH = Math.abs(chin[1] - top[1]);
  if (!eyeW || !faceH) return null;
  const lid = (a, b) => Math.abs(mesh[a][1] - mesh[b][1]);
  return {
    yaw: (N[0] - eyeX) / eyeW,
    pitch: (N[1] - eyeY) / faceH,
    mouth: Math.abs(lo[1] - up[1]) / faceH,
    eyes: (lid(159, 145) + lid(386, 374)) / 2 / eyeW,
    smile: Math.hypot(mesh[291][0] - mesh[61][0], mesh[291][1] - mesh[61][1]) / eyeW
  };
}

function liveFaceBaseline(poses) {
  const mid = (k) => {
    const v = poses.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return { yaw: mid("yaw"), pitch: mid("pitch"), mouth: mid("mouth"), eyes: mid("eyes"), smile: mid("smile") };
}

// Eyes closed: the lid gap under 45% of the person's own open gap, with the
// head roughly where it started (looking down also narrows the gap, and is
// its own move). A blink is seen when the eyes CLOSE and then OPEN again.
var LIVE_FACE_EYES_CLOSED = 0.45;
var LIVE_FACE_EYES_OPEN = 0.75;
function liveFaceEyesClosed(pose, base) {
  return Boolean(pose && base && base.eyes > 0) && pose.eyes < base.eyes * LIVE_FACE_EYES_CLOSED && liveFaceStill(pose, base, 2.5);
}
function liveFaceEyesOpen(pose, base) {
  return Boolean(pose && base && base.eyes > 0) && pose.eyes > base.eyes * LIVE_FACE_EYES_OPEN;
}

// A smile: the mouth at least 12% wider than at rest, or clearly open (a
// laugh), with the head roughly where it started.
var LIVE_FACE_SMILE = 1.12;
function liveFaceSmiling(pose, base) {
  if (!pose || !base || !(base.smile > 0)) return false;
  const wider = pose.smile > base.smile * LIVE_FACE_SMILE;
  const open = pose.mouth - base.mouth > 0.05;
  return (wider || open) && liveFaceStill(pose, base, 2.5);
}

// 0254, after the founder's first try on a real phone ("I entered this stage
// after 15 tries … we need to clear it under 5–10 seconds"): a smaller turn
// counts, and left/right is accepted either way round. Front cameras and
// browsers disagree on mirroring, so which side is "left" in the image can't
// be relied on — a person following the arrow on screen must never fail
// for it. Up/down stays distinct from left/right; what a replayed clip
// can't do is follow a fresh sequence of turns-and-returns in time.
var LIVE_FACE_TURN = { yaw: 0.06, pitch: 0.025 };
var LIVE_FACE_STILL = { yaw: 0.06, pitch: 0.03 };

function liveFaceTurned(dir, pose, base) {
  if (!pose || !base) return false;
  const dy = pose.yaw - base.yaw;
  const dp = pose.pitch - base.pitch;
  if (dir === "left" || dir === "right") return Math.abs(dy) > LIVE_FACE_TURN.yaw;
  if (dir === "up" || dir === "down") return Math.abs(dp) > LIVE_FACE_TURN.pitch && Math.abs(dy) < LIVE_FACE_TURN.yaw * 1.5;
  return false;
}

// `slack` widens it: "back to the centre" between moves needn't be as
// exact as the still photo at the end.
function liveFaceStill(pose, base, slack = 1) {
  return Boolean(pose && base) &&
    Math.abs(pose.yaw - base.yaw) < LIVE_FACE_STILL.yaw * slack &&
    Math.abs(pose.pitch - base.pitch) < LIVE_FACE_STILL.pitch * slack;
}

// The moves. Three drawn at random from six, no move twice, with a return
// to the centre between head turns — so a recorded clip would have to
// contain this exact sequence, which was only drawn a second ago.
var LIVE_FACE_DIRS = ["left", "right", "up", "down"];
var LIVE_FACE_MOVES = [...LIVE_FACE_DIRS, "blink", "smile"];
var LIVE_FACE_MOVE_COUNT = 3;
function liveFaceMoves(rand = Math.random, n = LIVE_FACE_MOVE_COUNT) {
  const pool = LIVE_FACE_MOVES.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
// The older name, kept for the payment check's wording.
function liveFaceTurns(rand = Math.random, n = LIVE_FACE_MOVE_COUNT) { return liveFaceMoves(rand, n); }
function liveFaceIsTurn(move) { return LIVE_FACE_DIRS.includes(move); }

// How long to hold still at the end: two seconds, counted down on the ring,
// so the photo is a composed one and not the first usable frame. The
// shutter takes it sooner.
var LIVE_FACE_HOLD_MS = 2000;

// Is the one face in the frame usable? Returns null when it is, or the
// hint to show. `w`/`h` are the frame's size.
function liveFaceFrameHint(faces, w, h) {
  const real = (faces || []).filter((f) => f && f.box && f.box[2] > w * 0.12);
  if (real.length === 0) return "none";
  if (real.length > 1) return "many";
  const [x, y, bw, bh] = real[0].box;
  if (bw < w * 0.28) return "closer";
  const cx = (x + bw / 2) / w;
  const cy = (y + bh / 2) / h;
  if (Math.abs(cx - 0.5) > 0.18 || Math.abs(cy - 0.5) > 0.2) return "center";
  return null;
}

var LIVE_FACE_HINTS = {
  none: ["Bring your face into the circle", "चेहरा गोले में लाइए"],
  many: ["Only you in the frame, please", "फ़्रेम में सिर्फ़ आप रहें"],
  closer: ["Move a little closer", "थोड़ा पास आइए"],
  center: ["Keep your face in the middle", "चेहरा बीच में रखिए"],
  straight: ["Look straight at the camera", "सीधे कैमरे में देखिए"]
};

var LIVE_FACE_TURN_TEXT = {
  left: ["Turn your head left", "सिर बाएँ घुमाइए"],
  right: ["Turn your head right", "सिर दाएँ घुमाइए"],
  up: ["Look up", "ऊपर देखिए"],
  down: ["Look down", "नीचे देखिए"],
  blink: ["Close your eyes, then open", "आँखें बंद करके खोलिए"],
  smile: ["Smile", "मुस्कुराइए"]
};
// The short word on each card.
var LIVE_FACE_MOVE_WORD = {
  left: ["Turn left", "बाएँ"], right: ["Turn right", "दाएँ"], up: ["Look up", "ऊपर"], down: ["Look down", "नीचे"],
  blink: ["Blink", "पलक"], smile: ["Smile", "मुस्कान"]
};

// The scores a still or a screen gets from the library's two models. Kept
// lenient: these sit after the moves, which are the real test, and
// a strict cut-off fails honest people in dim rooms first.
var LIVE_FACE_MIN_REAL = 0.4;
var LIVE_FACE_MIN_LIVE = 0.4;
var LIVE_FACE_SAME_PERSON = 0.5;

function liveFaceAverage(vectors) {
  if (!vectors.length) return null;
  const n = vectors[0].length;
  const out = new Array(n).fill(0);
  for (const v of vectors) for (let i = 0; i < n; i++) out[i] += v[i] / vectors.length;
  return out;
}

// ── The engine ────────────────────────────────────────────────────────────
//
// One shape for the real library and for the test fake:
//   detect(canvas) → [{ box:[x,y,w,h], mesh:[[x,y,z]…], score, embedding?, real?, live? }]
//   similarity(a, b) → 0..1, 0.5 and above is the same person
// window.__GLOOBAL_FACE_ENGINE__ stands in for the library in the browser
// tests, which have a canvas for a camera and no face model.
var liveFaceEnginePromise = null;

var LIVE_FACE_HUMAN_CONFIG = {
  modelBasePath: LIVE_FACE_MODEL_PATH,
  backend: "webgl",
  debug: false,
  warmup: "none",
  // The model files are kept in the phone's IndexedDB after the first load,
  // so the next check starts without downloading them again. This is the
  // library's default in a browser; written out so nobody turns it off
  // without seeing why it is on.
  cacheModels: true,
  // Every frame is new; nothing is reused from the last one.
  cacheSensitivity: 0,
  filter: { enabled: true, equalization: false, flip: false },
  face: {
    enabled: true,
    detector: { enabled: true, modelPath: "blazeface.json", maxDetected: 3, minConfidence: 0.5, rotation: false, return: false },
    mesh: { enabled: true, modelPath: "facemesh.json" },
    attention: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    description: { enabled: true, modelPath: "faceres.json" },
    antispoof: { enabled: true, modelPath: "antispoof.json" },
    liveness: { enabled: true, modelPath: "liveness.json" }
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
  gesture: { enabled: false }
};

function liveFaceLoadEngine() {
  if (typeof window !== "undefined" && window.__GLOOBAL_FACE_ENGINE__) {
    return Promise.resolve(window.__GLOOBAL_FACE_ENGINE__);
  }
  if (!liveFaceEnginePromise) {
    liveFaceEnginePromise = import("@vladmandic/human")
      .then(async (mod) => {
        const Human = mod.Human || mod.default;
        const human = new Human(LIVE_FACE_HUMAN_CONFIG);
        await human.load();
        return {
          // `heavy` runs the descriptor, anti-spoof and liveness models too.
          // They are needed only for the photo itself (and one look at the
          // start); every other frame only needs the mesh, which keeps a
          // mid-range phone at a usable frame rate.
          async detect(input, heavy = true) {
            const result = await human.detect(input, {
              face: { description: { enabled: heavy }, antispoof: { enabled: heavy }, liveness: { enabled: heavy } }
            });
            return (result.face || []).map((f) => ({
              box: f.box,
              mesh: f.mesh,
              score: f.faceScore || f.boxScore || f.score || 0,
              embedding: Array.isArray(f.embedding) || (f.embedding && f.embedding.length) ? Array.from(f.embedding) : null,
              real: typeof f.real === "number" ? f.real : null,
              live: typeof f.live === "number" ? f.live : null
            }));
          },
          similarity: (a, b) => human.match.similarity(a, b)
        };
      })
      .catch((err) => {
        // A failed download (offline, a deploy mid-flight) must not stick:
        // the next Open camera tries again.
        liveFaceEnginePromise = null;
        throw err;
      });
  }
  return liveFaceEnginePromise;
}

function liveFaceDefaultLang() {
  try {
    const saved = localStorage.getItem("gloobal.liveFaceLang");
    if (saved === "hi" || saved === "en") return saved;
  } catch (e) { /* storage blocked: fall through */ }
  const nav = typeof navigator !== "undefined" ? String(navigator.language || "") : "";
  return nav.toLowerCase().startsWith("hi") ? "hi" : "en";
}

// The square photo, cut around the face from the frame it was measured on,
// mirrored so it looks like what the person saw.
function liveFaceCrop(canvas, box) {
  const [x, y, w, h] = box;
  let size = Math.max(w, h) * 1.9;
  size = Math.min(size, canvas.width, canvas.height);
  let cx = x + w / 2;
  let cy = y + h / 2 - h * 0.06;
  let sx = Math.max(0, Math.min(canvas.width - size, cx - size / 2));
  let sy = Math.max(0, Math.min(canvas.height - size, cy - size / 2));
  const out = document.createElement("canvas");
  out.width = 720;
  out.height = 720;
  const ctx = out.getContext("2d");
  ctx.translate(720, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, sx, sy, size, size, 0, 0, 720, 720);
  return out.toDataURL("image/jpeg", 0.9);
}

// ── The screen ────────────────────────────────────────────────────────────
//
// Props:
//   purpose   "register" | "change"
//   current   the photo there now (change only), for the different-face step
//   onUse(result, pin?) → Promise<{ ok } | { needsPin } | { pending, activateAt } | { message }>
//             result = { photo, descriptor, model, method }
//   onClose() the person backed out, or finished
//   onSaved(outcome)  after the photo is saved or scheduled
function LiveFaceCheck({ purpose = "register", current, onUse, onClose, onSaved, small = false }) {
  const [phase, setPhase] = useState97("intro");
  const [lang, setLang] = useState97(liveFaceDefaultLang);
  const [hint, setHint] = useState97(null);
  const [turns, setTurns] = useState97(() => liveFaceMoves());
  const [turnIndex, setTurnIndex] = useState97(0);
  const [backToCenter, setBackToCenter] = useState97(false);
  // For the blink card: the eyes have been seen closed, waiting to open.
  const [eyesClosed, setEyesClosed] = useState97(false);
  const [holdPct, setHoldPct] = useState97(0);
  // What the server is told about how the check was done. "moves": three
  // of the six moves. (The server still accepts the older "turns".)
  const method = "moves";
  // A payment check's answer from the server, when it isn't a yes.
  const [payFail, setPayFail] = useState97(null);
  const [fail, setFail] = useState97(null);
  const [result, setResult] = useState97(null);
  const [saving, setSaving] = useState97(false);
  const [saveError, setSaveError] = useState97("");
  const [pin, setPin] = useState97("");
  const [pending, setPending] = useState97(null);

  const videoRef = useRef56(null);
  const streamRef = useRef56(null);
  const loopRef = useRef56({ alive: false });
  const stateRef = useRef56({});

  const hi = lang === "hi";
  const say = (pair) => (hi ? pair[1] : pair[0]);

  const stopCamera = () => {
    loopRef.current.alive = false;
    const s = streamRef.current;
    streamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());
  };

  useEffect94(() => () => stopCamera(), []);
  // Start downloading the face models while the intro is being read, so
  // "Open camera" doesn't wait on 12 MB.
  useEffect94(() => { liveFaceLoadEngine().catch(() => { /* retried on Open camera */ }); }, []);

  const failWith = (reason) => {
    stopCamera();
    setFail(reason);
    setPhase("fail");
  };

  // ── Start: camera, then the engine, then the frame loop ────────────────
  const start = async () => {
    setFail(null);
    setHint(null);
    setHoldPct(0);
    setTurnIndex(0);
    setTurns(liveFaceMoves());
    setPayFail(null);
    setBackToCenter(false);
    setEyesClosed(false);
    setPhase("starting");
    stateRef.current = { method, poses: [], base: null, stage: "align", challengeEmbeddings: [], holdStart: 0, hold: [], best: null, turnHits: 0, turnIndex: 0, needCenter: false, eyesClosed: false, stageStart: 0, shutter: false };
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
    } catch (err) {
      return failWith("camera");
    }
    streamRef.current = stream;
    let engine;
    try {
      engine = await liveFaceLoadEngine();
    } catch (err) {
      return failWith("engine");
    }
    if (streamRef.current !== stream) return;
    const video = videoRef.current;
    if (!video) return failWith("camera");
    video.srcObject = stream;
    try { await video.play(); } catch (e) { /* autoplay with muted+playsInline is allowed */ }
    setPhase("align");
    loopRef.current = { alive: true };
    run(engine, loopRef.current);
  };

  // ── The frame loop ─────────────────────────────────────────────────────
  const run = async (engine, loop) => {
    const work = document.createElement("canvas");
    const ctx = work.getContext("2d", { willReadFrequently: true });
    const video = videoRef.current;
    while (loop.alive) {
      if (!video || video.readyState < 2 || !video.videoWidth) {
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      if (work.width !== video.videoWidth) {
        work.width = video.videoWidth;
        work.height = video.videoHeight;
      }
      ctx.drawImage(video, 0, 0, work.width, work.height);
      let faces;
      try {
        const stage = stateRef.current.stage;
        faces = await engine.detect(work, stage === "align" || stage === "hold");
      } catch (err) {
        if (loop.alive) failWith("engine");
        return;
      }
      if (!loop.alive) return;
      step(faces, work, engine);
      await new Promise((r) => setTimeout(r, 16));
    }
  };

  const step = (faces, frame, engine) => {
    const st = stateRef.current;
    const now = Date.now();
    const problem = liveFaceFrameHint(faces, frame.width, frame.height);
    const face = problem ? null : faces.find((f) => f.box[2] > frame.width * 0.12);
    const pose = face ? liveFacePose(face.mesh) : null;
    if (face && face.embedding && (st.stage === "align" || st.stage === "combo")) st.challengeEmbeddings.push(face.embedding);

    if (st.stage === "align") {
      if (!pose) {
        st.poses = [];
        setHint(problem || "none");
        return;
      }
      setHint(null);
      st.poses.push(pose);
      if (st.poses.length >= 3) {
        st.base = liveFaceBaseline(st.poses);
        st.stageStart = now;
        st.stage = "combo";
        setPhase("combo");
      }
      return;
    }

    if (st.stage === "combo") {
      setHint(pose ? null : problem || "none");
      const list = turnsRef.current;
      // Between moves: come back to the centre first, so "left, left" is two
      // turns and not one held turn counted twice.
      if (st.needCenter) {
        if (pose && liveFaceStill(pose, st.base, 2.5)) {
          st.needCenter = false;
          st.stageStart = now;
          setBackToCenter(false);
        } else if (now - st.stageStart > 6000) {
          failWith("turn");
        }
        return;
      }
      // Each move seen in two frames running; seven seconds to make it.
      const move = list[st.turnIndex];
      if (move === "blink") {
        // Close, then open: a closed frame arms it, an open frame after
        // that counts. (One closed frame is enough — a blink is short and
        // the camera is slow.)
        if (pose && liveFaceEyesClosed(pose, st.base) && !st.eyesClosed) { st.eyesClosed = true; setEyesClosed(true); }
        st.turnHits = st.eyesClosed && pose && liveFaceEyesOpen(pose, st.base) ? 2 : 0;
      } else {
        const hit = move === "smile" ? liveFaceSmiling(pose, st.base) : liveFaceTurned(move, pose, st.base);
        if (pose && hit) st.turnHits += 1; else st.turnHits = 0;
      }
      if (st.turnHits >= 2) {
        st.turnIndex += 1;
        st.turnHits = 0;
        st.eyesClosed = false;
        setEyesClosed(false);
        st.stageStart = now;
        setTurnIndex(st.turnIndex);
        if (st.turnIndex >= list.length) {
          st.stage = "hold";
          st.holdStart = 0;
          setPhase("hold");
        } else if (liveFaceIsTurn(move)) {
          // Only a head turn needs a return to the centre; after a blink or
          // a smile the head is already there.
          st.needCenter = true;
          setBackToCenter(true);
        }
        return;
      }
      if (now - st.stageStart > (move === "blink" || move === "smile" ? 9000 : 7000)) failWith(move === "blink" ? "blink" : move === "smile" ? "smile" : "turn");
      return;
    }

    if (st.stage === "hold") {
      // 0254: no longer "as still as at the start" — on a real phone that
      // kept people on "Look straight at the camera" indefinitely. A face in
      // the circle is enough; the photo is the best of the frames, and the
      // Take photo button takes it at once.
      if (!pose) {
        setHint(problem || "none");
        return;
      }
      setHint(null);
      if (!st.holdStart) st.holdStart = now;
      st.hold.push({ embedding: face.embedding, real: face.real, live: face.live });
      if (!st.best || face.score > st.best.score) {
        st.best = { score: face.score, photo: liveFaceCrop(frame, face.box) };
      }
      const pct = Math.min(1, (now - st.holdStart) / LIVE_FACE_HOLD_MS);
      setHoldPct(pct);
      if ((pct >= 1 || st.shutter) && st.hold.some((h) => h.embedding)) finish(engine);
    }
  };

  // The moves are read inside the loop, which outlives a render, so they're
  // mirrored into a ref.
  const turnsRef = useRef56(turns);
  turnsRef.current = turns;

  const finish = async (engine) => {
    const st = stateRef.current;
    st.stage = "done";
    stopCamera();
    const avg = (k) => {
      const v = st.hold.map((h) => h[k]).filter((n) => typeof n === "number");
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const real = avg("real");
    const live = avg("live");
    if ((real !== null && real < LIVE_FACE_MIN_REAL) || (live !== null && live < LIVE_FACE_MIN_LIVE)) {
      return failWith("spoof");
    }
    const descriptor = liveFaceAverage(st.hold.map((h) => h.embedding).filter(Boolean));
    if (!descriptor) return failWith("engine");
    // The face at the end must be the face that made the moves.
    const during = liveFaceAverage(st.challengeEmbeddings);
    if (during && engine.similarity(during, descriptor) < LIVE_FACE_SAME_PERSON) return failWith("swap");
    if (purpose === "pay") {
      // No photo and no "This is you": the face goes straight to the server
      // to be compared with the one on this GLOOBAL ID.
      setPhase("checking");
      let outcome;
      try {
        outcome = await onUse({ descriptor, model: LIVE_FACE_MODEL, method: st.method });
      } catch (err) {
        outcome = { message: "Couldn't reach GLOOBAL just now. Check your internet and try again." };
      }
      if (outcome && outcome.ok) {
        onSaved && onSaved(outcome);
        return;
      }
      setPayFail({ message: (outcome && outcome.message) || "That didn't match. Try again.", final: Boolean(outcome && outcome.final) });
      setFail("pay");
      setPhase("fail");
      return;
    }
    const photo = await fitProfilePhotoForUpload(st.best.photo);
    setResult({ photo, descriptor, model: LIVE_FACE_MODEL, method: st.method });
    setPhase("review");
  };

  const use = async (withPin) => {
    if (!result || saving) return;
    setSaving(true);
    setSaveError("");
    let outcome;
    try {
      outcome = await onUse(result, withPin);
    } catch (err) {
      outcome = { message: "Couldn't reach GLOOBAL just now. Check your internet and try again." };
    }
    setSaving(false);
    if (!outcome) return;
    if (outcome.needsPin) {
      setPin("");
      setPhase("different");
      if (outcome.message && withPin) setSaveError(outcome.message);
      return;
    }
    if (outcome.pending) {
      setPending(outcome);
      setPhase("pending");
      return;
    }
    if (outcome.ok) {
      onSaved && onSaved(outcome);
      return;
    }
    setSaveError(outcome.message || "That photo couldn't be saved. Try again.");
  };

  const close = () => {
    stopCamera();
    onClose && onClose();
  };

  const pickLang = (l) => {
    setLang(l);
    try { localStorage.setItem("gloobal.liveFaceLang", l); } catch (e) { /* not remembered */ }
  };

  // ── Drawing ────────────────────────────────────────────────────────────
  const dark = phase === "checking" || phase === "starting" || phase === "align" || phase === "combo" || phase === "hold" || phase === "fail";
  const ink = dark ? "#fff" : T.ink;
  const soft = dark ? "rgba(255,255,255,0.68)" : T.inkSoft;
  const good = T.positive || "#0FA372";
  const step2 = phase === "hold";
  const subtitle = phase === "review" ? "Live check passed"
    : phase === "different" || phase === "pending" ? "Live check passed"
    : purpose === "pay" && (phase === "intro" || phase === "checking") ? (small ? "Instead of your PIN" : "Payment of ₹1 lakh or more")
    : phase === "intro" ? (purpose === "register" ? "A live check, about 10 seconds" : "A new live photo")
    : step2 ? "Hold still · 2 seconds"
    : phase === "combo" ? `Move ${Math.min(turnIndex + 1, turns.length)} of ${turns.length}`
    : "Three quick moves, then hold still";
  const title = purpose === "pay" ? "Confirm it's you" : phase === "review" ? "This is you" : phase === "different" || phase === "pending" ? "Change photo" : "Your photo";

  const button = (primary, extra = {}) => ({
    flex: 1, height: 52, borderRadius: 16, border: primary ? "none" : `1.5px solid ${dark ? "rgba(255,255,255,0.25)" : T.line}`,
    background: primary ? T.gradButton : dark ? "transparent" : T.surface, color: primary ? "#fff" : dark ? "#fff" : T.accent,
    fontFamily: T.fontBody, fontSize: 15.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, ...extra
  });

  const showCamera = phase === "starting" || phase === "align" || phase === "combo" || phase === "hold";
  const ringColor = phase === "hold" ? good : hint ? "rgba(255,255,255,0.35)" : "#fff";

  const header = <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px 8px", flexShrink: 0 }}><button
    onClick={close}
    aria-label="Back"
    data-testid="live-face-back"
    style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: dark ? "rgba(255,255,255,0.12)" : T.surface, boxShadow: dark ? "none" : T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><ArrowLeft9 size={20} color={ink} /></button><div style={{ minWidth: 0 }}><div style={{ fontFamily: T.fontDisplay, fontSize: 19, fontWeight: 700, color: ink }}>{title}</div><div data-testid="live-face-subtitle" style={{ fontSize: 12, fontWeight: 600, color: soft, marginTop: 1 }}>{subtitle}</div></div></div>;

  const payIntro = <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14 }}><div style={{ background: T.surface, borderRadius: T.radiusLg, boxShadow: T.shadowCard, padding: "16px 16px 6px" }}>{[
    small
      ? [Lock9, "You chose the face check instead of your PIN, for payments up to ₹10,000."]
      : [Lock9, "Payments of ₹1 lakh or more need a quick face check, on top of your PIN."],
    [Camera7, "Follow three quick moves — a turn, a blink, a smile — then hold still for two seconds."],
    [Check13, "Checked against the face on your GLOOBAL ID. No photo is saved."]
  ].map(([Icon, text], i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0 12px" }}><Icon size={18} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.inkSoft, fontWeight: 600 }}>{text}</span></div>)}</div><div style={{ flex: 1 }} /><button data-testid="live-face-open" onClick={() => start()} style={button(true, { flex: "none", width: "100%" })}><Camera7 size={18} />Start face check</button></div>;

  const checking = <div data-testid="live-face-checking" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#fff", fontSize: 15, fontWeight: 700 }}><Loader9 size={28} style={{ animation: "liveFaceSpin 1s linear infinite" }} />Checking it's you…</div>;

  const intro = <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14, overflowY: "auto" }}><div style={{ background: T.surface, borderRadius: T.radiusLg, boxShadow: T.shadowCard, padding: "16px 16px 6px" }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: T.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>What happens</div>{[
    [Camera7, "The camera opens. No gallery, no uploads: the photo is taken here."],
    [LiveSmile, "Three quick moves to follow — turn your head, blink, smile — so we know it's a live person. Nothing to say out loud."],
    [Lock9, "Only the photo and a coded face pattern are kept, so one face can't open two GLOOBAL IDs. GLOOBAL doesn't keep the video."]
  ].map(([Icon, text], i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0 12px" }}><Icon size={18} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.inkSoft, fontWeight: 600 }}>{text}</span></div>)}</div>{purpose === "change" && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.inkSoft, fontWeight: 600, padding: "0 4px" }}>If the new photo looks like a different person, you'll confirm with your PIN and it goes live after 24 hours.</div>}<div style={{ display: "flex", gap: 8, justifyContent: "center" }}>{[["en", "English"], ["hi", "हिन्दी"]].map(([k, label]) => <button key={k} data-testid={`live-face-lang-${k}`} onClick={() => pickLang(k)} style={{ padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${k === lang ? T.accent : T.line}`, background: k === lang ? "rgba(124,92,255,0.1)" : T.surface, color: k === lang ? T.accent : T.inkSoft, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>)}</div><div style={{ flex: 1 }} /><button data-testid="live-face-open" onClick={() => start()} style={button(true, { flex: "none", width: "100%" })}><Camera7 size={18} />Open camera</button></div>;

  const turnNow = turns[Math.min(turnIndex, turns.length - 1)];
  const MOVE_ICON = { left: ArrowLeft9, right: LiveArrowRight, up: LiveArrowUp, down: LiveArrowDown, blink: LiveEye, smile: LiveSmile };
  const TurnIcon = MOVE_ICON[turnNow];
  const moving = phase === "combo" || phase === "hold";
  // ── The three cards, above the camera ──────────────────────────────────
  // The whole sequence is visible before it starts, so nobody is surprised
  // by the next move: done ones tick green, the current one lights up.
  const cards = <div data-testid="live-face-cards" style={{ display: "flex", gap: 8, width: "100%", maxWidth: 340, marginTop: 4, flexShrink: 0 }}>{turns.map((m, i) => {
    const done = phase === "hold" || i < turnIndex;
    const now = phase === "combo" && i === turnIndex;
    const Icon = MOVE_ICON[m];
    return <div key={i} data-testid="live-face-move" data-move={m} data-done={done ? "1" : "0"} data-now={now ? "1" : "0"} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 4px 9px", borderRadius: 16, background: done ? "rgba(15,163,114,0.18)" : now ? "rgba(124,92,255,0.28)" : "rgba(255,255,255,0.07)", outline: now ? "2px solid #9b86ff" : "none", color: done ? "#5fe3b1" : now ? "#fff" : "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, transition: "background 200ms" }}><span style={{ width: 36, height: 36, borderRadius: "50%", background: done ? good : now ? "#7c5cff" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? <Check13 size={18} color="#fff" /> : <Icon size={18} color="#fff" />}</span><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{say(LIVE_FACE_MOVE_WORD[m])}</span></div>;
  })}</div>;
  // What to do right now, in one line under the cards.
  const nowLine = phase === "combo"
    ? (backToCenter ? (hi ? "वापस बीच में" : "Back to the centre") : turnNow === "blink" && eyesClosed ? (hi ? "अब खोलिए" : "Now open") : say(LIVE_FACE_TURN_TEXT[turnNow]))
    : phase === "hold" ? (hi ? "स्थिर रहिए" : "Hold still")
    : phase === "align" ? (hi ? "चेहरा गोले में" : "Face in the circle")
    : "";
  const holdLeft = Math.max(1, Math.ceil((1 - holdPct) * (LIVE_FACE_HOLD_MS / 1000)));

  const camera = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 20px calc(16px + env(safe-area-inset-bottom, 0px))", minHeight: 0 }}>{(moving || phase === "align") && cards}<div data-testid="live-face-turn" data-dir={phase === "combo" ? (backToCenter ? "center" : turnNow) : phase === "hold" ? "hold" : "center"} data-eyes={eyesClosed ? "closed" : "open"} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 44, marginTop: 10 }}>{phase === "combo" && !backToCenter && TurnIcon && <TurnIcon size={26} color="#fff" />}<span style={{ fontFamily: T.fontDisplay, fontSize: 23, fontWeight: 700, color: "#fff", textAlign: "center" }}>{nowLine}</span></div><div style={{ position: "relative", width: "min(62vw, 250px)", aspectRatio: "3 / 4", marginTop: 6, flexShrink: 0 }}><video
    ref={videoRef}
    muted
    playsInline
    autoPlay
    data-testid="live-face-video"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", transform: "scaleX(-1)", background: "#111" }}
  /><svg viewBox="0 0 100 133" style={{ position: "absolute", inset: -6, width: "calc(100% + 12px)", height: "calc(100% + 12px)", pointerEvents: "none" }}><ellipse cx="50" cy="66.5" rx="48" ry="64.5" fill="none" stroke={ringColor} strokeWidth="1.6" strokeDasharray={phase === "align" || phase === "starting" ? "3 3" : "none"} />{phase === "hold" && <ellipse cx="50" cy="66.5" rx="48" ry="64.5" fill="none" stroke={good} strokeWidth="3" pathLength="100" strokeDasharray={`${holdPct * 100} 100`} transform="rotate(-90 50 66.5)" />}</svg>{phase === "hold" && <div data-testid="live-face-countdown" style={{ position: "absolute", left: "50%", bottom: -14, transform: "translateX(-50%)", minWidth: 34, height: 34, padding: "0 10px", borderRadius: 17, background: good, color: "#fff", fontFamily: T.fontDisplay, fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>{holdLeft}</div>}{phase === "starting" && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#fff", fontSize: 13, fontWeight: 700 }}><Loader9 size={26} className="spin" style={{ animation: "liveFaceSpin 1s linear infinite" }} />Getting the camera ready</div>}</div><div data-testid="live-face-hint" style={{ minHeight: 22, marginTop: 18, fontSize: 13.5, fontWeight: 700, color: "#FFD27A", textAlign: "center" }}>{hint ? say(LIVE_FACE_HINTS[hint]) : phase === "hold" ? (purpose === "pay" ? (hi ? "जाँच हो रही है…" : "Checking…") : (hi ? "फ़ोटो ले रहे हैं…" : "Taking your photo…")) : ""}</div><div style={{ flex: 1 }} />{phase === "hold" && <button
    data-testid="live-face-shutter"
    onClick={() => { stateRef.current.shutter = true; }}
    aria-label={purpose === "pay" ? "Confirm now" : "Take photo"}
    style={{ width: 72, height: 72, borderRadius: "50%", border: "4px solid #fff", background: "rgba(255,255,255,0.22)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><span style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff" }} /></button>}{phase === "hold" && <div style={{ fontSize: 12, fontWeight: 700, color: soft, marginTop: 6 }}>{purpose === "pay" ? "or tap to confirm now" : "or tap to take it now"}</div>}</div>;

  const FAIL = {
    turn: ["Didn't see that move", "Follow each arrow a little further, then come back to the centre."],
    blink: ["Didn't see you blink", "Close your eyes fully for a moment, then open them, facing the camera."],
    smile: ["Didn't see a smile", "A big smile, facing the camera, in good light."],
    spoof: ["That didn't look like a live face", "Use your own face, in good light, not a photo or a screen."],
    swap: ["The face changed", "Keep the same face in the circle from start to end."],
    camera: ["The camera couldn't open", "Allow the camera for GLOOBAL in your phone's settings, then try again."],
    engine: ["The face check couldn't load", "Check your internet and try again."],
    pay: [payFail && payFail.final ? "Not right now" : "That didn't match", (payFail && payFail.message) || ""]
  };
  const failText = FAIL[fail] || FAIL.turn;
  const failScreen = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 24px calc(18px + env(safe-area-inset-bottom, 0px))", textAlign: "center" }}><div style={{ flex: 1 }} /><div data-testid="live-face-fail" data-reason={fail || ""} style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, color: "#fff" }}>{failText[0]}</div><div style={{ fontSize: 14, fontWeight: 600, color: soft, marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>{failText[1]}</div><div style={{ flex: 1 }} />{payFail && payFail.final ? <button data-testid="live-face-close" onClick={close} style={button(true, { flex: "none", width: "100%" })}>Close</button> : <button data-testid="live-face-retry" onClick={() => start()} style={button(true, { flex: "none", width: "100%" })}>Try again</button>}</div>;

  const reviewPhoto = (src, size, label) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: T.surfaceAlt || T.surface, boxShadow: T.shadowCard }}>{src && <img src={src} alt={label || "Your new photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</div>{label && <span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{label}</span>}</div>;

  const review = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14 }}>{reviewPhoto(result && result.photo, "min(64vw, 250px)")}<span data-testid="live-face-passed" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: good, color: "#fff", fontSize: 12.5, fontWeight: 800 }}><Check13 size={14} strokeWidth={3} />Live check passed</span><div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.surface, borderRadius: 16, padding: "12px 14px", boxShadow: T.shadowCard, width: "100%", boxSizing: "border-box" }}><Lock9 size={16} color={T.inkSoft} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: T.inkSoft }}>Only this photo is kept, downsized, with a coded face pattern. GLOOBAL didn't keep the video.</span></div><div style={{ flex: 1 }} />{saveError && <div data-testid="live-face-save-error" style={{ fontSize: 13, fontWeight: 700, color: T.negative, textAlign: "center", lineHeight: 1.45 }}>{saveError}</div>}<div style={{ display: "flex", gap: 10, width: "100%" }}><button data-testid="live-face-retake" onClick={() => start()} disabled={saving} style={button(false)}>Retake</button><button data-testid="live-face-use" onClick={() => use()} disabled={saving} style={button(true, { opacity: saving ? 0.7 : 1 })}>{saving ? "Saving…" : "Use this photo"}</button></div></div>;

  const different = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 16 }}>{reviewPhoto(current, 112, "Now")}<span style={{ color: T.inkFaint, fontSize: 18 }}>→</span>{reviewPhoto(result && result.photo, 112, "New")}</div><div data-testid="live-face-different" style={{ background: "#FFF6E5", border: "1px solid #F3D9A6", borderRadius: 16, padding: "12px 14px", width: "100%", boxSizing: "border-box" }}><div style={{ fontSize: 14, fontWeight: 800, color: "#9A5A00" }}>This looks like a different person</div><div style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: "#7A5A2A", marginTop: 4 }}>To keep your account safe, the new photo goes live in 24 hours. You'll get a notification, and you can cancel it any time before then.</div></div><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: T.inkSoft }}><Lock9 size={14} />Confirm with your PIN to continue</div><input
    data-testid="live-face-pin"
    type="password"
    inputMode="numeric"
    autoComplete="off"
    maxLength={6}
    value={pin}
    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
    aria-label="Your PIN"
    style={{ width: 200, height: 52, borderRadius: 14, border: `1.5px solid ${T.line}`, background: T.surface, textAlign: "center", fontSize: 24, letterSpacing: 10, fontFamily: T.fontDisplay, color: T.ink, outline: "none" }}
  />{saveError && <div data-testid="live-face-save-error" style={{ fontSize: 13, fontWeight: 700, color: T.negative, textAlign: "center" }}>{saveError}</div>}<div style={{ flex: 1 }} /><div style={{ display: "flex", gap: 10, width: "100%" }}><button onClick={close} disabled={saving} style={button(false)}>Cancel</button><button data-testid="live-face-confirm" onClick={() => use(pin)} disabled={saving || pin.length < 4} style={button(true, { opacity: saving || pin.length < 4 ? 0.6 : 1 })}>{saving ? "Checking…" : "Confirm"}</button></div></div>;

  const when = pending && pending.activateAt ? new Date(pending.activateAt) : null;
  const pendingScreen = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14, textAlign: "center" }}>{reviewPhoto(result && result.photo, 140)}<div data-testid="live-face-pending" style={{ fontFamily: T.fontDisplay, fontSize: 21, fontWeight: 700, color: T.ink }}>Your new photo is waiting</div><div style={{ fontSize: 13.5, lineHeight: 1.55, fontWeight: 600, color: T.inkSoft, maxWidth: 320 }}>It goes live {when ? `on ${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })} at ${when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "in 24 hours"}. If this wasn't you, cancel it from your profile before then.</div><div style={{ flex: 1 }} /><button onClick={() => { onSaved && onSaved(pending); }} style={button(true, { flex: "none", width: "100%" })}>Done</button></div>;

  return <div
    data-testid="live-face-check"
    data-phase={phase}
    style={{ position: "fixed", inset: 0, zIndex: 400, background: dark ? "#141018" : T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, color: ink }}
  ><style>{"@keyframes liveFaceSpin{to{transform:rotate(360deg)}}"}</style>{header}{phase === "intro" && (purpose === "pay" ? payIntro : intro)}{phase === "checking" && checking}{showCamera && camera}{phase === "fail" && failScreen}{phase === "review" && review}{phase === "different" && different}{phase === "pending" && pendingScreen}</div>;
}

// ── Saving ────────────────────────────────────────────────────────────────
//
// What onUse hands back, from the server's answer. One function so the
// registration step and the profile screen read the server the same way.
async function liveFaceSave(symbolId, result, pin) {
  try {
    const res = await GloobalApi.setLivePhoto(symbolId, {
      photo: result.photo,
      descriptor: result.descriptor,
      model: result.model,
      method: result.method,
      pin: pin || undefined
    });
    if (res && res.status === "pending") return { pending: true, activateAt: res.activateAt };
    return { ok: true, photo: result.photo, faceChecks: res ? res.faceChecks !== false : false };
  } catch (err) {
    const body = (err && err.body) || {};
    if (body.code === "different_face_needs_pin") return { needsPin: true, reason: "pin" };
    if (body.code === "wrong_pin") return { needsPin: true, reason: "pin", message: body.message || "That PIN is wrong." };
    if (body.code === "face_taken") {
      return { reason: "taken", message: "This face is already on another GLOOBAL ID. Sign in to that one, or contact support if this is a mistake." };
    }
    if (err && err.status === 0) return { reason: "offline", message: "Couldn't reach GLOOBAL just now. Check your internet and try again." };
    return { reason: "error", message: body.message || "That photo couldn't be saved. Try again." };
  }
}

// ── The payment check, from anywhere ──────────────────────────────────────
//
// Mounted once at the root (PaymentFaceHost, in __artifactEntry next to
// PhotoCropHost). A payment that the server answers with face_required
// calls requestPaymentFaceCheck with the server's `bind`, and gets back the
// signed approval to retry with — or null if the person backed out or the
// check failed for good.
var LIVE_FACE_PAY_HOST = { open: null };

function requestPaymentFaceCheck({ symbolId, bind, small = false }) {
  if (!LIVE_FACE_PAY_HOST.open) return Promise.resolve(null);
  return new Promise((resolve) => LIVE_FACE_PAY_HOST.open({ symbolId, bind, small, resolve }));
}

function PaymentFaceHost() {
  const [job, setJob] = useState97(null);
  useEffect94(() => {
    LIVE_FACE_PAY_HOST.open = (j) => setJob(j);
    return () => { LIVE_FACE_PAY_HOST.open = null; };
  }, []);
  if (!job) return null;
  const done = (approval) => {
    setJob(null);
    job.resolve(approval || null);
  };
  return <LiveFaceCheck
    key={job.bind}
    purpose="pay"
    small={job.small}
    onUse={async (r) => {
      try {
        const res = await GloobalApi.approvePaymentFace({ bind: job.bind, descriptor: r.descriptor, model: r.model, method: r.method });
        return res && res.approval ? { ok: true, approval: res.approval } : { message: "That didn't match. Try again." };
      } catch (err) {
        const body = (err && err.body) || {};
        const final = body.code === "face_locked" || body.code === "face_enroll_required" || body.code === "face_unavailable";
        if (err && err.status === 0) return { message: "Couldn't reach GLOOBAL just now. Check your internet and try again." };
        return { message: body.message || "That didn't match. Try again.", final };
      }
    }}
    onSaved={(outcome) => done(outcome && outcome.approval)}
    onClose={() => done(null)}
  />;
}

// The account's choice for ordinary payments (0253): "pin", "device" (the
// phone's fingerprint / Face ID) or "face" (the GLOOBAL face check, up to
// ₹10,000 / ₹25,000 a day). App.jsx sets it from the account's
// securitySettings; Send Money reads it to skip the PIN pad.
var GLOOBAL_PAYMENT_CHECK = { method: "pin" };
function gloobalSetPaymentCheck(method) {
  GLOOBAL_PAYMENT_CHECK.method = method === "device" || method === "face" ? method : "pin";
}

// One payment call that answers whatever check the server asks for, then
// sends the SAME payment again (same idempotency key) with the approval:
//   face_required / face_expired  ₹1 lakh and above: the face check, on top
//                                 of the PIN already given.
//   check_required                no PIN, as the account chose: the phone's
//                                 fingerprint / Face ID, or the face check.
//   pin_required                  this one needs the PIN after all; thrown
//                                 with needPin so Send Money opens the pad.
// `send(extra)` makes the request with extra fields merged in.
async function withPaymentFaceCheck(symbolId, send) {
  let extra = {};
  for (let round = 0; round < 3; round++) {
    try {
      return await send(extra);
    } catch (err) {
      const body = err && err.body;
      const code = body && body.code;
      if (code === "pin_required") {
        const e = new Error(body.message || "Enter your PIN for this payment.");
        e.status = 403;
        e.body = body;
        e.needPin = true;
        throw e;
      }
      if (!body || !body.bind || (code !== "face_required" && code !== "face_expired" && code !== "check_required")) throw err;
      let approval = null;
      let reason = "";
      if (code === "check_required" && body.method === "device") {
        const r = await gloobalDevicePaymentApproval(body.bind);
        approval = r.approval || null;
        reason = r.reason || "";
      } else {
        approval = await requestPaymentFaceCheck({ symbolId, bind: body.bind, small: code === "check_required" });
      }
      if (!approval) {
        // The person backed out, or the check couldn't be done: the PIN is
        // still there for anything under ₹1 lakh.
        const e = new Error(code === "check_required"
          ? (reason ? `${reason} Enter your PIN instead.` : "Enter your PIN for this payment.")
          : "Payments of ₹1 lakh or more need the face check. Nothing was sent.");
        e.status = 403;
        e.body = { code: code === "check_required" ? "pin_required" : "face_cancelled" };
        e.needPin = code === "check_required";
        throw e;
      }
      extra = code === "check_required" ? { paymentApproval: approval } : { ...extra, faceApproval: approval };
    }
  }
  return send(extra);
}
