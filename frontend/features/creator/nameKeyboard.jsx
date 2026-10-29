// src/features/creator/nameKeyboard.jsx
//
// GLOOBAL'S OWN KEYBOARD, FOR THE ONE THING A PHONE KEYBOARD CANNOT DO.
//
// ── THE PROBLEM, EXACTLY ────────────────────────────────────────────────
//
// A creator name may be written in any of twenty-seven alphabets. The
// server already says so — CREATOR_SCRIPT_NAMES lists them, and a shop
// called रसोई.घर is as valid as one called rasoi.ghar.
//
// Typing one is a different matter. A phone has the keyboards its owner
// installed, and almost nobody installs a second one. Somebody in Alwar
// who wants to pay रसोई.घर has a Latin keyboard, sees a name they cannot
// reproduce, and gives up — not because the name is unusual but because
// the device they were handed cannot write it. The shop loses the sale
// over a font.
//
// Scanning their code is the way round it and always will be. But a name
// you can say out loud and cannot type is a half-built promise, and the
// founder's instruction was plain: our own multi-language keyboard.
//
// ── WHY IT IS NOT A FULL KEYBOARD, AND SHOULD NOT BE ────────────────────
//
// This types NAMES, not prose. That narrows it enormously and the narrow
// version is the better one:
//
//   * No space bar and no dot. Both are refused by the server
//     (CREATOR_HANDLE_FORBIDDEN), and a key whose only outcome is an
//     error is worse than no key.
//   * No word suggestions, no autocorrect. A handle is not a word; a
//     keyboard that "fixes" रसोई into something else writes a name that
//     resolves to nobody.
//   * No long-press accent menus. A long press on a phone is already
//     taken by text selection, and the accented forms that matter are
//     simply on the board.
//
// ── WHAT IS NOT HERE, AND WHY THAT IS HONEST ────────────────────────────
//
// Han, Hangul and Ethiopic are MISSING ON PURPOSE, and the right thing is
// to say so rather than ship three boards that do not work:
//
//   * Han needs a dictionary — you type a sound and choose a character
//     from thousands. That is an input method, not a layout.
//   * Hangul needs composition: ㄱ and ㅏ have to become 가. Laid out as
//     bare jamo it produces text that looks right and compares wrong.
//   * Ethiopic is a syllabary of several hundred forms; the base set
//     alone cannot write most names.
//
// A device that can already type them keeps working — the board hides and
// the phone's own keyboard takes over. That is strictly better than a
// board that writes something subtly incorrect.
//
// ── ONE ALPHABET PER PART, ENFORCED WHERE IT IS CHEAP ───────────────────
//
// The server refuses a part written in two alphabets. Until now you found
// that out AFTER typing the whole name. The board knows which alphabet it
// is in, so it can say so at the first keystroke that would break the
// rule — the same rule, the same message, several seconds earlier.
import { useState as useState58, useEffect as useEffect54, useMemo as useMemo15, useRef as useRef33 } from "react";
import { Check as Check11, X as X14, Keyboard, Search as Search8, ChevronDown as ChevronDown6, ArrowRight as ArrowRight3 } from "lucide-react";

// ── THE ALPHABETS ───────────────────────────────────────────────────────
//
// `script` is the Unicode script name, spelled exactly as the server
// spells it in CREATOR_SCRIPT_NAMES. That is not decoration: the mixing
// check below compares against these, so a typo here would be a board
// whose own output it then refuses.
//
// `native` is the chip's label, written in the alphabet it opens. A list
// of English names — "Devanagari", "Gurmukhi" — is a list somebody has to
// already know. अ and ਅ are recognised by the people who need them.
//
// Keys are grouped because an abugida is not a flat set. Sixty keys in an
// undifferentiated grid is a wall; the same sixty under Letters, Signs
// and Vowels is three short lists.
//
// "Independent" rather than a second group called "Vowels": on an Indic
// board the vowel that stands alone at the start of a word (अ) and the
// matra that hangs off a consonant (ा) are different things, and only the
// first is rare. Thai, Lao and Khmer have no such split — their "Vowels"
// ARE the everyday signs, which is why those boards keep that group
// second while the Indic ones put Independent last.
//
// THE ORDER OF THOSE THREE IS NOT ALPHABETICAL and is not arbitrary. The
// board is capped at a third of the screen, so roughly two groups are
// visible and the third is a scroll. Writing रसोई needs र स ो ई — two
// letters, a matra, and one independent vowel. Letters and signs are
// what a thumb returns to on nearly every character; an independent
// vowel appears at the start of a word and almost nowhere else. A first
// render had Vowels on top, which put the matras below the fold on the
// one board most likely to open by default in India.
var NAME_KEYBOARD_LAYOUTS = [
  {
    id: "latin", script: "Latin", name: "English", nativeName: "English", also: ["Spanish", "French", "Portuguese", "Indonesian", "German", "Vietnamese", "Turkish", "Italian", "Polish", "Swahili", "Tagalog", "Dutch", "Malay", "Romanian", "Zulu", "Yoruba", "Hausa"], speakers: 3000, native: "Aa", caps: true,
    groups: [{ rows: [
      // QWERTY as rows rather than as a 10-wide grid. Flowed into a grid
      // it came out `a s d f g h j k l z`, with the z of the bottom row
      // pulled up to fill the gap — half the shape a thumb knows and
      // half not, which is worse than either. A render showed it.
      ["q","w","e","r","t","y","u","i","o","p"],
      ["a","s","d","f","g","h","j","k","l"],
      ["z","x","c","v","b","n","m"]
    ] }, { label: "Accents", keys: [
      "á","à","â","ä","ã","å","é","è","ê","ë",
      "í","ì","î","ï","ó","ò","ô","ö","õ","ø",
      "ú","ù","û","ü","ñ","ç","ß","æ","œ","ý"
    ] }]
  },
  {
    id: "cyrillic", script: "Cyrillic", name: "Russian", nativeName: "Русский", also: ["Ukrainian", "Serbian", "Bulgarian", "Kazakh", "Belarusian", "Macedonian", "Mongolian", "Kyrgyz", "Tajik"], speakers: 320, native: "Аб", caps: true,
    groups: [{ rows: [
      ["й","ц","у","к","е","н","г","ш","щ","з","х","ъ"],
      ["ф","ы","в","а","п","р","о","л","д","ж","э"],
      ["я","ч","с","м","и","т","ь","б","ю","ё"]
    ] }, { label: "Also", keys: ["і","ї","є","ґ","ў","ќ","љ","њ","џ","ђ","ћ","ј"] }]
  },
  {
    id: "greek", script: "Greek", name: "Greek", nativeName: "Ελληνικά", also: [], speakers: 13, native: "Αα", caps: true,
    groups: [{ rows: [
      ["ς","ε","ρ","τ","υ","θ","ι","ο","π"],
      ["α","σ","δ","φ","γ","η","ξ","κ","λ"],
      ["ζ","χ","ψ","ω","β","ν","μ"]
    ] }, { label: "Accents", keys: ["ά","έ","ή","ί","ό","ύ","ώ","ϊ","ϋ","ΐ","ΰ"] }]
  },
  {
    id: "devanagari", script: "Devanagari", name: "Hindi", nativeName: "हिन्दी", also: ["Marathi", "Nepali", "Sanskrit", "Konkani", "Maithili", "Bhojpuri", "Dogri"], speakers: 725, native: "अ",
    groups: [
      { label: "Letters", keys: [
        "क","ख","ग","घ","ङ","च","छ","ज","झ","ञ",
        "ट","ठ","ड","ढ","ण","त","थ","द","ध","न",
        "प","फ","ब","भ","म","य","र","ल","व","श",
        "ष","स","ह","ळ","क़","ख़","ग़","ज़","ड़","ढ़","फ़"
      ] },
      { label: "Signs", keys: ["ा","ि","ी","ु","ू","ृ","े","ै","ो","ौ","ॉ","ं","ः","ँ","्"] },
      { label: "Independent", keys: ["अ","आ","इ","ई","उ","ऊ","ऋ","ए","ऐ","ओ","औ","ऑ"] }
    ]
  },
  {
    id: "bengali", script: "Bengali", name: "Bengali", nativeName: "বাংলা", also: ["Assamese", "Bangla", "Meitei", "Bishnupriya"], speakers: 270, native: "অ",
    groups: [
      { label: "Letters", keys: [
        "ক","খ","গ","ঘ","ঙ","চ","ছ","জ","ঝ","ঞ",
        "ট","ঠ","ড","ঢ","ণ","ত","থ","দ","ধ","ন",
        "প","ফ","ব","ভ","ম","য","র","ল","শ","ষ",
        "স","হ","ড়","ঢ়","য়","ৎ"
      ] },
      { label: "Signs", keys: ["া","ি","ী","ু","ূ","ৃ","ে","ৈ","ো","ৌ","ং","ঃ","ঁ","্"] },
      { label: "Independent", keys: ["অ","আ","ই","ঈ","উ","ঊ","ঋ","এ","ঐ","ও","ঔ"] }
    ]
  },
  {
    id: "gurmukhi", script: "Gurmukhi", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", also: ["Gurmukhi"], speakers: 33, native: "ਅ",
    groups: [
      { label: "Letters", keys: [
        "ਕ","ਖ","ਗ","ਘ","ਙ","ਚ","ਛ","ਜ","ਝ","ਞ",
        "ਟ","ਠ","ਡ","ਢ","ਣ","ਤ","ਥ","ਦ","ਧ","ਨ",
        "ਪ","ਫ","ਬ","ਭ","ਮ","ਯ","ਰ","ਲ","ਵ","ੜ",
        "ਸ","ਹ","ਸ਼","ਖ਼","ਗ਼","ਜ਼","ਫ਼","ਲ਼"
      ] },
      { label: "Signs", keys: ["ਾ","ਿ","ੀ","ੁ","ੂ","ੇ","ੈ","ੋ","ੌ","ੰ","ਂ","ੱ","੍"] },
      { label: "Independent", keys: ["ਅ","ਆ","ਇ","ਈ","ਉ","ਊ","ਏ","ਐ","ਓ","ਔ"] }
    ]
  },
  {
    id: "gujarati", script: "Gujarati", name: "Gujarati", nativeName: "ગુજરાતી", also: ["Kutchi"], speakers: 62, native: "અ",
    groups: [
      { label: "Letters", keys: [
        "ક","ખ","ગ","ઘ","ઙ","ચ","છ","જ","ઝ","ઞ",
        "ટ","ઠ","ડ","ઢ","ણ","ત","થ","દ","ધ","ન",
        "પ","ફ","બ","ભ","મ","ય","ર","લ","વ","શ",
        "ષ","સ","હ","ળ"
      ] },
      { label: "Signs", keys: ["ા","િ","ી","ુ","ૂ","ૃ","ે","ૈ","ો","ૌ","ં","ઃ","ઁ","્"] },
      { label: "Independent", keys: ["અ","આ","ઇ","ઈ","ઉ","ઊ","ઋ","એ","ઐ","ઓ","ઔ"] }
    ]
  },
  {
    id: "oriya", script: "Oriya", name: "Odia", nativeName: "ଓଡ଼ିଆ", also: ["Oriya", "Santali"], speakers: 35, native: "ଅ",
    groups: [
      { label: "Letters", keys: [
        "କ","ଖ","ଗ","ଘ","ଙ","ଚ","ଛ","ଜ","ଝ","ଞ",
        "ଟ","ଠ","ଡ","ଢ","ଣ","ତ","ଥ","ଦ","ଧ","ନ",
        "ପ","ଫ","ବ","ଭ","ମ","ଯ","ର","ଲ","ଳ","ଶ",
        "ଷ","ସ","ହ","ୟ","ଡ଼","ଢ଼"
      ] },
      { label: "Signs", keys: ["ା","ି","ୀ","ୁ","ୂ","ୃ","େ","ୈ","ୋ","ୌ","ଂ","ଃ","ଁ","୍"] },
      { label: "Independent", keys: ["ଅ","ଆ","ଇ","ଈ","ଉ","ଊ","ଋ","ଏ","ଐ","ଓ","ଔ"] }
    ]
  },
  {
    id: "tamil", script: "Tamil", name: "Tamil", nativeName: "தமிழ்", also: [], speakers: 87, native: "அ",
    groups: [
      { label: "Letters", keys: [
        "க","ங","ச","ஞ","ட","ண","த","ந","ப","ம",
        "ய","ர","ல","வ","ழ","ள","ற","ன",
        "ஜ","ஷ","ஸ","ஹ","ஶ"
      ] },
      { label: "Signs", keys: ["ா","ி","ீ","ு","ூ","ெ","ே","ை","ொ","ோ","ௌ","்","ஃ"] },
      { label: "Independent", keys: ["அ","ஆ","இ","ஈ","உ","ஊ","எ","ஏ","ஐ","ஒ","ஓ","ஔ"] }
    ]
  },
  {
    id: "telugu", script: "Telugu", name: "Telugu", nativeName: "తెలుగు", also: [], speakers: 96, native: "అ",
    groups: [
      { label: "Letters", keys: [
        "క","ఖ","గ","ఘ","ఙ","చ","ఛ","జ","ఝ","ఞ",
        "ట","ఠ","డ","ఢ","ణ","త","థ","ద","ధ","న",
        "ప","ఫ","బ","భ","మ","య","ర","ల","వ","శ",
        "ష","స","హ","ళ","ఱ"
      ] },
      { label: "Signs", keys: ["ా","ి","ీ","ు","ూ","ృ","ె","ే","ై","ొ","ో","ౌ","ం","ః","్"] },
      { label: "Independent", keys: ["అ","ఆ","ఇ","ఈ","ఉ","ఊ","ఋ","ఎ","ఏ","ఐ","ఒ","ఓ","ఔ"] }
    ]
  },
  {
    id: "kannada", script: "Kannada", name: "Kannada", nativeName: "ಕನ್ನಡ", also: ["Tulu", "Konkani"], speakers: 59, native: "ಅ",
    groups: [
      { label: "Letters", keys: [
        "ಕ","ಖ","ಗ","ಘ","ಙ","ಚ","ಛ","ಜ","ಝ","ಞ",
        "ಟ","ಠ","ಡ","ಢ","ಣ","ತ","ಥ","ದ","ಧ","ನ",
        "ಪ","ಫ","ಬ","ಭ","ಮ","ಯ","ರ","ಲ","ವ","ಶ",
        "ಷ","ಸ","ಹ","ಳ","ೞ"
      ] },
      { label: "Signs", keys: ["ಾ","ಿ","ೀ","ು","ೂ","ೃ","ೆ","ೇ","ೈ","ೊ","ೋ","ೌ","ಂ","ಃ","್"] },
      { label: "Independent", keys: ["ಅ","ಆ","ಇ","ಈ","ಉ","ಊ","ಋ","ಎ","ಏ","ಐ","ಒ","ಓ","ಔ"] }
    ]
  },
  {
    id: "malayalam", script: "Malayalam", name: "Malayalam", nativeName: "മലയാളം", also: [], speakers: 36, native: "അ",
    groups: [
      { label: "Letters", keys: [
        "ക","ഖ","ഗ","ഘ","ങ","ച","ഛ","ജ","ഝ","ഞ",
        "ട","ഠ","ഡ","ഢ","ണ","ത","ഥ","ദ","ധ","ന",
        "പ","ഫ","ബ","ഭ","മ","യ","ര","ല","വ","ശ",
        "ഷ","സ","ഹ","ള","ഴ","റ","ൺ","ൻ","ർ","ൽ","ൾ"
      ] },
      { label: "Signs", keys: ["ാ","ി","ീ","ു","ൂ","ൃ","െ","േ","ൈ","ൊ","ോ","ൌ","ം","ഃ","്"] },
      { label: "Independent", keys: ["അ","ആ","ഇ","ഈ","ഉ","ഊ","ഋ","എ","ഏ","ഐ","ഒ","ഓ","ഔ"] }
    ]
  },
  {
    id: "sinhala", script: "Sinhala", name: "Sinhala", nativeName: "සිංහල", also: ["Sinhalese"], speakers: 17, native: "අ",
    groups: [
      { label: "Letters", keys: [
        "ක","ඛ","ග","ඝ","ච","ඡ","ජ","ඣ","ට","ඨ",
        "ඩ","ඪ","ණ","ත","ථ","ද","ධ","න","ප","ඵ",
        "බ","භ","ම","ය","ර","ල","ව","ශ","ෂ","ස",
        "හ","ළ","ෆ","ඟ","ඬ","ඳ","ඹ"
      ] },
      { label: "Signs", keys: ["ා","ැ","ෑ","ි","ී","ු","ූ","ෙ","ේ","ො","ෝ","ං","ඃ","්"] },
      { label: "Independent", keys: ["අ","ආ","ඇ","ඈ","ඉ","ඊ","උ","ඌ","එ","ඒ","ඔ","ඕ"] }
    ]
  },
  {
    id: "arabic", script: "Arabic", name: "Arabic", nativeName: "العربية", also: ["Urdu", "Persian", "Farsi", "Pashto", "Kurdish", "Sindhi", "Uyghur", "Dari"], speakers: 760, native: "\u0627\u0628", rtl: true,
    groups: [
      { label: "Letters", keys: [
        "ا","ب","ت","ث","ج","ح","خ","د","ذ","ر",
        "ز","س","ش","ص","ض","ط","ظ","ع","غ","ف",
        "ق","ك","ل","م","ن","ه","و","ي"
      ] },
      { label: "Forms", keys: ["أ","إ","آ","ء","ؤ","ئ","ى","ة","پ","چ","ژ","گ","ک","ی"] },
      { label: "Marks", keys: ["َ","ُ","ِ","ّ","ْ","ً","ٌ","ٍ"] }
    ]
  },
  {
    id: "hebrew", script: "Hebrew", name: "Hebrew", nativeName: "עברית", also: ["Yiddish"], speakers: 9, native: "א", rtl: true,
    groups: [
      { label: "Letters", keys: [
        "א","ב","ג","ד","ה","ו","ז","ח","ט","י",
        "כ","ל","מ","נ","ס","ע","פ","צ","ק","ר",
        "ש","ת"
      ] },
      { label: "Finals", keys: ["ך","ם","ן","ף","ץ"] }
    ]
  },
  {
    id: "thai", script: "Thai", name: "Thai", nativeName: "ไทย", also: ["Isan"], speakers: 71, native: "ก",
    groups: [
      { label: "Letters", keys: [
        "ก","ข","ค","ฆ","ง","จ","ฉ","ช","ซ","ฌ",
        "ญ","ฎ","ฏ","ฐ","ฑ","ฒ","ณ","ด","ต","ถ",
        "ท","ธ","น","บ","ป","ผ","ฝ","พ","ฟ","ภ",
        "ม","ย","ร","ล","ว","ศ","ษ","ส","ห","ฬ","อ","ฮ"
      ] },
      { label: "Vowels", keys: ["ะ","า","ิ","ี","ึ","ื","ุ","ู","เ","แ","โ","ใ","ไ","ำ","ั","ๆ"] },
      { label: "Tones", keys: ["่","้","๊","๋","์","ฺ"] }
    ]
  },
  {
    id: "lao", script: "Lao", name: "Lao", nativeName: "ລາວ", also: [], speakers: 30, native: "ກ",
    groups: [
      { label: "Letters", keys: [
        "ກ","ຂ","ຄ","ງ","ຈ","ສ","ຊ","ຍ","ດ","ຕ",
        "ຖ","ທ","ນ","ບ","ປ","ຜ","ຝ","ພ","ຟ","ມ",
        "ຢ","ຣ","ລ","ວ","ຫ","ອ","ຮ"
      ] },
      { label: "Vowels", keys: ["ະ","າ","ິ","ີ","ຶ","ື","ຸ","ູ","ເ","ແ","ໂ","ໃ","ໄ","ຳ","ັ"] },
      { label: "Tones", keys: ["່","້","໊","໋","໌"] }
    ]
  },
  {
    id: "khmer", script: "Khmer", name: "Khmer", nativeName: "ខ្មែរ", also: ["Cambodian"], speakers: 17, native: "ក",
    groups: [
      { label: "Letters", keys: [
        "ក","ខ","គ","ឃ","ង","ច","ឆ","ជ","ឈ","ញ",
        "ដ","ឋ","ឌ","ឍ","ណ","ត","ថ","ទ","ធ","ន",
        "ប","ផ","ព","ភ","ម","យ","រ","ល","វ","ស",
        "ហ","ឡ","អ"
      ] },
      { label: "Vowels", keys: ["ា","ិ","ី","ឹ","ឺ","ុ","ូ","ួ","ើ","ឿ","ៀ","េ","ែ","ៃ","ោ","ៅ"] },
      { label: "Signs", keys: ["ំ","ះ","៉","៊","់","័","៍","្"] }
    ]
  },
  {
    id: "myanmar", script: "Myanmar", name: "Burmese", nativeName: "မြန်မာ", also: ["Myanmar", "Shan", "Mon"], speakers: 43, native: "က",
    groups: [
      { label: "Letters", keys: [
        "က","ခ","ဂ","ဃ","င","စ","ဆ","ဇ","ဈ","ည",
        "ဋ","ဌ","ဍ","ဎ","ဏ","တ","ထ","ဒ","ဓ","န",
        "ပ","ဖ","ဗ","ဘ","မ","ယ","ရ","လ","ဝ","သ",
        "ဟ","ဠ","အ"
      ] },
      { label: "Signs", keys: ["ာ","ါ","ိ","ီ","ု","ူ","ေ","ဲ","ံ","့","း","္","်","ျ","ြ","ွ","ှ"] }
    ]
  },
  {
    id: "armenian", script: "Armenian", name: "Armenian", nativeName: "Հայերեն", also: [], speakers: 6, native: "Աա", caps: true,
    groups: [{ keys: [
      "ա","բ","գ","դ","ե","զ","է","ը","թ","ժ",
      "ի","լ","խ","ծ","կ","հ","ձ","ղ","ճ","մ",
      "յ","ն","շ","ո","չ","պ","ջ","ռ","ս","վ",
      "տ","ր","ց","ւ","փ","ք","օ","ֆ","և"
    ] }]
  },
  {
    id: "georgian", script: "Georgian", name: "Georgian", nativeName: "ქართული", also: [], speakers: 4, native: "ა",
    groups: [{ keys: [
      "ა","ბ","გ","დ","ე","ვ","ზ","თ","ი","კ",
      "ლ","მ","ნ","ო","პ","ჟ","რ","ს","ტ","უ",
      "ფ","ქ","ღ","ყ","შ","ჩ","ც","ძ","წ","ჭ",
      "ხ","ჯ","ჰ"
    ] }]
  },
  {
    id: "thaana", script: "Thaana", name: "Dhivehi", nativeName: "ދިވެހި", also: ["Maldivian", "Thaana"], speakers: 1, native: "ހ", rtl: true,
    groups: [
      { label: "Letters", keys: [
        "ހ","ށ","ނ","ރ","ބ","ޅ","ކ","އ","ވ","މ",
        "ފ","ދ","ތ","ލ","ގ","ޏ","ސ","ޑ","ޒ","ޓ",
        "ޔ","ޕ","ޖ","ޗ"
      ] },
      { label: "Vowels", keys: ["ަ","ާ","ި","ީ","ު","ޫ","ެ","ޭ","ޮ","ޯ","ް"] }
    ]
  },
  {
    id: "hiragana", script: "Hiragana", name: "Hiragana", nativeName: "ひらがな", also: ["Japanese", "Nihongo"], speakers: 125, native: "あ",
    groups: [
      { label: "Letters", keys: [
        "あ","い","う","え","お","か","き","く","け","こ",
        "さ","し","す","せ","そ","た","ち","つ","て","と",
        "な","に","ぬ","ね","の","は","ひ","ふ","へ","ほ",
        "ま","み","む","め","も","や","ゆ","よ",
        "ら","り","る","れ","ろ","わ","を","ん"
      ] },
      { label: "Voiced", keys: [
        "が","ぎ","ぐ","げ","ご","ざ","じ","ず","ぜ","ぞ",
        "だ","ぢ","づ","で","ど","ば","び","ぶ","べ","ぼ",
        "ぱ","ぴ","ぷ","ぺ","ぽ"
      ] },
      { label: "Small", keys: ["ゃ","ゅ","ょ","っ","ぁ","ぃ","ぅ","ぇ","ぉ","ー"] }
    ]
  },
  {
    id: "katakana", script: "Katakana", name: "Katakana", nativeName: "カタカナ", also: ["Japanese", "Nihongo"], speakers: 2, native: "ア",
    groups: [
      { label: "Letters", keys: [
        "ア","イ","ウ","エ","オ","カ","キ","ク","ケ","コ",
        "サ","シ","ス","セ","ソ","タ","チ","ツ","テ","ト",
        "ナ","ニ","ヌ","ネ","ノ","ハ","ヒ","フ","ヘ","ホ",
        "マ","ミ","ム","メ","モ","ヤ","ユ","ヨ",
        "ラ","リ","ル","レ","ロ","ワ","ヲ","ン"
      ] },
      { label: "Voiced", keys: [
        "ガ","ギ","グ","ゲ","ゴ","ザ","ジ","ズ","ゼ","ゾ",
        "ダ","ヂ","ヅ","デ","ド","バ","ビ","ブ","ベ","ボ",
        "パ","ピ","プ","ペ","ポ"
      ] },
      { label: "Small", keys: ["ャ","ュ","ョ","ッ","ァ","ィ","ゥ","ェ","ォ","ー"] }
    ]
  }
];

// Digits are Common script — neutral to the mixing rule, legal in a name,
// and on their own row rather than in any one alphabet's board, because
// `shop24` is the same two digits whichever alphabet the letters are in.
var NAME_KEYBOARD_DIGITS = ["0","1","2","3","4","5","6","7","8","9"];

// ── WHICH BOARD OPENS ───────────────────────────────────────────────────
//
// The country the account is registered in. Not the phone's locale: a
// Tamil speaker's phone is very often set to English, which is the whole
// reason this keyboard exists.
//
// Anything not listed opens Latin, which is a starting point rather than
// a claim about the country — every board is one tap away on the strip.
var NAME_KEYBOARD_BY_COUNTRY = {
  IN: "devanagari", NP: "devanagari",
  BD: "bengali",
  LK: "sinhala",
  TH: "thai", LA: "lao", KH: "khmer", MM: "myanmar",
  JP: "hiragana",
  IL: "hebrew",
  MV: "thaana",
  AM: "armenian", GE: "georgian",
  GR: "greek", CY: "greek",
  RU: "cyrillic", UA: "cyrillic", BY: "cyrillic", KZ: "cyrillic", KG: "cyrillic",
  TJ: "cyrillic", MK: "cyrillic", RS: "cyrillic", BG: "cyrillic", MN: "cyrillic",
  SA: "arabic", AE: "arabic", EG: "arabic", QA: "arabic", KW: "arabic", BH: "arabic",
  OM: "arabic", JO: "arabic", LB: "arabic", SY: "arabic", IQ: "arabic", YE: "arabic",
  LY: "arabic", DZ: "arabic", MA: "arabic", TN: "arabic", SD: "arabic", PS: "arabic",
  IR: "arabic", AF: "arabic", PK: "arabic"
};

function nameKeyboardDefaultId(countryIso) {
  const iso = String(countryIso || "").trim().toUpperCase();
  return (iso && NAME_KEYBOARD_BY_COUNTRY[iso]) || "latin";
}

// ── HOW MANY ALPHABETS FIT ON THE ROW ───────────────────────────────────
//
// Twenty-four chips do not. They used to all be on one scrolling strip,
// which meant the alphabet somebody needed was usually off-screen and
// they had to swipe a row of single letters hunting for it.
//
// Seven are shown and the rest are behind a search, which is the
// founder's call: "top 7 most speaking language as default list and keep
// rest with search bar".
var NAME_KEYBOARD_ROW = 7;

// The seven, in order, with two rules:
//
//   1. THE ACCOUNT'S OWN COUNTRY GOES FIRST, always, even when its
//      alphabet is nowhere near the top by speakers. A Lao account
//      opening a row of Hindi and Russian would be a row of seven wrong
//      answers, and Lao is thirty million people deep in a search.
//
//   2. The rest are ordered by how many people write in them. Not by how
//      many SPEAK the language — by how many write it in THIS alphabet,
//      which is a different number and the honest one here: Punjabi has
//      about 113 million speakers and roughly 33 million of them write
//      Gurmukhi, the rest writing Shahmukhi, which is the Arabic board.
//
// A board the person has actually CHOSEN is appended if it is not among
// the seven, rather than sorted into them — the row would otherwise
// reshuffle under a thumb the moment something was picked from search.
function nameKeyboardRow(countryIso, selectedId) {
  const out = [];
  const take = (layout, force) => {
    if (!layout || out.indexOf(layout) >= 0) return;
    if (!force && out.length >= NAME_KEYBOARD_ROW) return;
    out.push(layout);
  };
  take(nameKeyboardLayout(nameKeyboardDefaultId(countryIso)));
  const byUse = NAME_KEYBOARD_LAYOUTS.slice().sort(
    (a, b) => (b.speakers || 0) - (a.speakers || 0)
  );
  for (const layout of byUse) take(layout);
  take(nameKeyboardLayout(selectedId), true);
  return out;
}

// Does this board write that language? Matched against the name on the
// chip, the alphabet's own name, the language written in its own letters,
// and every other language the board writes — so "Spanish" finds the
// Latin board and "Urdu" finds the Arabic one, which is the entire point
// of a search over a list of alphabet names nobody knows.
function nameKeyboardMatches(layout, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [layout.name, layout.script, layout.nativeName, layout.id]
    .concat(Array.isArray(layout.also) ? layout.also : []);
  for (const value of hay) {
    if (String(value || "").toLowerCase().indexOf(q) >= 0) return true;
  }
  return false;
}

// The line under a language's name in the finder, or "" when there is
// nothing to put there.
//
// Both halves are earned rather than printed unconditionally, and a
// render is why. Printing the alphabet always gave twelve rows reading
// "Tamil / Tamil", "Greek / Greek" — a second line that repeats the
// first teaches nothing and makes the list twice as long to skim. And
// printing `also` unfiltered gave "Gurmukhi · also Gurmukhi", because
// the search list carries the alphabet's own name as a search term.
//
// So: the alphabet appears only when it is NOT what the language is
// called, and `also` lists only the languages not already on the row.
// The two deliberate omissions, and their common names, so the empty
// state can tell "not built yet, on purpose, and here is why" apart from
// "never heard of it".
var NAME_KEYBOARD_SOON = /chin|mandarin|cantonese|hanzi|kore|hangul|hanja/i;

function nameKeyboardSubline(layout) {
  const said = [String(layout.name || "").toLowerCase()];
  const bits = [];
  if (layout.script && String(layout.script).toLowerCase() !== said[0]) {
    bits.push(layout.script);
    said.push(String(layout.script).toLowerCase());
  }
  const also = (Array.isArray(layout.also) ? layout.also : [])
    .filter((x) => said.indexOf(String(x || "").toLowerCase()) < 0);
  // Three, not all seventeen. The row is one line and the point is "this
  // is the board for languages like yours", which three names make and a
  // clipped list of seventeen does not.
  if (also.length) bits.push(`also ${also.slice(0, 3).join(", ")}`);
  return bits.join(" · ");
}

function nameKeyboardLayout(id) {
  for (const layout of NAME_KEYBOARD_LAYOUTS) if (layout.id === id) return layout;
  return NAME_KEYBOARD_LAYOUTS[0];
}

// ── THE MIXING RULE, CLIENT SIDE ────────────────────────────────────────
//
// A deliberately thin mirror of the server's creatorScriptsIn. It exists
// to answer ONE question — "would this keystroke put two alphabets in one
// part?" — and it is not, and must not become, the authority. The server
// still checks; this only moves the answer earlier.
//
// Written against the same script names, so a board whose `script` the
// server would reject cannot pass here either.
var NAME_SCRIPT_TESTS = (function () {
  const out = [];
  for (const layout of NAME_KEYBOARD_LAYOUTS) {
    try {
      out.push([layout.script, new RegExp(`\\p{Script=${layout.script}}`, "u")]);
    } catch (e) {
      // A browser without Unicode property escapes drops the entry. The
      // rule then permits more than the server does and the server says
      // no — the right way round for a check that is only an early
      // warning. Never the reverse.
    }
  }
  return out;
})();

var NAME_SCRIPT_NEUTRAL = (function () {
  try {
    return /[\p{Script=Common}\p{Script=Inherited}]/u;
  } catch (e) {
    return null;
  }
})();

// The alphabets present in a string, as a plain array. Digits, and the
// combining marks that belong to whatever precedes them, count as
// neutral — exactly as they do on the server.
function nameScriptsIn(value) {
  if (!NAME_SCRIPT_NEUTRAL || !NAME_SCRIPT_TESTS.length) return [];
  const found = [];
  for (const ch of String(value || "")) {
    if (NAME_SCRIPT_NEUTRAL.test(ch)) continue;
    for (const [script, re] of NAME_SCRIPT_TESTS) {
      if (re.test(ch)) {
        if (found.indexOf(script) < 0) found.push(script);
        break;
      }
    }
  }
  return found;
}

// Japanese writes kana and Han together and Korean writes Hangul with
// Han, so those pairs are one alphabet for this rule. Same sets as the
// server's CREATOR_SCRIPT_SETS.
var NAME_SCRIPT_SETS = [["Han", "Hiragana", "Katakana"], ["Han", "Hangul"]];

function nameScriptsAgree(scripts) {
  // DE-DUPLICATED FIRST, and a render is why this comment exists. The
  // server builds a Set and so is given ["Devanagari"] once however many
  // Devanagari letters it counted. This took an array, and the conflict
  // banner below asks it about ["Devanagari", "Devanagari"] — which went
  // straight past the length check and came back "these disagree",
  // telling somebody typing रसोई on the Devanagari board that Devanagari
  // was the wrong alphabet for it.
  const list = [];
  for (const s of Array.isArray(scripts) ? scripts : []) {
    if (s && list.indexOf(s) < 0) list.push(s);
  }
  if (list.length <= 1) return true;
  return NAME_SCRIPT_SETS.some((set) => list.every((s) => set.indexOf(s) >= 0));
}

// Would adding this character to this text break the one-alphabet rule?
// Returns the alphabet already in the box, or "" when the key is fine.
function nameKeyBlockedBy(text, ch) {
  const after = nameScriptsIn(String(text || "") + String(ch || ""));
  if (nameScriptsAgree(after)) return "";
  const before = nameScriptsIn(text);
  return before.length ? before[0] : "";
}

// ── ONE KEY ─────────────────────────────────────────────────────────────
//
// A combining mark drawn on its own is a mark floating over nothing, and
// in several fonts it renders on top of the key's own edge. Drawn after a
// dotted circle (U+25CC) it renders where it will actually appear — which
// is the convention every real Indic keyboard uses, and the difference
// between a legible key and a smudge.
var NAME_KEY_DOTTED_CIRCLE = "◌";

function nameKeyFace(ch) {
  if (!NAME_SCRIPT_NEUTRAL) return ch;
  try {
    // A lone combining mark: category Mn/Mc, which is exactly the set
    // that needs a base to sit on.
    if (/^\p{Mn}$|^\p{Mc}$/u.test(ch)) return NAME_KEY_DOTTED_CIRCLE + ch;
  } catch (e) {
    return ch;
  }
  return ch;
}

function NameKey({ ch, onPress, blocked, cols = 10 }) {
  return <KbTap
    onTap={() => onPress(ch)}
    label={ch}
    disabled={blocked}
    pressedStyle={{ background: T.accentSoft, color: T.accent, transform: "translateY(1px)", boxShadow: "none" }}
    style={{
      // Sized to the widest row on THIS board, so a twelve-key Cyrillic
      // row and a nine-key Greek one each fill the width with keys of
      // one size, the way their real keyboards do.
      flex: `0 0 calc((100% - ${(cols - 1) * 4}px) / ${cols})`,
      minWidth: 0,
      height: 40,
      border: "none",
      borderRadius: 9,
      background: blocked ? "transparent" : T.surface,
      boxShadow: blocked ? "none" : "0 1px 2px rgba(20,18,43,0.10)",
      color: blocked ? T.inkFaint : T.ink,
      opacity: blocked ? 0.3 : 1,
      fontSize: 18,
      fontWeight: 600,
      fontFamily: "inherit",
      lineHeight: 1,
      padding: 0,
      cursor: blocked ? "default" : "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // A key is a picture of the character it types. Letting a long
      // press select its text puts a selection handle over the keyboard.
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none",
      touchAction: "manipulation",
      transition: "background 0.08s ease, transform 0.08s ease"
    }}
  >{nameKeyFace(ch)}</KbTap>;
}

// ── A TAP, NOT A TOUCH ──────────────────────────────────────────────────
//
// Every key used to act on pointerdown. That is fast, and it is also why
// "when I scroll it selects text": a finger that lands on a key to SCROLL
// the board typed that key the instant it touched, and a finger resting
// to scroll the language row switched the alphabet. So now a key acts on
// RELEASE, and only if the finger did not travel — more than 10px of
// movement, or the browser taking the gesture over as a scroll
// (pointercancel), and the press is dropped.
//
// preventDefault on pointerdown stays: it keeps the caret in the box being
// typed into. It does not stop a scroll — touch-action allows panning.
//
// `repeat` is for backspace: held, it deletes again after 420ms and then
// every 70ms, the way a phone's does.
var NAME_KB_SLOP = 10;

function KbTap({ onTap, repeat = false, disabled = false, label, pressed: ariaPressed, style, pressedStyle, children, dataOn }) {
  const g = useRef33(null);
  const [down, setDown] = useState58(false);
  // The LATEST handler, for the repeat timer. Backspace's handler closes
  // over the text as it was when the key went down; calling that one from
  // an interval deleted the same letter over and over — one letter gone
  // after a long hold, which a render caught.
  const tap = useRef33(onTap);
  tap.current = onTap;
  const stop = () => {
    const cur = g.current;
    if (cur) { clearTimeout(cur.t); clearInterval(cur.i); }
    g.current = null;
    setDown(false);
  };
  useEffect54(() => stop, []);
  return <button
    type="button"
    aria-label={label}
    aria-pressed={ariaPressed}
    data-kb-on={dataOn}
    disabled={disabled}
    onPointerDown={(e) => {
      e.preventDefault();
      if (disabled) return;
      const cur = { x: e.clientX, y: e.clientY, id: e.pointerId, fired: false, t: 0, i: 0 };
      if (repeat) {
        cur.t = setTimeout(() => {
          cur.fired = true;
          tap.current();
          cur.i = setInterval(() => tap.current(), 70);
        }, 420);
      }
      g.current = cur;
      setDown(true);
    }}
    onPointerMove={(e) => {
      const cur = g.current;
      if (cur && cur.id === e.pointerId && Math.hypot(e.clientX - cur.x, e.clientY - cur.y) > NAME_KB_SLOP) stop();
    }}
    onPointerUp={(e) => {
      const cur = g.current;
      if (cur && cur.id === e.pointerId && !cur.fired) onTap();
      stop();
    }}
    onPointerCancel={stop}
    onPointerLeave={stop}
    // A long press on a key must not open the phone's text-selection or
    // "copy / look up" menu over the board.
    onContextMenu={(e) => e.preventDefault()}
    style={{ ...style, ...(down && pressedStyle ? pressedStyle : {}) }}
  >{children}</button>;
}

// Backspace and shift, drawn rather than borrowed. Lucide's Delete is a
// tag with a small x in it, which at 17px read as "a cross" — the founder's
// word — rather than "delete the last letter". This is the ⌫ shape every
// phone keyboard uses, at a size meant for a thumb.
function KbBackspaceGlyph({ color, size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path
    d="M9.2 5h10.3A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9.2a1.5 1.5 0 0 1-1.1-.5L3 12l5.1-6.5A1.5 1.5 0 0 1 9.2 5Z"
    stroke={color} strokeWidth="1.9" strokeLinejoin="round"
  /><path d="m11.6 9.4 5.2 5.2m0-5.2-5.2 5.2" stroke={color} strokeWidth="1.9" strokeLinecap="round" /></svg>;
}

function KbShiftGlyph({ color, on, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path
    d="M12 3.6 3.6 12.3h4.6v7.1a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1v-7.1h4.6L12 3.6Z"
    fill={on ? color : "none"} stroke={color} strokeWidth="1.9" strokeLinejoin="round"
  /></svg>;
}

// ── THE BOARD ───────────────────────────────────────────────────────────
//
// Fixed to the bottom of the screen, above everything, with the two
// halves of the name shown along its top so the half being typed can be
// switched without reaching back up to the input. On a phone the inputs
// are usually hidden behind the board once it opens; a keyboard that
// cannot show you what you are typing is the oldest bug in the form.
function CreatorNameKeyboard({
  open,
  field = "first",
  onField,
  first = "",
  last = "",
  onFirst,
  onLast,
  countryIso = "",
  twoParts = true,
  firstLabel = "First name",
  lastLabel = "Last name",
  onClose
}) {
  const [layoutId, setLayoutId] = useState58(() => nameKeyboardDefaultId(countryIso));
  const [shift, setShift] = useState58(false);
  // The language finder, over the board rather than inside it — see
  // NameKeyboardLanguages for why it cannot live in this panel.
  const [searching, setSearching] = useState58(false);

  // The country arrives after the account loads, which is usually AFTER
  // this mounts. Re-deriving on a country change rather than only at
  // mount is the difference between an Indian account opening Devanagari
  // and opening Latin because the profile had not landed yet.
  useEffect54(() => {
    setLayoutId(nameKeyboardDefaultId(countryIso));
  }, [countryIso]);

  // The floating map button is fixed at z-index 10000, 62% down the right
  // edge — which is squarely on top of this board. It hides itself for
  // anything that fires this, and a keyboard is as blocking as it gets.
  //
  // Fired from inside the keyboard rather than from each of the three
  // screens that mount it, so a fourth one cannot forget.
  useEffect54(() => {
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(
      new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } })
    );
    fire(Boolean(open));
    return () => fire(false);
  }, [open]);

  const layout = useMemo15(() => nameKeyboardLayout(layoutId), [layoutId]);
  const row = useMemo15(() => nameKeyboardRow(countryIso, layoutId), [countryIso, layoutId]);
  const value = field === "last" ? last : first;
  const setValue = field === "last" ? onLast : onFirst;
  const strip = useRef33(null);

  // ── THE CHOSEN ALPHABET HAS TO BE ON SCREEN ───────────────────────────
  //
  // Twenty-four chips do not fit a phone, so the strip scrolls — and a
  // board chosen FOR somebody by their country can therefore open
  // selected and out of sight. A render caught exactly that: Hiragana
  // picked for a Japanese account sits past the right edge, so the strip
  // reads as though Latin were still selected.
  useEffect54(() => {
    const host = strip.current;
    if (!host || typeof host.querySelector !== "function") return;
    const chip = host.querySelector('[data-kb-on="1"]');
    if (chip && typeof chip.scrollIntoView === "function") {
      try {
        chip.scrollIntoView({ block: "nearest", inline: "center" });
      } catch (e) {
        // Older WebKit takes no options object and scrolls the page
        // instead. A chip that cannot be scrolled to is a cosmetic loss,
        // never a reason to take the keyboard down.
      }
    }
  }, [layoutId, open]);

  // The alphabet already in the OTHER half is irrelevant: the rule is per
  // part. `rasoi.घर` is two alphabets and perfectly legal.
  const locked = useMemo15(() => {
    const scripts = nameScriptsIn(value);
    return scripts.length === 1 ? scripts[0] : "";
  }, [value]);

  // ── A BOARD WHOSE EVERY KEY IS DEAD ───────────────────────────────────
  //
  // Found by rendering, and it was bad: with रसोई in the box, opening the
  // Arabic board greyed out all forty-two keys and the only explanation
  // was one line of 10px text at the very bottom of the panel. Somebody
  // taps a letter, nothing happens, and the reason is six hundred pixels
  // away from the thing that did nothing.
  //
  // So when the chosen board cannot type into this half AT ALL, say so
  // where the dead keys are — and offer the only thing that helps, which
  // is emptying the half so the new alphabet can start.
  const conflict = Boolean(locked && !nameScriptsAgree([locked, layout.script]));

  if (!open) return null;

  const type = (ch) => {
    const out = shift && layout.caps ? ch.toUpperCase() : ch;
    if (nameKeyBlockedBy(value, out)) return;
    setValue && setValue(value + out);
    // Shift is a one-shot, as it is on every phone keyboard: a name is
    // Rasoi, not RASOI, and caps lock is a thing somebody turns on by
    // accident and then cannot see.
    if (shift) setShift(false);
  };

  const backspace = () => {
    // Sliced by code point, so one tap removes one character the person
    // would count as one — not half a surrogate pair.
    const chars = Array.from(value);
    chars.pop();
    setValue && setValue(chars.join(""));
  };

  const chipFor = (which, text, label) => <KbTap
    onTap={() => onField && onField(which)}
    label={`Type the ${label}`}
    pressed={field === which}
    style={{
      flex: 1, minWidth: 0, border: "none", borderRadius: 10,
      background: field === which ? T.accentSoft : "transparent",
      padding: "7px 9px", cursor: "pointer", textAlign: "left",
      fontFamily: "inherit", overflow: "hidden"
    }}
  ><span style={{
    display: "block", fontSize: 9, fontWeight: 800, letterSpacing: 0.4,
    textTransform: "uppercase", color: field === which ? T.accent : T.inkFaint
  }}>{label}</span><span style={{
    display: "block", fontSize: 14, fontWeight: 700, marginTop: 1,
    color: text ? T.ink : T.inkFaint,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{text || "—"}</span></KbTap>;

  return <div
    role="group"
    aria-label="Gloobal keyboard"
    style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      // Above every full-screen sheet in the app, including the creator
      // setup screen at 420 — the board is mounted inside those screens
      // and has to clear the tallest of them.
      zIndex: 430,
      background: T.bgSoft || T.bg,
      borderTop: `1px solid ${T.line}`,
      boxShadow: "0 -8px 28px rgba(20,18,43,0.16)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      display: "flex", flexDirection: "column",
      // Nothing on the board is text to select — not the labels, not the
      // language names, not the name shown back. A long press while
      // scrolling used to drop selection handles over the keys.
      userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",
      WebkitTapHighlightColor: "transparent"
    }}
    onContextMenu={(e) => e.preventDefault()}
  >{
    /* The name, as it stands, with the half being typed lit. Tapping the
       other half moves the board to it — which is the only way to reach
       it once the board covers the inputs. */
  }<div style={{
    display: "flex", alignItems: "center", gap: 4, padding: "8px 10px 6px",
    borderBottom: `1px solid ${T.line}`
  }}>{chipFor("first", first, firstLabel)}{twoParts ? <><span aria-hidden="true" style={{
    fontSize: 18, fontWeight: 900, color: T.accent, flexShrink: 0, padding: "0 2px"
  }}>.</span>{chipFor("last", last, lastLabel)}</> : null}{
    /* ── HIDE, NOT A GREY CROSS ───────────────────────────────────────
       It was a 32px grey ✕ in a grey circle, which reads as "cancel" or
       "delete the name". What it does is put the board away and keep
       everything typed — so it says that: a chevron down and the word,
       the way a phone's own keyboard offers it. */
  }<KbTap
    onTap={() => onClose && onClose()}
    label="Hide the Gloobal keyboard"
    pressedStyle={{ background: T.accentSoft }}
    style={{
      flexShrink: 0, height: 36, borderRadius: 999, border: "none", padding: "0 11px 0 8px",
      background: T.surface, boxShadow: "0 1px 3px rgba(20,18,43,0.12)", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 4, marginLeft: 4,
      fontSize: 12, fontWeight: 800, color: T.inkSoft, fontFamily: "inherit"
    }}
  ><ChevronDown6 size={17} color={T.inkSoft} />Hide</KbTap></div>{
    /* ── THE ALPHABET ROW ─────────────────────────────────────────────
       Seven boards, each as its own letter with the LANGUAGE under it.
       The letter alone was a row of single glyphs — অ, અ, ଅ, அ — which
       is only legible to somebody who already reads that one, and the
       whole point is to reach an alphabet your phone cannot write.

       The one in use is filled rather than outlined, because an outline
       on a row of outlines is not a state anybody sees.

       The row scrolls; the SEARCH DOES NOT. It is pinned outside the
       scrolling part, at the right corner, so the way to the other
       seventeen is in the same place whatever the row is showing. */
  }<div style={{
    display: "flex", alignItems: "stretch", gap: 6, padding: "7px 10px",
    borderBottom: `1px solid ${T.line}`
  }}><div ref={strip} style={{
    flex: 1, minWidth: 0, display: "flex", gap: 6, overflowX: "auto",
    scrollbarWidth: "none", WebkitOverflowScrolling: "touch"
  }}>{row.map((l) => <KbTap
    key={l.id}
    dataOn={l.id === layoutId ? "1" : "0"}
    onTap={() => { setLayoutId(l.id); setShift(false); }}
    label={`${l.name}, written in ${l.script}`}
    pressed={l.id === layoutId}
    style={{
      flex: "0 0 auto", minWidth: 42, borderRadius: 10,
      border: "none",
      background: l.id === layoutId ? T.accent : T.surface,
      color: l.id === layoutId ? "#fff" : T.inkSoft,
      boxShadow: l.id === layoutId ? "none" : "0 1px 2px rgba(20,18,43,0.08)",
      fontFamily: "inherit", cursor: "pointer",
      padding: "5px 9px 4px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1
    }}
  ><span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>{l.native}</span><span style={{
    fontSize: 8.5, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0.1,
    // Never clipped: a name cut to "Malayal" identifies nothing. The
    // chip widens to its own word instead, which is why the row scrolls.
    whiteSpace: "nowrap",
    opacity: l.id === layoutId ? 0.92 : 0.75
  }}>{l.name}</span></KbTap>)}</div><KbTap
    onTap={() => setSearching(true)}
    label="Find another language"
    style={{
      // Accent-tinted rather than the grey surface the chips sit on. A
      // render showed it reading as a disabled chip at the end of the
      // row — which is the opposite of what it is, the way to the other
      // seventeen alphabets.
      flexShrink: 0, width: 44, borderRadius: 10, border: "none",
      background: T.accentSoft, cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2
    }}
  ><Search8 size={14} color={T.accent} /><span style={{
    fontSize: 8.5, fontWeight: 800, color: T.accent, lineHeight: 1.1
  }}>More</span></KbTap></div>{
    /* ── THE KEYS ─────────────────────────────────────────────────────
       Capped at 34% of the screen and scrolled beyond that. An abugida
       board is genuinely tall, and a keyboard that grows past half the
       screen hides the thing it is typing into. */
  }<div style={{
    maxHeight: "34vh", overflowY: "auto", WebkitOverflowScrolling: "touch",
    padding: "8px 10px 6px"
  }}>{conflict ? <div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 9,
    background: T.surface, borderRadius: 12, padding: "10px 11px",
    boxShadow: "0 1px 3px rgba(20,18,43,0.10)"
  }}><span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45 }}>
    This part is already written in {locked}, and a part is written in one alphabet.
  </span><KbTap
    onTap={() => setValue && setValue("")}
    label={`Clear the ${field === "last" ? lastLabel : firstLabel} and start again`}
    style={{
      flexShrink: 0, border: "none", borderRadius: 9, background: T.accentSoft,
      color: T.accent, fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
      padding: "8px 11px", cursor: "pointer"
    }}
  >Clear it</KbTap></div> : null}{layout.groups.map((group, gi) => <div key={gi} style={{ marginTop: gi ? 9 : 0 }}>{
    group.label ? <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
      color: T.inkFaint, margin: "0 2px 5px"
    }}>{group.label}</div> : null
  }{(() => {
    // A group is either rows — a real keyboard's staggered shape — or a
    // flat set that flows ten to a line. Both end up as lines of keys;
    // only the width and the alignment differ.
    const lines = group.rows || [group.keys];
    const cols = group.rows
      ? lines.reduce((n, row) => Math.max(n, row.length), 1)
      : 10;
    return lines.map((row, ri) => <div key={ri} style={{
      display: "flex", flexWrap: "wrap", gap: 4,
      marginTop: ri ? 4 : 0,
      // Short rows sit centred under long ones, which is what a phone
      // keyboard does and what stops `zxcvbnm` hugging one edge.
      justifyContent: group.rows ? "center" : "flex-start",
      direction: layout.rtl ? "rtl" : "ltr"
    }}>{row.map((ch, i) => {
      const out = shift && layout.caps ? ch.toUpperCase() : ch;
      return <NameKey key={`${ch}-${i}`} ch={out} cols={cols} onPress={type} blocked={Boolean(nameKeyBlockedBy(value, out))} />;
    })}</div>);
  })()}</div>)}<div style={{ marginTop: 9 }}><div style={{
    fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
    color: T.inkFaint, margin: "0 2px 5px"
  }}>Numbers</div><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{
    NAME_KEYBOARD_DIGITS.map((d) => <NameKey key={d} ch={d} onPress={type} blocked={false} />)
  }</div></div></div>{
    /* ── THE BOTTOM BAR ───────────────────────────────────────────────
       No space bar and no dot key: the server refuses both, and the dot
       between the halves is drawn by the screen rather than typed. What
       is left is shift, backspace and done. */
  }<div style={{
    display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 10px"
  }}>{layout.caps ? <KbTap
    onTap={() => setShift((v) => !v)}
    label={shift ? "Capital letter on" : "Capital letter"}
    pressed={shift}
    pressedStyle={{ transform: "translateY(1px)" }}
    style={{
      // ⇧, filled when on — the state is the shape, not a colour alone.
      flex: "0 0 50px", height: 44, borderRadius: 12, border: "none",
      background: shift ? T.accent : T.surface,
      boxShadow: shift ? "0 4px 10px rgba(124,58,237,0.3)" : "0 1px 2px rgba(20,18,43,0.12)",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><KbShiftGlyph color={shift ? "#fff" : T.ink} on={shift} /></KbTap> : null}<KbTap
    onTap={backspace}
    repeat
    label="Delete the last letter"
    disabled={!value}
    pressedStyle={{ background: T.accentSoft, transform: "translateY(1px)" }}
    style={{
      flex: "0 0 62px", height: 44, borderRadius: 12, border: "none", background: T.surface,
      boxShadow: "0 1px 2px rgba(20,18,43,0.12)", cursor: value ? "pointer" : "default",
      opacity: value ? 1 : 0.4,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><KbBackspaceGlyph color={T.ink} /></KbTap>{
    /* The half being typed, under the keys as well as above them. The
       chips at the top leave a thumb's field of view once the keys have
       it, and this is exactly where somebody is already looking. */
  }<span aria-hidden="true" style={{
    flex: 1, minWidth: 0, textAlign: "center", fontSize: 15, fontWeight: 700,
    color: value ? T.ink : T.inkFaint,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{value || "\u2026"}</span>{
    /* ── NEXT, THEN DONE ──────────────────────────────────────────────
       On the first part of a two-part name the key goes FORWARD — to the
       second part — rather than closing the board halfway through a name.
       On the second part (or a one-part name) it is Done. */
    twoParts && field !== "last"
      ? <KbTap
        onTap={() => onField && onField("last")}
        label={`Next: ${lastLabel}`}
        pressedStyle={{ transform: "translateY(1px)", filter: "brightness(0.95)" }}
        style={{
          flex: "0 0 92px", height: 44, borderRadius: 12, border: "none",
          background: T.accentSoft, color: T.accent, cursor: "pointer",
          fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6
        }}
      >Next<ArrowRight3 size={17} color={T.accent} strokeWidth={2.4} /></KbTap>
      : <KbTap
        onTap={() => onClose && onClose()}
        label="Done"
        pressedStyle={{ transform: "translateY(1px)", filter: "brightness(0.95)" }}
        style={{
          flex: "0 0 92px", height: 44, borderRadius: 12, border: "none",
          background: T.gradButton, color: "#fff", cursor: "pointer",
          boxShadow: "0 4px 12px rgba(124,58,237,0.3)",
          fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6
        }}
      ><Check11 size={16} color="#fff" strokeWidth={2.8} />Done</KbTap>
  }</div>{
    /* The rule, said at the moment it starts to apply rather than after
       the whole name is typed. It only appears once a half HAS an
       alphabet, so it reads as information about what you wrote rather
       than a warning about what you might. */
  }{locked && !conflict ? <div style={{
    fontSize: 10, fontWeight: 600, color: T.inkFaint, textAlign: "center",
    padding: "0 14px 8px", lineHeight: 1.45
  }}>This part is in {locked}. Each part of a name is written in one alphabet — clear it to switch.</div> : null}{
    searching ? <NameKeyboardLanguages
      selectedId={layoutId}
      onPick={(id) => { setLayoutId(id); setShift(false); setSearching(false); }}
      onClose={() => setSearching(false)}
    /> : null
  }</div>;
}

// ── THE OTHER SEVENTEEN ─────────────────────────────────────────────────
//
// A full screen rather than a panel inside the keyboard, for one hard
// reason: this is the one place in the whole feature that WANTS the
// phone's own keyboard. You type "Spanish" here, in Latin letters, to
// reach a board that is not Latin. Opening the device keyboard over a
// panel that is itself pinned to the bottom of the screen leaves about an
// inch to show results in.
//
// Searched by LANGUAGE, not by alphabet. "Urdu" finds the Arabic board;
// "Spanish" finds the Latin one; "Punjabi" finds Gurmukhi. A list of
// alphabet names would be a list most people cannot search, because
// almost nobody knows what their own alphabet is called — which is the
// same reason the chips gained names in the first place.
function NameKeyboardLanguages({ selectedId, onPick, onClose }) {
  const [query, setQuery] = useState58("");
  const found = useMemo15(
    () => NAME_KEYBOARD_LAYOUTS.filter((l) => nameKeyboardMatches(l, query)),
    [query]
  );

  return <div style={{
    position: "fixed", inset: 0, zIndex: 440, background: T.bg,
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}><div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay
  }}>Languages</span></div>

  <div style={{ padding: "0 18px 10px", flexShrink: 0 }}><div style={{
    display: "flex", alignItems: "center", gap: 10, background: T.surface,
    border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "12px 14px",
    boxShadow: T.shadowCard
  }}><Search8 size={16} color={T.inkFaint} /><input
    id="name-keyboard-language-search"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Hindi, Urdu, Spanish…"
    aria-label="Search for a language"
    autoComplete="off"
    autoCapitalize="none"
    autoCorrect="off"
    spellCheck={false}
    style={{
      flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
      fontSize: 13.5, color: T.ink, fontFamily: "inherit"
    }}
  />{query ? <button
    type="button"
    onClick={() => setQuery("")}
    aria-label="Clear"
    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex" }}
  ><X14 size={14} color={T.inkFaint} /></button> : null}</div></div>

  <div style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
    padding: "4px 18px 30px"
  }}>{found.length ? <div style={{
    borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden"
  }}>{found.map((l, i) => <button
    key={l.id}
    type="button"
    onClick={() => onPick && onPick(l.id)}
    aria-label={`Type in ${l.name}`}
    aria-pressed={l.id === selectedId}
    className="v2-row"
    style={{
      width: "100%", display: "flex", alignItems: "center", gap: 13,
      padding: "11px 14px", border: "none", cursor: "pointer", textAlign: "left",
      background: l.id === selectedId ? T.accentSoft : "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`, fontFamily: "inherit"
    }}
  ><span style={{
    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
    background: l.id === selectedId ? T.accent : T.surfaceAlt,
    color: l.id === selectedId ? "#fff" : T.inkSoft,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 15, fontWeight: 700
  }}>{l.native}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{l.name}{
    /* The language in its own letters, beside the English name. It is
       the line somebody recognises when the English one means nothing
       to them, and it costs one field. */
    l.nativeName && l.nativeName !== l.name
      ? <span style={{ fontWeight: 600, color: T.inkFaint }}>{"  ·  " + l.nativeName}</span>
      : null
  }</span>{
    /* What else this board writes, named rather than counted. "also
       Spanish, French, Portuguese" is why a Spanish speaker trusts a row
       labelled English; "17 more" is not. Absent entirely where there is
       nothing to add — see nameKeyboardSubline. */
    nameKeyboardSubline(l) ? <span style={{
      display: "block", fontSize: 10.5, fontWeight: 600, color: T.inkFaint, marginTop: 2,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{nameKeyboardSubline(l)}</span> : null
  }</span>{l.id === selectedId ? <Check11 size={15} color={T.accent} /> : null}</button>)}</div> : <div style={{
    background: T.surface, borderRadius: T.radiusLg, padding: "26px 18px",
    textAlign: "center", boxShadow: T.shadowCard
  }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>No alphabet for that yet</div><div style={{
    fontSize: 11.5, color: T.inkFaint, marginTop: 5, lineHeight: 1.5
  }}>{
    /* The two that are missing ON PURPOSE get the reason; everything else
       gets the plain answer. Telling somebody who searched for Tibetan
       about Chinese input methods is a non-sequitur dressed as help. */
    NAME_KEYBOARD_SOON.test(query)
      ? "Chinese and Korean need a typing system rather than a grid of keys \u2014 you pick a character from a sound, or letters combine into blocks \u2014 and a half-built one writes names that look right and compare wrong. They are coming. Your phone's own keyboard still works for them today."
      : "This board is for alphabets a phone often cannot write, and that one is not on it yet. Your phone's own keyboard still works here."
  }</div></div>}</div></div>;
}

// The little button that opens the board, to sit beside a name box.
//
// Opening a keyboard is a CHOICE, not the default: somebody whose phone
// already types their alphabet should keep using the keyboard they know,
// with its own muscle memory and its own autocorrect settings. This is
// for the far more common case of a phone that cannot.
function NameKeyboardButton({ onOpen, active = false, label = "Gloobal keyboard" }) {
  return <button
    type="button"
    onClick={onOpen}
    aria-label={label}
    aria-pressed={active}
    className="v2-tap"
    style={{
      flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: "none",
      background: active ? T.accent : "transparent",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 0
    }}
  ><Keyboard size={16} color={active ? "#fff" : T.inkFaint} /></button>;
}
