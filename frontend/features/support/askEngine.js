// src/features/support/askEngine.js
//
// ── ASK GLOOBAL: FINDING THE ANSWER, ON THE PHONE (0223) ──────────────────
//
// No AI service, no server round trip: the guide's cards are already on the
// phone, and this file finds the one a question is about. Plain functions
// only, so the tests run it in Node against the real guide.
//
//   1. Which language — by the letters (देवनागरी → Hindi, தமிழ் → Tamil);
//      Latin letters are Hinglish when Hindi words show up ("paise kaise").
//   2. Tidy the words — spellings people use for the same word collapse
//      ("wapas"/"vapas", "paisa"/"paise"), filler goes, and words that
//      mean the same thing across languages meet on one key
//      (nikalna = withdraw = निकालना = எடுக்க).
//   3. Score every card: how much of the question each of its "ways of
//      asking" covers, by word (a typo or a different ending still counts)
//      and by letter groups; the screen the question came from adds a little.
//   4. Decide — a clear winner is answered; a close call offers the three
//      nearest; nothing near says so and offers a person.
//
// A question about the person's OWN money ("maine kal Ravi ko 500 bheje")
// is spotted separately: the guide cannot see payments, so it hands over.

var ASK_LANG_CODES = ["en", "hi", "hl", "ta", "bn", "te", "mr", "gu", "kn", "ml", "pa", "ur", "ar", "es", "fr", "pt", "de", "id", "ru", "zh", "ja", "ko"];
// 0252: every phone gets these four. Any other language is one "pack" more,
// fetched when it is chosen or written in (see askLoadGuide), so nobody
// carries or searches 22 languages to read one.
var ASK_CORE_LANGS = ["en", "hi", "hl", "ta"];
function askIsCore(l) { return ASK_CORE_LANGS.includes(l); }

// The chosen pack's own words: spellings that mean the same thing, filler, and
// what marks a question about the person's own money. Set by askUsePack.
var ASK_PACK = { syn: [], stop: new Set(), me: [], happened: [], memo: new Map(), notCore: [] };
// Everyday words of a pack language that start like a core key's word: Spanish
// "país" is not "paisa" (money), "usar" is not "USA", Indonesian "pindah" is not a PIN.
var ASK_NOT_CORE = { es: ["pais", "usa"], pt: ["pais", "usa"], fr: ["pais", "usa"], de: ["pinn"], id: ["pinda", "pinj"] };

// Words that carry no meaning of their own, in all four languages at once.
var ASK_STOP = new Set([
  "a", "an", "the", "to", "of", "in", "on", "at", "for", "is", "are", "am", "was", "be", "it", "its", "this", "that",
  "and", "or", "with", "do", "does", "did", "can", "could", "i", "me", "my", "we", "you", "your", "please", "pls", "plz",
  "hai", "hain", "he", "ka", "ke", "ki", "ko", "se", "me", "mein", "mai", "main", "ye", "yeh", "vo", "voh", "aur",
  "bhi", "toh", "to", "ho", "hi", "na", "ji", "jo", "ek", "kuch", "apna", "apne", "apni",
  "है", "हैं", "का", "के", "की", "को", "से", "में", "मैं", "यह", "ये", "वह", "और", "भी", "तो", "हो", "जी", "एक", "अपना", "अपने", "अपनी", "कुछ",
  "ஒரு", "இது", "அது", "மற்றும்", "நான்", "என்", "உங்கள்", "என்னுடைய",
]);

// One key for words that mean the same thing. A word joins a key when it
// starts with one of these (so "bhejna", "bheje", "bhejo" all join "send").
// Written AFTER the spelling tidy below ("aa"→"a", "w"→"v", "z"→"j"…).
var ASK_SYN = [
  ["money", ["money", "paise", "paisa", "pais", "rupay", "rupi", "rupe", "cash", "amount", "amaunt", "rakam", "पैस", "रुपय", "रकम", "पैसा", "பணம", "பணத", "காச", "தொகை"]],
  ["send", ["send", "sent", "sned", "bhej", "भेज", "அனுப்ப", "transfer", "trasfer", "ट्रांसफ", "டிரான்ஸ்ஃப"]],
  ["withdraw", ["vithdra", "vidra", "nikal", "निकाल", "cashout", "payout", "எடுக்க", "எடுப்ப", "எடுக"]],
  ["bank", ["bank", "बैंक", "வங்கி", "பேங்க"]],
  ["shop", ["shop", "store", "dukan", "दुकान", "கடை", "ஷாப்"]],
  ["account", ["account", "acount", "khata", "खाता", "கணக்க"]],
  ["fast", ["fast", "quick", "jaldi", "jldi", "जल्दी", "சீக்கிரம", "வேகம"]],
  ["cancel", ["cancel", "undo", "vapas", "vapis", "refund", "रद्द", "वापस", "ரத்து", "திரும்ப"]],
  ["limit", ["limit", "maximum", "sima", "सीमा", "लिमिट", "வரம்ப", "லிமிட"]],
  ["abroad", ["abroad", "foreign", "international", "overseas", "videsh", "विदेश", "வெளிநாட", "country", "desh", "देश", "நாட",
    // Where people most often send to, by name: "paise dubai bhejne hai".
    "usa", "america", "amerika", "dubai", "uae", "emirat", "london", "england", "canada", "kanada", "australia", "singapur",
    "saudi", "katar", "kuvait", "oman", "nepal", "bangladesh", "malaysia", "mexico", "germany", "europe", "yurop",
    "अमेरिका", "दुबई", "लंदन", "कनाडा", "सऊदी", "नेपाल", "அமெரிக்க", "துபாய", "சிங்கப்பூர", "மலேசிய"]],
  ["hold", ["hold", "block", "frozen", "friz", "suspend", "rok", "रोक", "ब्लॉक", "முடக்க", "நிறுத்த"]],
  ["scan", ["scan", "scanner", "qr", "स्कैन", "ஸ்கேன"]],
  ["wrong", ["wrong", "galat", "glat", "गलत", "தவற"]],
  ["history", ["history", "histry", "receipt", "reciept", "statement", "रसीद", "हिस्ट्री", "ரசீத", "வரலாற"]],
  ["essentials", ["essential", "esential", "ज़रूर", "जरूर", "எசென்ஷ"]],
  ["geu", ["cel", "gleu", "glue", "geu", "gue"]],
  ["notify", ["notif", "alert", "सूचना", "नोटिफ", "அறிவிப்ப"]],
  ["pin", ["pin", "पिन", "பின"]],
  ["receive", ["receiv", "reciev", "milt", "milega", "मिलेग", "मिलत", "பெற"]],
  ["shopmoney", ["sale", "earning", "kamai", "कमाई", "வருமான"]],
];

// Hindi words people type in Latin letters. Two of these (or one in a short
// question) mean Hinglish.
var ASK_HL_WORDS = new Set([
  "kaise", "kese", "kaisay", "kya", "kyu", "kyun", "kyon", "kab", "kitna", "kitne", "kitni", "kahan", "kaha", "kaun", "kon",
  "hai", "hain", "nahi", "nahin", "nai", "mera", "meri", "mere", "mujhe", "maine", "mene", "hamara", "apna", "apne",
  "paise", "paisa", "bhejna", "bheje", "bhejo", "bhej", "bheja", "nikalna", "nikale", "nikalo", "karna", "karu", "karun", "kare",
  "karein", "karen", "karo", "ka", "ki", "ke", "ko", "se", "mein", "aur", "bhi", "wapas", "vapas", "khata", "chahiye", "sakta",
  "sakte", "sakti", "raha", "rahe", "rahi", "gaya", "gaye", "hua", "hue", "abhi", "tak", "kal", "aaj", "dikha", "dikh", "milega",
  "mila", "mile", "batao", "bataye", "samjhao", "dusre", "desh", "dukan", "galat",
]);
// The script a piece of text is written in.
function askScript(text) {
  const s = String(text || "");
  const count = (re) => (s.match(re) || []).length;
  const n = {
    hi: count(/[ऀ-ॿ]/g), ta: count(/[஀-௿]/g), latin: count(/[A-Za-zÀ-ɏ]/g),
    other: count(/[؀-ۿঀ-৿਀-੿઀-૿଀-୿ఀ-౿ಀ-೿ഀ-ൿ฀-๿Ѐ-ӿͰ-Ͽ぀-ヿ一-鿿가-힯]/g),
  };
  // "GLOOBAL Bank কি": app names are Latin in every language, so a question's
  // own letters decide as soon as there are any to speak of.
  const own = Object.entries(n).filter(([k]) => k !== "latin").sort((a, b) => b[1] - a[1])[0];
  if (own[1] >= 2) return own[0];
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top[1] ? top[0] : "";
}

// A script that belongs to one language, or that tells two apart.
var ASK_SCRIPT_LANG = { bn: /[ঀ-৿]/g, pa: /[਀-੿]/g, gu: /[઀-૿]/g, kn: /[ಀ-೿]/g, ml: /[ഀ-ൿ]/g, te: /[ఀ-౿]/g, ru: /[Ѐ-ӿ]/g, ko: /[가-힯]/g };
// Marathi and Hindi share their letters; these words are Marathi's.
var ASK_MR_WORDS = new Set(["करणे", "कसे", "आहे", "माझे", "नाही", "माझ्या", "बँक", "माझा", "एसेन्शियल्स", "आहेत", "किती", "काय", "पाठवणे", "करायचे", "ट्रान्सफर", "परत", "बँकेत", "पाठवू", "झाले", "कुठे", "बॅलन्स", "मी", "येत", "नाहीत", "माझी", "भाडे", "स्कॅन", "रेफरल", "उघडणे", "ॲड", "त्यांना", "रक्कम", "रकमा", "घेणे", "चुकीच्या", "म्हणजे", "आयडी", "नवीन", "नोटिफिकेशन", "दुकानाचे", "पाठवायचे", "करू", "थांबवले", "शकतो", "वेळ", "पाठवले", "लागते", "करून", "आणि", "सुरू", "शकते", "कोण", "तक्रार", "जोडणे", "द्यायचे", "मित्राला", "व्यक्तीला", "मिळतील", "शकत", "मर्यादा"]);
var ASK_HI_ONLY_WORDS = new Set(["है", "में", "से", "और", "पर", "कैसे", "के", "है।", "नहीं", "बैंक", "हैं।", "हैं", "की", "करें", "दबाएँ।", "रकम", "आपके", "अकाउंट", "को", "भी", "सकते", "क्या", "हो", "आप", "लिए", "मेरी", "खोलें", "वह", "बैलेंस", "किसी"]);
function askDevCount(text, set) { return String(text || "").split(/[^\u0900-\u097f]+/).filter((w) => set.has(w)).length; }
// Urdu's letters that Arabic does not use.
var ASK_UR_LETTERS = /[ٹڈڑںھہےگچپژ]/;
// A few words only each Latin-script language has, to tell them apart.
var ASK_LATIN_WORDS = {
  es: ["dinero", "cómo", "qué", "tienda", "cuenta", "pago", "con", "mis", "una", "puedo", "transferencia", "ubicación", "envío", "bancaria", "plata", "persona", "cuánto", "agregar", "alquiler", "los", "recibir", "límite", "dónde", "pagos", "otro", "del", "datos", "cobrar", "nuevo", "quién", "puede", "esenciales", "negocio", "pagarle", "teléfono", "moneda", "otra", "cantidades", "cantidad", "hoy", "envié", "equivocada", "activar", "sesión", "cambiar", "notificaciones", "retiro", "retirar", "alguien", "veo", "llega", "tarda", "llegó", "cuándo", "quiero", "pagué", "error", "renta", "desde", "leer"],
  pt: ["dinheiro", "para", "como", "conta", "meu", "loja", "minha", "que", "não", "pagamento", "com", "meus", "pessoa", "uma", "transferência", "receber", "localização", "bancária", "quanto", "aluguel", "consigo", "adicionar", "envio", "novo", "pagamentos", "alguém", "valores", "valor", "tempo", "quando", "errada", "onde", "quem", "fazer", "outro", "posso", "dados", "pode", "notificações", "moeda", "vai", "hoje", "chegou", "enviei", "paguei", "ligar", "ler", "recebo", "colocar", "falar", "qual", "volta", "quero", "errado", "ativar", "compartilhar", "mudar", "estão", "minhas", "conversas"],
  fr: ["mon", "argent", "est", "boutique", "compte", "comment", "envoyer", "payer", "paiement", "pas", "mes", "banque", "pourquoi", "bancaire", "une", "sur", "avec", "les", "solde", "loyer", "virement", "recevoir", "envoi", "dans", "vers", "ajouter", "faire", "numéro", "montant", "peux", "identifiant", "personne", "combien", "bloqué", "pour", "reçu", "localisation", "peut", "connecter", "paiements", "ouvrir", "quelqu", "ami", "autre", "montants", "suspendu", "quand", "annuler", "quoi", "connexion", "qui", "parrainage", "retirer", "parler", "téléphone", "envoyé", "mauvais", "payé", "position", "activer"],
  de: ["geld", "ich", "wie", "ist", "nicht", "meine", "zahlung", "bezahlen", "die", "senden", "kann", "konto", "mit", "warum", "das", "auf", "meinen", "was", "standort", "miete", "eine", "bei", "guthaben", "bankkonto", "pausiert", "gesperrt", "falsche", "ein", "überweisung", "beträge", "betrag", "aus", "meiner", "zahlungen", "einen", "zum", "lange", "geht", "bezahlt", "scannen", "und", "laden", "funktioniert", "von", "anmelden", "sicher", "eröffnen", "hinzufügen", "abheben", "schicken", "freund", "bezahle", "ausland", "viel", "dauert", "angekommen", "wann", "bekommen", "werden", "mich"],
  id: ["saya", "uang", "toko", "cara", "pembayaran", "tidak", "bagaimana", "bayar", "bisa", "rekening", "kirim", "yang", "akun", "kenapa", "apa", "apakah", "lokasi", "terima", "jumlah", "sewa", "itu", "orang", "masuk", "salah", "dengan", "lain", "berapa", "untuk", "kode", "pakai", "buka", "tambah", "teman", "nomor", "ini", "lama", "membayar", "dari", "mana", "mengirim", "mereka", "ada", "dihentikan", "diblokir", "belum", "tarik", "baru", "struk", "pelanggan", "negara", "batas", "sementara", "hari", "sampai", "transaksi", "dikembalikan", "dan", "arti", "terkunci", "lihat"],
};
var ASK_EN_WORDS = new Set(["how", "what", "why", "when", "where", "who", "which", "the", "is", "are", "my", "can", "do", "does", "send", "money", "pay", "bank", "account", "i", "to"]);

// Which of our languages a question is in — and whether it is one we
// actually wrote answers in (known: false → answered in English).
function askDetectLang(text, fallback) {
  const script = askScript(text);
  const s = String(text || "");
  if (script === "hi") {
    const mr = askDevCount(s, ASK_MR_WORDS);
    const hiOnly = askDevCount(s, ASK_HI_ONLY_WORDS);
    if (mr > hiOnly || (fallback === "mr" && hiOnly === 0)) return { lang: "mr", known: true };
    return { lang: "hi", known: true };
  }
  if (script === "ta") return { lang: "ta", known: true };
  if (script === "other") {
    for (const [l, re] of Object.entries(ASK_SCRIPT_LANG)) { re.lastIndex = 0; if (re.test(s)) return { lang: l, known: true }; }
    if (/[؀-ۿ]/.test(s)) return { lang: ASK_UR_LETTERS.test(s) || fallback === "ur" ? "ur" : "ar", known: true };
    if (/[぀-ヿ]/.test(s)) return { lang: "ja", known: true };
    if (/[一-鿿]/.test(s)) return { lang: fallback === "ja" ? "ja" : "zh", known: true };
    return { lang: "en", known: false };
  }
  if (script !== "latin") return { lang: fallback || "en", known: true };
  const words = String(text).toLowerCase().split(/[^a-zÀ-ɏ]+/).filter(Boolean);
  const hl = words.filter((w) => ASK_HL_WORDS.has(w)).length;
  const scores = Object.entries(ASK_LATIN_WORDS).map(([l, list]) => {
    let n = words.filter((w) => list.includes(w)).length;
    // Letters that give a language away, and a tie goes to the chosen one.
    if (l === "es" && /[ñ¿¡]/.test(s)) n += 1;
    if (l === "pt" && /[ãõ]/.test(s)) n += 1;
    if (l === "de" && /[ßäöü]/i.test(s)) n += 1;
    if (l === "fr" && /[èêàç]/i.test(s)) n += 1;
    return { l, n: n + (l === fallback ? 0.5 : 0) };
  }).sort((a, b) => b.n - a.n);
  const top = scores[0];
  const en = words.filter((w) => ASK_EN_WORDS.has(w)).length;
  if (top.n >= 2 && top.n > en) return { lang: top.l, known: true };
  if (top.n >= 1 && hl === 0 && en === 0) return { lang: top.l, known: true };
  if (hl >= 2 || (hl >= 1 && words.length <= 3)) return { lang: "hl", known: true };
  // A pack language chosen, and nothing in the words that says otherwise:
  // Latin letters are how many people type Bengali, Urdu, Spanish and the rest.
  if (fallback && !askIsCore(fallback) && en === 0 && hl === 0) return { lang: fallback, known: true };
  // A Hindi phone that types in Latin letters is probably Hinglish.
  if (hl >= 1 && fallback === "hl") return { lang: "hl", known: true };
  return { lang: "en", known: true };
}

// The same word, however it is spelled.
function askTidyWord(w) {
  let x = w;
  if (/^[a-z]+$/.test(x)) {
    x = x.replace(/ph/g, "f").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k")
      .replace(/aa+/g, "a").replace(/ee+/g, "i").replace(/oo+/g, "u").replace(/([bcdfghjklmnprstvxy])\1+/g, "$1");
  } else {
    x = x.replace(/़/g, "").replace(/ँ/g, "ं");
  }
  return x;
}

function askNormalize(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .replace(/\*\*/g, " ").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function askSynKey(w) {
  if (ASK_PACK.notCore.some((x) => w.startsWith(x))) return ASK_PACK.syn.find(([, v]) => w === v || (v.length >= 3 && w.startsWith(v)))?.[0] || null;
  for (const [key, variants] of ASK_SYN) {
    for (const v of variants) if (w === v || (v.length >= 3 && w.startsWith(v))) return key;
  }
  if (!ASK_PACK.syn.length) return null;
  if (ASK_PACK.memo.has(w)) return ASK_PACK.memo.get(w);
  let found = null;
  for (const [key, v] of ASK_PACK.syn) if (w === v || (v.length >= 3 && w.startsWith(v))) { found = key; break; }
  ASK_PACK.memo.set(w, found);
  return found;
}

// A pack's words, tidied the way a question's words are.
function askUsePack(pack) {
  const tidy = (x) => askNormalize(x).split(" ").filter(Boolean).map(askTidyWord).join(" ");
  const syn = [];
  for (const [key, list] of Object.entries((pack && pack.syn) || {})) {
    for (const v of list || []) { const t = tidy(v); if (t && !t.includes(" ")) syn.push([key, t]); }
  }
  const p = (pack && pack.personal) || {};
  ASK_PACK = {
    syn,
    stop: new Set(((pack && pack.stop) || []).map(tidy).filter(Boolean)),
    me: (p.me || []).map((x) => askNormalize(x)).filter(Boolean),
    happened: (p.happened || []).map((x) => askNormalize(x)).filter(Boolean),
    memo: new Map(),
    notCore: ASK_NOT_CORE[(pack && pack.lang) || ""] || [],
  };
}

// Chinese and Japanese have no spaces: two letters at a time stand in for words.
var ASK_CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
function askSplitWords(raw) {
  const out = [];
  for (const w of raw) {
    if (!ASK_CJK.test(w)) { out.push(w); continue; }
    const ch = Array.from(w);
    if (ch.length <= 2) { out.push(w); continue; }
    for (let i = 0; i + 2 <= ch.length; i += 1) out.push(ch[i] + ch[i + 1]);
  }
  return out;
}

// The words of a question that matter, tidied, with shared meanings joined.
function askTokens(text, keepLastRaw) {
  const raw = askSplitWords(askNormalize(text).split(" ").filter(Boolean));
  const out = [];
  raw.forEach((w, i) => {
    if (ASK_STOP.has(w)) return;
    const t = askTidyWord(w);
    if (!t || ASK_PACK.stop.has(t)) return;
    const key = askSynKey(t);
    // While someone is still typing, the last word is half a word: keep it
    // as written so it can match the start of a longer one.
    if (keepLastRaw && i === raw.length - 1) out.push({ t, key, partial: true });
    else out.push({ t, key });
  });
  return out;
}

function askGrams(text) {
  const s = ` ${askTokens(text).map((x) => x.t).join(" ")} `;
  const g = new Set();
  const chars = Array.from(s);
  for (let i = 0; i + 3 <= chars.length; i += 1) g.add(chars.slice(i, i + 3).join(""));
  return g;
}

// At most one letter wrong, missing, extra, or two swapped.
function askNear(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n] <= 1;
}

// How alike two words are, 0..1.
function askSim(q, d) {
  if (q.key && q.key === d.key) return 1;
  const a = q.t, b = d.t;
  if (a === b) return 1;
  if (q.partial && a.length >= 2 && b.startsWith(a)) return 0.9;
  const n = Math.min(a.length, b.length);
  let p = 0;
  while (p < n && a[p] === b[p]) p += 1;
  if (p >= 3 && p >= n * 0.6) return 0.55 + 0.4 * (p / Math.max(a.length, b.length));
  if (n >= 4 && askNear(a, b)) return 0.8;
  return 0;
}

// The guide, ready to search. Built once per guide version.
function askBuildIndex(cards) {
  const docs = [];
  const df = new Map();
  for (const card of cards || []) {
    const seen = new Set();
    for (const lang of Object.keys(card.t || {})) {
      const x = card.t[lang];
      for (const text of [x.q, ...(x.asks || [])]) {
        const toks = askTokens(text);
        if (!toks.length) continue;
        docs.push({ card, lang, toks, grams: askGrams(text) });
        for (const tk of toks) seen.add(tk.key || tk.t);
      }
    }
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = Math.max(1, (cards || []).length);
  const idf = (tk) => Math.log(1 + N / (df.get(tk.key || tk.t) || 0.5));
  return { cards: cards || [], byId: new Map((cards || []).map((c) => [c.id, c])), docs, idf };
}

// Every card, best first, for one question.
function askRank(index, text, opts) {
  const o = opts || {};
  const q = askTokens(text, Boolean(o.typing));
  if (!q.length || !index || !index.docs.length) return [];
  const qg = askGrams(text);
  const qw = q.map((tk) => index.idf(tk));
  const qSum = qw.reduce((s, x) => s + x, 0) || 1;
  const best = new Map();
  for (const doc of index.docs) {
    let cov = 0;
    const used = new Array(doc.toks.length).fill(0);
    q.forEach((tk, i) => {
      let m = 0, at = -1;
      doc.toks.forEach((dt, j) => { const s = askSim(tk, dt); if (s > m) { m = s; at = j; } });
      cov += qw[i] * m;
      if (at >= 0) used[at] = Math.max(used[at], m);
    });
    cov /= qSum;
    const dw = doc.toks.map((dt) => index.idf(dt));
    const dSum = dw.reduce((s, x) => s + x, 0) || 1;
    const back = dw.reduce((s, w, j) => s + w * used[j], 0) / dSum;
    let inter = 0;
    for (const g of qg) if (doc.grams.has(g)) inter += 1;
    const tri = inter / Math.max(1, qg.size + doc.grams.size - inter);
    let score = 0.58 * cov + 0.27 * back + 0.15 * tri;
    if (o.lang && doc.lang === o.lang) score += 0.02;
    const prev = best.get(doc.card.id);
    if (!prev || score > prev.score) best.set(doc.card.id, { card: doc.card, score, lang: doc.lang });
  }
  const out = [...best.values()];
  if (o.screen) for (const r of out) if ((r.card.screens || []).includes(o.screen)) r.score += 0.05;
  return out.sort((a, b) => b.score - a.score);
}

// Answer, offer three, or say nothing fits.
function askDecide(ranked) {
  const [a, b] = ranked || [];
  if (!a || a.score < 0.42) return { kind: "none", top: [] };
  const gap = b ? a.score - b.score : 1;
  if ((a.score >= 0.5 && gap >= 0.08) || a.score >= 0.78) return { kind: "answer", top: [a] };
  return { kind: "choices", top: ranked.filter((r) => r.score >= 0.3).slice(0, 3) };
}

// Is this about the person's OWN money — a payment they made, money that
// did not arrive, a balance that looks wrong? The guide can't see any of
// that, so these go to a person.
var ASK_ME = /(^|[^\p{L}])(i|i've|ive|my|mine|me|maine|mene|mai|main|mera|meri|mere|mujhe|hamne|humne|hamara|मैंने|मैने|मेरा|मेरी|मेरे|मुझे|हमने|हमारा|நான்|என்|எனது|எனக்கு|என்னுடைய)(?=$|[^\p{L}])/iu;
var ASK_HAPPENED = /(?:^|[^\p{L}\p{M}])(sent|paid|transferred|deducted|debited|not received|didn'?t (get|receive|arrive|come)|not (arrived|credited|come)|haven'?t (got|received)|missing|stuck|where is my|bheje|bheja|bhejе|bhja|bheji|nahi (mil|aa|aay|pahunch|pohoch)|nahin (mil|aa|pahunch)|nai mil|kat gay|kat gaya|kata|cut ho|katt|भेजे|भेजा|भेजी|नहीं मिल|नही मिल|नहीं आ|नहीं पहुं|नहीं पहुँ|कट गए|कट गया|அனுப்பினேன்|அனுப்பிய|வரவில்லை|கிடைக்கவில்லை|போகவில்லை|சேரவில்லை|கழிந்த)/iu;
function askIsPersonal(text) {
  const s = String(text || "");
  // A pack's words, whole or as a word's start where words have spaces.
  const hit = (list) => {
    if (!list.length) return false;
    const n = ` ${askNormalize(s)} `;
    return list.some((p) => (/[a-z]/.test(p) ? n.includes(` ${p}`) : n.includes(p)));
  };
  const happened = ASK_HAPPENED.test(s) || hit(ASK_PACK.happened);
  if (!happened) return false;
  return /\p{Nd}/u.test(s) || ASK_ME.test(s) || hit(ASK_PACK.me);
}

// Bold in an answer is written **like this**.
function askPlain(text) { return String(text || "").replace(/\*\*/g, ""); }

// Read aloud, GLOOBAL is said "Global": a phone's voice spells the double-o
// name out letter by letter. Only what is spoken changes, never what is shown.
// Written in each voice's own letters, because a voice for another language
// can stumble over a Latin word.
var ASK_SPOKEN_NAME = { hi: "ग्लोबल", mr: "ग्लोबल", ta: "குளோபல்", bn: "গ্লোবাল", te: "గ్లోబల్", gu: "ગ્લોબલ", kn: "ಗ್ಲೋಬಲ್", ml: "ഗ്ലോബൽ", pa: "ਗਲੋਬਲ", ur: "گلوبل", ar: "جلوبال", ru: "Глобал", ja: "グローバル", ko: "글로벌" };
// CEL is said as a word, not spelled (gloobalSpokenText, paymentChime.js).
function askSpoken(text, lang) {
  const said = askPlain(text).replace(/gloobal/gi, ASK_SPOKEN_NAME[lang] || "Global");
  return typeof gloobalSpokenText === "function" ? gloobalSpokenText(said, lang) : said;
}
