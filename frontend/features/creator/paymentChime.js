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
  var sentence = gloobalChimeSentence(amount, p.currency, language);
  gloobalChimeQueue = gloobalChimeQueue.then(function () {
    return gloobalPlayChimeTone().then(function () { return gloobalSpeak(sentence); });
  }).catch(function () { return false; });
  return gloobalChimeQueue;
}

// A payment the app already knew about when it opened is history, not
// news: marked as played without a sound.
function gloobalMarkChimePlayed(txnId) {
  if (txnId) gloobalChimePlayed.add(String(txnId));
}
