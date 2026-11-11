// ── THE COUNTER SOUNDBOX ───────────────────────────────────────────────
//
// When a payment to the CREATOR side is confirmed by the server, the phone
// plays a short two-note chime and then says the amount out loud —
// "Received 500 Indian rupees" — so a shopkeeper serving the next customer
// knows the money landed without looking at the screen.
//
// Only ever for a payment the server has recorded: App.jsx calls this from
// the received-payments read (GET /api/transactions), never from anything
// the payer's phone says. A screenshot of a "payment successful" screen
// makes no sound here.
//
// The chime is drawn with the Web Audio API (two sine notes with a soft
// overtone and a quick fade), so there is no sound file to download. The
// amount is spoken by the phone's own voice (speechSynthesis). Either can be
// missing on a given device; each is skipped on its own.
//
// Browsers only allow sound after the person has touched the page once.
// The first tap anywhere in the app unlocks both (gloobalChimeUnlock), so by
// the time a customer pays, the counter phone is ready.
//
// Works while the app is open, in front or behind another tab. With the
// app fully closed, the phone's normal notification sound plays instead —
// a closed web app cannot run Web Audio or speak.

var gloobalChimeContext = null;
var gloobalChimeEnabled = true;
var gloobalChimePlayed = new Set();
var gloobalChimeQueue = Promise.resolve();

// The account's "Payment sound" switch, mirrored here from
// User.securitySettings.paymentSound. App.jsx sets it whenever the account
// changes. Defaults to on, matching the server.
function gloobalSetPaymentSoundEnabled(enabled) {
  gloobalChimeEnabled = enabled !== false;
}

function gloobalChimeAudioContext() {
  if (gloobalChimeContext) return gloobalChimeContext;
  if (typeof window === "undefined") return null;
  var Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    gloobalChimeContext = new Ctor();
  } catch (e) {
    gloobalChimeContext = null;
  }
  return gloobalChimeContext;
}

// Called on the first touch or key press. Creates (or resumes) the audio
// context and primes the voice with a silent utterance, which is what the
// browser's autoplay rules ask for.
function gloobalChimeUnlock() {
  var ctx = gloobalChimeAudioContext();
  if (ctx && ctx.state === "suspended" && typeof ctx.resume === "function") {
    ctx.resume().catch(function () {});
  }
  try {
    if (typeof window !== "undefined" && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
      var silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
    }
  } catch (e) {
    /* no voice on this device */
  }
}

(function gloobalChimeInstallUnlock() {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  var done = false;
  var once = function () {
    if (done) return;
    done = true;
    gloobalChimeUnlock();
    window.removeEventListener("pointerdown", once, true);
    window.removeEventListener("keydown", once, true);
    window.removeEventListener("touchstart", once, true);
  };
  window.addEventListener("pointerdown", once, true);
  window.addEventListener("keydown", once, true);
  window.addEventListener("touchstart", once, true);
})();

// One bell-like note: a sine at the pitch plus a quieter one an octave up,
// rising in 6 ms and fading out over `length` seconds.
function gloobalChimeNote(ctx, frequency, startAt, length, level) {
  var out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, startAt);
  out.gain.exponentialRampToValueAtTime(level, startAt + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
  out.connect(ctx.destination);
  [[frequency, 1], [frequency * 2, 0.28]].forEach(function (partial) {
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(partial[0], startAt);
    amp.gain.setValueAtTime(partial[1], startAt);
    osc.connect(amp);
    amp.connect(out);
    osc.start(startAt);
    osc.stop(startAt + length + 0.05);
  });
}

// The chime itself: C6 then G6, the second ringing a little longer.
// Resolves when it has finished, so the voice starts after it.
function gloobalPlayChimeTone() {
  return new Promise(function (resolve) {
    var ctx = gloobalChimeAudioContext();
    if (!ctx) return resolve(false);
    var play = function () {
      try {
        var now = ctx.currentTime + 0.02;
        gloobalChimeNote(ctx, 1046.5, now, 0.55, 0.22);
        gloobalChimeNote(ctx, 1568.0, now + 0.13, 0.8, 0.2);
        setTimeout(function () { resolve(true); }, 650);
      } catch (e) {
        resolve(false);
      }
    };
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      ctx.resume().then(play, function () { resolve(false); });
    } else {
      play();
    }
  });
}

// What the phone says. The amount in words the voice reads naturally —
// "500 Indian rupees", not "₹500" — in Hindi on a Hindi phone, otherwise in
// English (the voice reads an English sentence correctly on any phone; a
// sentence half in another language does not).
function gloobalChimeSentence(amount, currency, language) {
  var lang = String(language || "en").toLowerCase();
  var whole = Math.abs(amount - Math.round(amount)) < 0.005;
  var useHindi = lang.indexOf("hi") === 0;
  var locale = useHindi ? "hi-IN" : "en-" + ((lang.split("-")[1] || "US").toUpperCase());
  var spoken;
  try {
    spoken = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "name",
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2
    }).format(amount);
  } catch (e) {
    spoken = String(whole ? Math.round(amount) : amount.toFixed(2)) + " " + (currency || "");
  }
  return useHindi
    ? { text: spoken + " प्राप्त हुए", lang: "hi-IN" }
    : { text: "Received " + spoken, lang: locale };
}

// ── YOUR OWN ANNOUNCEMENT ───────────────────────────────────────────────
//
// The founder, 10 Nov: like the soundbox on a shop counter, but the shop
// writes what it says — "100 CEL prapt hue, aapka dhanyavaad". The line is
// kept on this phone (localStorage); {amount} marks where the amount goes,
// and a line with no {amount} has the amount said first. No line saved
// means the standard sentence above.
var GLOOBAL_PAYMENT_LINE_KEY = "gloobal.paymentLine";
var GLOOBAL_PAYMENT_LINE_MAX = 80;
var GLOOBAL_PAYMENT_LINE_PRESETS = [
  "{amount} CEL prapt hue, aapka dhanyavaad",
  "{amount} CEL प्राप्त हुए, आपका धन्यवाद",
  "Received {amount} CEL. Thank you!",
  "{amount} CEL aa gaye. Phir aaiyega!"
];
function gloobalPaymentLineLoad() {
  try {
    if (typeof localStorage === "undefined") return "";
    var raw = localStorage.getItem(GLOOBAL_PAYMENT_LINE_KEY);
    return typeof raw === "string" ? raw.slice(0, GLOOBAL_PAYMENT_LINE_MAX).trim() : "";
  } catch (e) {
    return "";
  }
}
function gloobalPaymentLineSave(text) {
  try {
    var clean = String(text || "").slice(0, GLOOBAL_PAYMENT_LINE_MAX).trim();
    if (clean) localStorage.setItem(GLOOBAL_PAYMENT_LINE_KEY, clean);
    else localStorage.removeItem(GLOOBAL_PAYMENT_LINE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
// The line with the amount in it. The number is said plainly ("100", or
// "100.50"), because the line names the unit itself. Devanagari is read by
// a Hindi voice; Latin letters (English or Hinglish) by an Indian-English
// one, which says "prapt hue" as written.
function gloobalPaymentLineSentence(template, amount) {
  var whole = Math.abs(amount - Math.round(amount)) < 0.005;
  var number = whole ? String(Math.round(amount)) : amount.toFixed(2);
  var line = String(template || "").trim();
  var text = /\{amount\}/i.test(line) ? line.replace(/\{amount\}/gi, number) : number + ". " + line;
  return { text: text, lang: /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-IN" };
}
// Or an audio clip in place of the words: the shop's own voice or jingle,
// five seconds at most (recorded or uploaded in the Creator profile, cut
// to length by soundPayClipFromFile / soundPayRecordLine). A clip cannot
// say a number, so the amount is spoken straight after it: the soundbox's
// one job is that the shopkeeper hears how much came.
var GLOOBAL_PAYMENT_CLIP_KEY = "gloobal.paymentClip";
var GLOOBAL_PAYMENT_CLIP_MAX_MS = 5000;
function gloobalPaymentClipLoad() {
  try {
    if (typeof localStorage === "undefined") return "";
    var raw = localStorage.getItem(GLOOBAL_PAYMENT_CLIP_KEY);
    return typeof raw === "string" && raw.indexOf("data:audio/") === 0 ? raw : "";
  } catch (e) {
    return "";
  }
}
function gloobalPaymentClipSave(url) {
  try {
    if (url) localStorage.setItem(GLOOBAL_PAYMENT_CLIP_KEY, String(url));
    else localStorage.removeItem(GLOOBAL_PAYMENT_CLIP_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
// Plays the clip; resolves when it ends, fails, or five seconds have gone.
function gloobalPlayClip(url) {
  return new Promise(function (resolve) {
    var done = false;
    var audio = null;
    var finish = function (ok) {
      if (done) return;
      done = true;
      try { if (audio) audio.pause(); } catch (e) { /* already stopped */ }
      resolve(ok);
    };
    try {
      if (!url || typeof Audio === "undefined") return resolve(false);
      audio = new Audio(url);
      audio.onended = function () { finish(true); };
      audio.onerror = function () { finish(false); };
      setTimeout(function () { finish(true); }, GLOOBAL_PAYMENT_CLIP_MAX_MS + 300);
      var p = audio.play();
      if (p && p.catch) p.catch(function () { finish(false); });
    } catch (e) {
      finish(false);
    }
  });
}
function gloobalPaymentAmountOnly(amount) {
  return gloobalPaymentLineSentence("{amount} " + (typeof COIN_TICKER !== "undefined" ? COIN_TICKER : "CEL"), amount);
}

// What a payment of `amount` will say on this phone right now.
function gloobalPaymentSentence(amount, currency, language) {
  var custom = gloobalPaymentLineLoad();
  return custom ? gloobalPaymentLineSentence(custom, amount) : gloobalChimeSentence(amount, currency, language);
}
// "Hear it": the chime, then the line with a sample amount. From a tap.
function gloobalPreviewPaymentLine(template, currency) {
  gloobalChimeUnlock();
  var language = typeof navigator !== "undefined" ? navigator.language : "en";
  var clip = gloobalPaymentClipLoad();
  if (clip) return gloobalPlayChimeTone().then(function () { return gloobalPlayClip(clip); }).then(function () { return gloobalSpeak(gloobalPaymentAmountOnly(100)); });
  var sentence = String(template || "").trim() ? gloobalPaymentLineSentence(template, 100) : gloobalChimeSentence(100, currency, language);
  return gloobalPlayChimeTone().then(function () { return gloobalSpeak(sentence); });
}

function gloobalSpeak(sentence) {
  return new Promise(function (resolve) {
    try {
      if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
        return resolve(false);
      }
      var u = new SpeechSynthesisUtterance(sentence.text);
      u.lang = sentence.lang;
      u.rate = 0.95;
      u.volume = 1;
      var voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      var match = voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === sentence.lang.toLowerCase(); })[0] ||
        voices.filter(function (v) { return v.lang && v.lang.slice(0, 2).toLowerCase() === sentence.lang.slice(0, 2).toLowerCase(); })[0];
      if (match) u.voice = match;
      // Never hang the queue on a voice that never reports back.
      var finished = false;
      var finish = function (ok) { if (!finished) { finished = true; resolve(ok); } };
      u.onend = function () { finish(true); };
      u.onerror = function () { finish(false); };
      setTimeout(function () { finish(false); }, 6000);
      window.speechSynthesis.speak(u);
    } catch (e) {
      resolve(false);
    }
  });
}

// Plays one confirmed creator payment: chime, then the amount. Payments
// that arrive together are announced one after another, never over each
// other, and each payment at most once.
function gloobalPlayPaymentChime(payment) {
  var p = payment || {};
  if (!gloobalChimeEnabled) return Promise.resolve(false);
  var key = String(p.txnId || "");
  if (!key || gloobalChimePlayed.has(key)) return Promise.resolve(false);
  gloobalChimePlayed.add(key);
  var amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return Promise.resolve(false);
  var language = p.language || (typeof navigator !== "undefined" ? navigator.language : "en");
  var sentence = gloobalPaymentSentence(amount, p.currency, language);
  var clip = gloobalPaymentClipLoad();
  gloobalChimeQueue = gloobalChimeQueue.then(function () {
    return gloobalPlayChimeTone().then(function () {
      if (!clip) return gloobalSpeak(sentence);
      return gloobalPlayClip(clip).then(function () { return gloobalSpeak(gloobalPaymentAmountOnly(amount)); });
    });
  }).catch(function () { return false; });
  return gloobalChimeQueue;
}

// A payment the app already knew about when it opened is history, not
// news: marked as played without a sound.
function gloobalMarkChimePlayed(txnId) {
  if (txnId) gloobalChimePlayed.add(String(txnId));
}

// ── THE SIDE SWITCH ────────────────────────────────────────────────────
//
// A short sound when the account flips between its Personal and Creator
// sides, so the switch is heard as well as seen. Two quick notes that RISE
// going to Creator (opening the shop) and FALL going back to Personal,
// with a soft pitch slide on each so it reads as a turn rather than a
// beep. Quieter and shorter than the payment chime, so the two are never
// confused at a counter.
//
// Follows the same "Sounds" switch as the payment chime. Always played
// from the tap itself, so the browser's sound rules are already met.
function gloobalPlayRoleSwitchSound(side) {
  if (!gloobalChimeEnabled) return false;
  var ctx = gloobalChimeAudioContext();
  if (!ctx) return false;
  var toCreator = side === "merchant" || side === "creator";
  var play = function () {
    try {
      var now = ctx.currentTime + 0.01;
      var notes = toCreator ? [[659.3, 784.0], [987.8, 1318.5]] : [[987.8, 880.0], [659.3, 523.3]];
      notes.forEach(function (pair, i) {
        var at = now + i * 0.085;
        var out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, at);
        out.gain.exponentialRampToValueAtTime(0.12, at + 0.008);
        out.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
        out.connect(ctx.destination);
        var osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(pair[0], at);
        osc.frequency.exponentialRampToValueAtTime(pair[1], at + 0.07);
        osc.connect(out);
        osc.start(at);
        osc.stop(at + 0.26);
      });
    } catch (e) {
      /* a missing sound never blocks the switch */
    }
  };
  if (ctx.state === "suspended" && typeof ctx.resume === "function") {
    ctx.resume().then(play, function () {});
  } else {
    play();
  }
  return true;
}
