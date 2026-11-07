// src/features/identity/liveFaceCheck.jsx
//
// ── THE LIVE PHOTO ─────────────────────────────────────────────────────────
//
// The founder: a person's photo is not uploaded, it is TAKEN, here, live —
// "say words like given on screen", and "if we fail we tell them go to a
// quiet place". Head turns for anyone who can't speak. The same check runs
// at registration and whenever the photo is changed later.
//
// What it does, in order:
//
//   1. Camera only. There is no gallery button anywhere in this flow.
//   2. Three random digits on screen. The person says them; the browser's
//      speech recogniser has to hear all three, in order, AND the mouth in
//      the camera has to move while it does. A photo held up to the lens
//      can't speak; a recording can't know which three digits came up.
//      Anyone who can't speak turns their head instead: two random
//      directions out of left, right, up and down.
//   3. Hold still for a moment. The library's anti-spoof and liveness
//      models score those frames, a face descriptor is taken from them, and
//      the photo is cut from the best one. The descriptor taken now must
//      match one taken during step 2, so the face can't be swapped midway.
//   4. "This is you": keep it or retake.
//
// What leaves the phone: the photo, and the descriptor (a list of numbers
// the server stores encrypted, so the same face can't open two GLOOBAL IDs).
// The video and the voice don't. The speech recogniser is the browser's own;
// on Android Chrome it listens through Google, which is why the hint says
// it needs the internet and offers head turns when it can't be used.
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
// Everything this file decides is in the plain functions at the top
// (digits heard, mouth movement, head direction), so they can be tested
// without a camera. The component only feeds them frames.
import { useState as useState97, useEffect as useEffect94, useRef as useRef56 } from "react";
import { Camera as Camera7, Mic as LiveMic, Lock as Lock9, Check as Check13, RotateCcw as LiveRetry, ArrowLeft as ArrowLeft9, ArrowRight as LiveArrowRight, ArrowUp as LiveArrowUp, ArrowDown as LiveArrowDown, Loader as Loader9 } from "lucide-react";

// Which network produced a descriptor. Stored with it on the server, and
// descriptors from different models are never compared.
var LIVE_FACE_MODEL = "human-faceres@3.3";
var LIVE_FACE_MODEL_PATH = "/face-models/";

// ── Digits ────────────────────────────────────────────────────────────────

var LIVE_FACE_DEVANAGARI = "०१२३४५६७८९";

// Number words a recogniser may write instead of numerals. English includes
// the homophones en-IN recognisers really return ("to", "for", "ate").
var LIVE_FACE_DIGIT_WORDS = {
  zero: 0, oh: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, free: 3,
  four: 4, for: 4, fore: 4, five: 5, six: 6, sex: 6, seven: 7, eight: 8, ate: 8, nine: 9,
  "शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "पंच": 5,
  "छह": 6, "छः": 6, "छे": 6, "छै": 6, "सात": 7, "आठ": 8, "नौ": 9, "नो": 9
};

// Three different digits from 1–9. No zero: "zero", "oh" and "o" are the
// one digit recognisers disagree about.
function liveFaceDigits(rand = Math.random) {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

function liveFaceDigitText(d, lang) {
  return lang === "hi" ? LIVE_FACE_DEVANAGARI[d] : String(d);
}

// Every digit in a transcript, in the order spoken: numerals (Latin or
// Devanagari, and "472" counts as three) and number words.
function liveFaceHeard(transcript) {
  const text = String(transcript || "")
    .toLowerCase()
    .replace(/[०-९]/g, (c) => String(LIVE_FACE_DEVANAGARI.indexOf(c)));
  const out = [];
  for (const token of text.split(/[\s,.;:!?\-–—।]+/)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      for (const c of token) out.push(Number(c));
    } else if (Object.prototype.hasOwnProperty.call(LIVE_FACE_DIGIT_WORDS, token)) {
      out.push(LIVE_FACE_DIGIT_WORDS[token]);
    }
  }
  return out;
}

// How many of the target digits were said, in order. Extra words around
// them ("uh, four… seven two") don't count against the person.
function liveFaceMatchCount(target, heard) {
  let i = 0;
  for (const d of heard) {
    if (i < target.length && d === target[i]) i++;
  }
  return i;
}

// ── The face, measured ────────────────────────────────────────────────────
//
// From the mesh, in the camera's own (un-mirrored) image coordinates:
//   yaw    nose tip across from the middle of the eyes, in eye-widths.
//          Turning to one's own LEFT moves the nose to the image's RIGHT,
//          so yaw goes UP.
//   pitch  nose tip below the eye line, in face-heights. Looking UP brings
//          the nose tip closer to the eye line, so pitch goes DOWN.
//   mouth  gap between the inner lips, in face-heights.
// All three are compared with the person's own resting values (the
// baseline), never with fixed numbers: faces differ more than heads turn.
function liveFacePose(mesh) {
  if (!Array.isArray(mesh) || mesh.length < 264) return null;
  const L = mesh[33], R = mesh[263], N = mesh[1], top = mesh[10], chin = mesh[152], up = mesh[13], lo = mesh[14];
  const eyeX = (L[0] + R[0]) / 2;
  const eyeY = (L[1] + R[1]) / 2;
  const eyeW = Math.hypot(R[0] - L[0], R[1] - L[1]);
  const faceH = Math.abs(chin[1] - top[1]);
  if (!eyeW || !faceH) return null;
  return {
    yaw: (N[0] - eyeX) / eyeW,
    pitch: (N[1] - eyeY) / faceH,
    mouth: Math.abs(lo[1] - up[1]) / faceH
  };
}

function liveFaceBaseline(poses) {
  const mid = (k) => {
    const v = poses.map((p) => p[k]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  return { yaw: mid("yaw"), pitch: mid("pitch"), mouth: mid("mouth") };
}

var LIVE_FACE_TURN = { yaw: 0.09, pitch: 0.04 };
var LIVE_FACE_STILL = { yaw: 0.06, pitch: 0.03 };

function liveFaceTurned(dir, pose, base) {
  if (!pose || !base) return false;
  const dy = pose.yaw - base.yaw;
  const dp = pose.pitch - base.pitch;
  if (dir === "left") return dy > LIVE_FACE_TURN.yaw;
  if (dir === "right") return dy < -LIVE_FACE_TURN.yaw;
  if (dir === "up") return dp < -LIVE_FACE_TURN.pitch;
  if (dir === "down") return dp > LIVE_FACE_TURN.pitch;
  return false;
}

// `slack` widens it: "back to the centre" between moves needn't be as
// exact as the still photo at the end.
function liveFaceStill(pose, base, slack = 1) {
  return Boolean(pose && base) &&
    Math.abs(pose.yaw - base.yaw) < LIVE_FACE_STILL.yaw * slack &&
    Math.abs(pose.pitch - base.pitch) < LIVE_FACE_STILL.pitch * slack;
}

// Did the lips move while the numbers were said? Saying three digits opens
// the mouth several times; a still photo, or a face that only sat there
// while somebody else spoke, doesn't.
function liveFaceLipsMoved(mouths) {
  if (!mouths || mouths.length < 4) return false;
  const lo = Math.min(...mouths);
  const hi = Math.max(...mouths);
  const open = mouths.filter((m) => m > lo + 0.02).length;
  return hi - lo >= 0.03 && open >= 2;
}

// The combo. The founder: "move head left, again left, again left, so
// there can be less fake". A random run of moves, repeats allowed, with a
// return to the centre between each — so a recorded clip would have to
// contain this exact sequence, which was only drawn a second ago. Never all
// the same move, which would be the one sequence a clip is likeliest to
// already hold.
var LIVE_FACE_DIRS = ["left", "right", "up", "down"];
function liveFaceTurns(rand = Math.random, n = 3) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(LIVE_FACE_DIRS[Math.floor(rand() * 4)]);
  if (n > 1 && out.every((d) => d === out[0])) {
    const others = LIVE_FACE_DIRS.filter((d) => d !== out[0]);
    out[n - 1] = others[Math.floor(rand() * others.length)];
  }
  return out;
}

// Moves in the combo: three after the spoken numbers, four for anyone
// doing the head-turn check alone, and three for a large payment — which is
// silent on purpose (nobody should have to speak numbers out loud in a shop)
// and sits on top of the PIN.
function liveFaceComboLength(method, purpose) {
  if (purpose === "pay") return 3;
  return method === "speech" ? 3 : 4;
}

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
  down: ["Look down", "नीचे देखिए"]
};

// The scores a still or a screen gets from the library's two models. Kept
// lenient: these sit after the spoken numbers, which are the real test, and
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
          async detect(input) {
            const result = await human.detect(input);
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

function liveFaceSpeechSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
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
  const [digits, setDigits] = useState97(() => liveFaceDigits());
  const [said, setSaid] = useState97(0);
  const [listening, setListening] = useState97(false);
  const [turns, setTurns] = useState97(() => liveFaceTurns());
  const [turnIndex, setTurnIndex] = useState97(0);
  const [backToCenter, setBackToCenter] = useState97(false);
  const [holdPct, setHoldPct] = useState97(0);
  const [method, setMethod] = useState97(purpose !== "pay" && liveFaceSpeechSupported() ? "speech" : "turns");
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
  const recRef = useRef56(null);
  const stateRef = useRef56({});

  const hi = lang === "hi";
  const langRef = useRef56(lang);
  langRef.current = lang;
  const say = (pair) => (hi ? pair[1] : pair[0]);

  const stopListening = () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try { rec.abort(); } catch (e) { /* already stopped */ }
    }
    setListening(false);
  };

  const stopCamera = () => {
    loopRef.current.alive = false;
    stopListening();
    const s = streamRef.current;
    streamRef.current = null;
    if (s) s.getTracks().forEach((t) => t.stop());
  };

  useEffect94(() => () => stopCamera(), []);

  const failWith = (reason) => {
    stopCamera();
    setFail(reason);
    setPhase("fail");
  };

  // ── Start: camera, then the engine, then the frame loop ────────────────
  const start = async (useMethod) => {
    const m = useMethod || method;
    setMethod(m);
    setFail(null);
    setHint(null);
    setSaid(0);
    setHoldPct(0);
    setTurnIndex(0);
    setDigits(liveFaceDigits());
    setTurns(liveFaceTurns(Math.random, liveFaceComboLength(m, purpose)));
    setPayFail(null);
    setBackToCenter(false);
    setPhase("starting");
    stateRef.current = { method: m, poses: [], base: null, stage: "align", mouths: [], challengeEmbeddings: [], holdStart: 0, hold: [], best: null, turnHits: 0, turnIndex: 0, needCenter: false, stageStart: 0 };
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

  // ── Speech ─────────────────────────────────────────────────────────────
  const listen = (target) => {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return failWith("nospeech");
    const rec = new Rec();
    rec.lang = langRef.current === "hi" ? "hi-IN" : "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    let best = 0;
    rec.onresult = (event) => {
      let text = "";
      const alts = [];
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        text += " " + (r[0] ? r[0].transcript : "");
        for (let j = 0; j < r.length; j++) alts.push(r[j].transcript);
      }
      const counts = [text, ...alts].map((t) => liveFaceMatchCount(target, liveFaceHeard(t)));
      best = Math.max(best, ...counts);
      setSaid(best);
      if (best >= target.length) {
        stopListening();
        const st = stateRef.current;
        if (!liveFaceLipsMoved(st.mouths)) return failWith("lips");
        st.stage = "combo";
        st.stageStart = Date.now();
        setPhase("combo");
      }
    };
    rec.onerror = (event) => {
      const code = event && event.error;
      if (code === "not-allowed" || code === "service-not-allowed") return failWith("mic");
      if (code === "network") return failWith("offline");
      if (code === "aborted") return;
      failWith("hear");
    };
    rec.onend = () => {
      // The recogniser stops by itself after a silence. Still short of the
      // three digits means it didn't hear them.
      if (recRef.current === rec && stateRef.current.stage === "challenge") failWith("hear");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      failWith("hear");
    }
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
        faces = await engine.detect(work);
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
    if (face && face.embedding && (st.stage === "challenge" || st.stage === "combo")) st.challengeEmbeddings.push(face.embedding);

    if (st.stage === "align") {
      if (!pose) {
        st.poses = [];
        setHint(problem || "none");
        return;
      }
      setHint(null);
      st.poses.push(pose);
      if (st.poses.length >= 6) {
        st.base = liveFaceBaseline(st.poses);
        st.stageStart = now;
        st.mouths = [];
        if (st.method === "speech") {
          st.stage = "challenge";
          setPhase("challenge");
          listen(digitsRef.current);
        } else {
          st.stage = "combo";
          setPhase("combo");
        }
      }
      return;
    }

    if (st.stage === "challenge") {
      setHint(pose ? null : problem || "none");
      if (pose) st.mouths.push(pose.mouth);
      if (now - st.stageStart > 12000) failWith("hear");
      return;
    }

    if (st.stage === "combo") {
      setHint(pose ? null : problem || "none");
      const list = turnsRef.current;
      // Between moves: come back to the centre first, so "left, left" is two
      // turns and not one held turn counted twice.
      if (st.needCenter) {
        if (pose && liveFaceStill(pose, st.base, 1.6)) {
          st.needCenter = false;
          st.stageStart = now;
          setBackToCenter(false);
        } else if (now - st.stageStart > 6000) {
          failWith("turn");
        }
        return;
      }
      // Each move held for three frames; seven seconds to make it.
      if (pose && liveFaceTurned(list[st.turnIndex], pose, st.base)) st.turnHits += 1;
      else st.turnHits = 0;
      if (st.turnHits >= 3) {
        st.turnIndex += 1;
        st.turnHits = 0;
        st.stageStart = now;
        setTurnIndex(st.turnIndex);
        if (st.turnIndex >= list.length) {
          st.stage = "hold";
          st.holdStart = 0;
          setPhase("hold");
        } else {
          st.needCenter = true;
          setBackToCenter(true);
        }
        return;
      }
      if (now - st.stageStart > 7000) failWith("turn");
      return;
    }

    if (st.stage === "hold") {
      if (!pose || !liveFaceStill(pose, st.base)) {
        setHint(pose ? "straight" : problem || "none");
        st.holdStart = 0;
        st.hold = [];
        setHoldPct(0);
        return;
      }
      setHint(null);
      if (!st.holdStart) st.holdStart = now;
      st.hold.push({ embedding: face.embedding, real: face.real, live: face.live });
      if (!st.best || face.score > st.best.score) {
        st.best = { score: face.score, photo: liveFaceCrop(frame, face.box) };
      }
      const pct = Math.min(1, (now - st.holdStart) / 1500);
      setHoldPct(pct);
      if (pct >= 1 && st.hold.length >= 3) finish(engine);
    }
  };

  // Digits and turns are read inside the loop, which outlives a render, so
  // they're mirrored into refs.
  const digitsRef = useRef56(digits);
  digitsRef.current = digits;
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
    // The face at the end must be the face that spoke or turned.
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
  const dark = phase === "checking" || phase === "starting" || phase === "align" || phase === "challenge" || phase === "combo" || phase === "hold" || phase === "fail";
  const ink = dark ? "#fff" : T.ink;
  const soft = dark ? "rgba(255,255,255,0.68)" : T.inkSoft;
  const good = T.positive || "#0FA372";
  const step2 = phase === "hold";
  const subtitle = phase === "review" ? "Live check passed"
    : phase === "different" || phase === "pending" ? "Live check passed"
    : purpose === "pay" && (phase === "intro" || phase === "checking") ? (small ? "Instead of your PIN" : "Payment of ₹1 lakh or more")
    : phase === "intro" ? (purpose === "register" ? "A live check, about 10 seconds" : "A new live photo")
    : method === "speech"
      ? (step2 ? "3 of 3 · hold still" : phase === "combo" ? "2 of 3 · follow the arrows" : "1 of 3 · say the numbers")
      : (step2 ? "2 of 2 · hold still" : "1 of 2 · follow the arrows");
  const title = purpose === "pay" ? "Confirm it's you" : phase === "review" ? "This is you" : phase === "different" || phase === "pending" ? "Change photo" : "Your photo";

  const button = (primary, extra = {}) => ({
    flex: 1, height: 52, borderRadius: 16, border: primary ? "none" : `1.5px solid ${dark ? "rgba(255,255,255,0.25)" : T.line}`,
    background: primary ? T.gradButton : dark ? "transparent" : T.surface, color: primary ? "#fff" : dark ? "#fff" : T.accent,
    fontFamily: T.fontBody, fontSize: 15.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, ...extra
  });
  const linkBtn = { background: "none", border: "none", color: soft, fontFamily: T.fontBody, fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: 8, margin: "0 auto" };

  const showCamera = phase === "starting" || phase === "align" || phase === "challenge" || phase === "combo" || phase === "hold";
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
    [Camera7, "Follow three head moves, then hold still. About 5 seconds."],
    [Check13, "Checked against the face on your GLOOBAL ID. No photo is saved."]
  ].map(([Icon, text], i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0 12px" }}><Icon size={18} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.inkSoft, fontWeight: 600 }}>{text}</span></div>)}</div><div style={{ flex: 1 }} /><button data-testid="live-face-open" onClick={() => start("turns")} style={button(true, { flex: "none", width: "100%" })}><Camera7 size={18} />Start face check</button></div>;

  const checking = <div data-testid="live-face-checking" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#fff", fontSize: 15, fontWeight: 700 }}><Loader9 size={28} style={{ animation: "liveFaceSpin 1s linear infinite" }} />Checking it's you…</div>;

  const intro = <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14, overflowY: "auto" }}><div style={{ background: T.surface, borderRadius: T.radiusLg, boxShadow: T.shadowCard, padding: "16px 16px 6px" }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: T.inkFaint, textTransform: "uppercase", marginBottom: 6 }}>What happens</div>{[
    [Camera7, "The camera opens. No gallery, no uploads: the photo is taken here."],
    [LiveMic, "We show three numbers to say out loud, then a few head moves to follow, so we know it's a live person."],
    [Lock9, "Only the photo and a coded face pattern are kept, so one face can't open two GLOOBAL IDs. GLOOBAL doesn't keep your voice or the video."]
  ].map(([Icon, text], i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0 12px" }}><Icon size={18} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45, color: T.inkSoft, fontWeight: 600 }}>{text}</span></div>)}</div>{purpose === "change" && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.inkSoft, fontWeight: 600, padding: "0 4px" }}>If the new photo looks like a different person, you'll confirm with your PIN and it goes live after 24 hours.</div>}<div style={{ flex: 1 }} /><button data-testid="live-face-open" onClick={() => start()} style={button(true, { flex: "none", width: "100%" })}><Camera7 size={18} />Open camera</button><button data-testid="live-face-cant-speak" onClick={() => start("turns")} style={linkBtn}><LiveRetry size={14} />Can't speak right now? Turn your head instead</button></div>;

  const digitBox = (d, i) => {
    const done = i < said;
    return <div key={i} data-testid="live-face-digit" data-said={done ? "1" : "0"} style={{ width: 64, height: 72, borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.fontDisplay, fontSize: 38, fontWeight: 700, color: "#fff", background: done ? good : "rgba(255,255,255,0.08)", border: `2px solid ${done ? good : "rgba(255,255,255,0.28)"}`, transition: "background .2s" }}>{liveFaceDigitText(d, lang)}</div>;
  };

  const turnNow = turns[Math.min(turnIndex, turns.length - 1)];
  const TurnIcon = { left: ArrowLeft9, right: LiveArrowRight, up: LiveArrowUp, down: LiveArrowDown }[turnNow];

  const camera = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 20px calc(16px + env(safe-area-inset-bottom, 0px))", minHeight: 0 }}><div style={{ position: "relative", width: "min(74vw, 290px)", aspectRatio: "3 / 4", marginTop: 6, flexShrink: 0 }}><video
    ref={videoRef}
    muted
    playsInline
    autoPlay
    data-testid="live-face-video"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", transform: "scaleX(-1)", background: "#111" }}
  /><svg viewBox="0 0 100 133" style={{ position: "absolute", inset: -6, width: "calc(100% + 12px)", height: "calc(100% + 12px)", pointerEvents: "none" }}><ellipse cx="50" cy="66.5" rx="48" ry="64.5" fill="none" stroke={ringColor} strokeWidth="1.6" strokeDasharray={phase === "align" || phase === "starting" ? "3 3" : "none"} />{phase === "hold" && <ellipse cx="50" cy="66.5" rx="48" ry="64.5" fill="none" stroke={good} strokeWidth="3" pathLength="100" strokeDasharray={`${holdPct * 100} 100`} transform="rotate(-90 50 66.5)" />}</svg>{phase === "starting" && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#fff", fontSize: 13, fontWeight: 700 }}><Loader9 size={26} className="spin" style={{ animation: "liveFaceSpin 1s linear infinite" }} />Getting the camera ready</div>}</div><div data-testid="live-face-hint" style={{ minHeight: 22, marginTop: 12, fontSize: 13.5, fontWeight: 700, color: "#FFD27A", textAlign: "center" }}>{hint ? say(LIVE_FACE_HINTS[hint]) : ""}</div>{phase === "challenge" && method === "speech" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 4 }}><div style={{ display: "flex", gap: 12 }}>{digits.map(digitBox)}</div><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: soft }}><LiveMic size={14} color={listening ? good : soft} />{listening ? (hi ? "सुन रहे हैं…" : "Listening…") : ""}</div><div style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 2 }}>{hi ? "ये नंबर बोलिए" : "Say these numbers"}</div><div style={{ fontSize: 13, fontWeight: 600, color: soft }}>{hi ? "Say these numbers" : "ये नंबर बोलिए"}</div></div>}{phase === "combo" && <div data-testid="live-face-turn" data-dir={backToCenter ? "center" : turnNow} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 4 }}><div style={{ width: 72, height: 72, borderRadius: 22, background: backToCenter ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>{backToCenter ? <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff" }} /> : TurnIcon && <TurnIcon size={38} color="#fff" />}</div><div style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, color: "#fff" }}>{backToCenter ? (hi ? "वापस बीच में" : "Back to the centre") : say(LIVE_FACE_TURN_TEXT[turnNow])}</div><div style={{ display: "flex", gap: 6 }}>{turns.map((d, i) => <span key={i} data-testid="live-face-move" data-done={i < turnIndex ? "1" : "0"} style={{ width: 9, height: 9, borderRadius: "50%", background: i < turnIndex ? good : i === turnIndex ? "#fff" : "rgba(255,255,255,0.25)" }} />)}</div></div>}{phase === "hold" && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 6 }}><div style={{ fontFamily: T.fontDisplay, fontSize: 26, fontWeight: 700, color: "#fff" }}>{hi ? "स्थिर रहिए" : "Hold still"}</div><div style={{ fontSize: 13, fontWeight: 600, color: soft }}>{method === "speech" ? "Numbers heard · moves matched" : "Moves matched"}</div></div>}<div style={{ flex: 1 }} />{phase === "challenge" && method === "speech" && <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>{[["en", "English"], ["hi", "हिन्दी"]].map(([k, label]) => <button key={k} onClick={() => { if (k !== lang) { pickLang(k); langRef.current = k; stopCamera(); start("speech"); } }} style={{ padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${k === lang ? "#fff" : "rgba(255,255,255,0.25)"}`, background: k === lang ? "rgba(255,255,255,0.14)" : "transparent", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{label}</button>)}</div>}{phase === "challenge" && method === "speech" && <button data-testid="live-face-switch-turns" onClick={() => { stopCamera(); start("turns"); }} style={linkBtn}><LiveRetry size={14} />I can't say this</button>}</div>;

  const FAIL = {
    hear: ["Couldn't hear you clearly", "Try in a quieter place, closer to the phone."],
    lips: ["Say them facing the camera", "We heard the numbers, but your lips didn't move with them."],
    offline: ["Listening needs the internet", "Connect and try again, or turn your head instead."],
    mic: ["The microphone is off", "Allow the microphone for GLOOBAL, or turn your head instead."],
    nospeech: ["This phone can't listen here", "Turn your head instead."],
    turn: ["Didn't see that move", "Follow each arrow a little further, then come back to the centre."],
    spoof: ["That didn't look like a live face", "Use your own face, in good light, not a photo or a screen."],
    swap: ["The face changed", "Keep the same face in the circle from start to end."],
    camera: ["The camera couldn't open", "Allow the camera for GLOOBAL in your phone's settings, then try again."],
    engine: ["The face check couldn't load", "Check your internet and try again."],
    pay: [payFail && payFail.final ? "Not right now" : "That didn't match", (payFail && payFail.message) || ""]
  };
  const failText = FAIL[fail] || FAIL.hear;
  const offerTurns = fail === "hear" || fail === "lips" || fail === "offline" || fail === "mic" || fail === "nospeech";
  const failScreen = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 24px calc(18px + env(safe-area-inset-bottom, 0px))", textAlign: "center" }}><div style={{ flex: 1 }} /><div data-testid="live-face-fail" data-reason={fail || ""} style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 700, color: "#fff" }}>{failText[0]}</div><div style={{ fontSize: 14, fontWeight: 600, color: soft, marginTop: 8, lineHeight: 1.5, maxWidth: 300 }}>{failText[1]}</div><div style={{ flex: 1 }} />{payFail && payFail.final ? <button data-testid="live-face-close" onClick={close} style={button(true, { flex: "none", width: "100%" })}>Close</button> : <button data-testid="live-face-retry" onClick={() => start(fail === "nospeech" ? "turns" : fail === "turn" ? "turns" : method)} style={button(true, { flex: "none", width: "100%" })}>Try again</button>}{offerTurns && fail !== "nospeech" && <button data-testid="live-face-fail-turns" onClick={() => start("turns")} style={linkBtn}><LiveRetry size={14} />Turn your head instead</button>}</div>;

  const reviewPhoto = (src, size, label) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", background: T.surfaceAlt || T.surface, boxShadow: T.shadowCard }}>{src && <img src={src} alt={label || "Your new photo"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}</div>{label && <span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{label}</span>}</div>;

  const review = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 20px calc(18px + env(safe-area-inset-bottom, 0px))", gap: 14 }}>{reviewPhoto(result && result.photo, "min(64vw, 250px)")}<span data-testid="live-face-passed" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: good, color: "#fff", fontSize: 12.5, fontWeight: 800 }}><Check13 size={14} strokeWidth={3} />Live check passed</span><div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: T.surface, borderRadius: 16, padding: "12px 14px", boxShadow: T.shadowCard, width: "100%", boxSizing: "border-box" }}><Lock9 size={16} color={T.inkSoft} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: T.inkSoft }}>Only this photo is kept, downsized, with a coded face pattern. GLOOBAL didn't keep your voice or the video.</span></div><div style={{ flex: 1 }} />{saveError && <div data-testid="live-face-save-error" style={{ fontSize: 13, fontWeight: 700, color: T.negative, textAlign: "center", lineHeight: 1.45 }}>{saveError}</div>}<div style={{ display: "flex", gap: 10, width: "100%" }}><button data-testid="live-face-retake" onClick={() => start()} disabled={saving} style={button(false)}>Retake</button><button data-testid="live-face-use" onClick={() => use()} disabled={saving} style={button(true, { opacity: saving ? 0.7 : 1 })}>{saving ? "Saving…" : "Use this photo"}</button></div></div>;

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
