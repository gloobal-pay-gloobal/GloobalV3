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
import { Delete as Delete2, ArrowUp as ArrowUp2, Check as Check11, X as X14, Keyboard } from "lucide-react";

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
    id: "latin", script: "Latin", name: "Latin", native: "Aa", caps: true,
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
    id: "cyrillic", script: "Cyrillic", name: "Cyrillic", native: "Аб", caps: true,
    groups: [{ rows: [
      ["й","ц","у","к","е","н","г","ш","щ","з","х","ъ"],
      ["ф","ы","в","а","п","р","о","л","д","ж","э"],
      ["я","ч","с","м","и","т","ь","б","ю","ё"]
    ] }, { label: "Also", keys: ["і","ї","є","ґ","ў","ќ","љ","њ","џ","ђ","ћ","ј"] }]
  },
  {
    id: "greek", script: "Greek", name: "Greek", native: "Αα", caps: true,
    groups: [{ rows: [
      ["ς","ε","ρ","τ","υ","θ","ι","ο","π"],
      ["α","σ","δ","φ","γ","η","ξ","κ","λ"],
      ["ζ","χ","ψ","ω","β","ν","μ"]
    ] }, { label: "Accents", keys: ["ά","έ","ή","ί","ό","ύ","ώ","ϊ","ϋ","ΐ","ΰ"] }]
  },
  {
    id: "devanagari", script: "Devanagari", name: "Devanagari", native: "अ",
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
    id: "bengali", script: "Bengali", name: "Bengali", native: "অ",
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
    id: "gurmukhi", script: "Gurmukhi", name: "Gurmukhi", native: "ਅ",
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
    id: "gujarati", script: "Gujarati", name: "Gujarati", native: "અ",
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
    id: "oriya", script: "Oriya", name: "Odia", native: "ଅ",
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
    id: "tamil", script: "Tamil", name: "Tamil", native: "அ",
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
    id: "telugu", script: "Telugu", name: "Telugu", native: "అ",
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
    id: "kannada", script: "Kannada", name: "Kannada", native: "ಅ",
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
    id: "malayalam", script: "Malayalam", name: "Malayalam", native: "അ",
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
    id: "sinhala", script: "Sinhala", name: "Sinhala", native: "අ",
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
    id: "arabic", script: "Arabic", name: "Arabic", native: "\u0627\u0628", rtl: true,
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
    id: "hebrew", script: "Hebrew", name: "Hebrew", native: "א", rtl: true,
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
    id: "thai", script: "Thai", name: "Thai", native: "ก",
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
    id: "lao", script: "Lao", name: "Lao", native: "ກ",
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
    id: "khmer", script: "Khmer", name: "Khmer", native: "ក",
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
    id: "myanmar", script: "Myanmar", name: "Myanmar", native: "က",
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
    id: "armenian", script: "Armenian", name: "Armenian", native: "Աա", caps: true,
    groups: [{ keys: [
      "ա","բ","գ","դ","ե","զ","է","ը","թ","ժ",
      "ի","լ","խ","ծ","կ","հ","ձ","ղ","ճ","մ",
      "յ","ն","շ","ո","չ","պ","ջ","ռ","ս","վ",
      "տ","ր","ց","ւ","փ","ք","օ","ֆ","և"
    ] }]
  },
  {
    id: "georgian", script: "Georgian", name: "Georgian", native: "ა",
    groups: [{ keys: [
      "ა","ბ","გ","დ","ე","ვ","ზ","თ","ი","კ",
      "ლ","მ","ნ","ო","პ","ჟ","რ","ს","ტ","უ",
      "ფ","ქ","ღ","ყ","შ","ჩ","ც","ძ","წ","ჭ",
      "ხ","ჯ","ჰ"
    ] }]
  },
  {
    id: "thaana", script: "Thaana", name: "Thaana", native: "ހ", rtl: true,
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
    id: "hiragana", script: "Hiragana", name: "Hiragana", native: "あ",
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
    id: "katakana", script: "Katakana", name: "Katakana", native: "ア",
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
  return <button
    type="button"
    // onPointerDown rather than onClick: a key has to repeat quickly, and
    // waiting for the click that follows a touch costs about 300ms on
    // some Android browsers. preventDefault keeps focus where it is, so
    // the box being typed into does not lose its caret to the key.
    onPointerDown={(e) => { e.preventDefault(); onPress(ch); }}
    aria-label={ch}
    disabled={blocked}
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
      touchAction: "manipulation"
    }}
  >{nameKeyFace(ch)}</button>;
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

  const chipFor = (which, text, label) => <button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); onField && onField(which); }}
    aria-label={`Type the ${label}`}
    aria-pressed={field === which}
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
  }}>{text || "—"}</span></button>;

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
      display: "flex", flexDirection: "column"
    }}
  >{
    /* The name, as it stands, with the half being typed lit. Tapping the
       other half moves the board to it — which is the only way to reach
       it once the board covers the inputs. */
  }<div style={{
    display: "flex", alignItems: "center", gap: 4, padding: "8px 10px 6px",
    borderBottom: `1px solid ${T.line}`
  }}>{chipFor("first", first, firstLabel)}{twoParts ? <><span aria-hidden="true" style={{
    fontSize: 18, fontWeight: 900, color: T.accent, flexShrink: 0, padding: "0 2px"
  }}>.</span>{chipFor("last", last, lastLabel)}</> : null}<button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); onClose && onClose(); }}
    aria-label="Close the Gloobal keyboard"
    style={{
      flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: "none",
      background: T.surface, boxShadow: T.shadowCard, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 2
    }}
  ><X14 size={14} color={T.inkFaint} /></button></div>{
    /* ── THE ALPHABET STRIP ───────────────────────────────────────────
       Every board, written in its own letters, scrolling horizontally.
       The one in use is filled rather than outlined, because an outline
       on a strip of outlines is not a state anybody sees. */
  }<div ref={strip} style={{
    display: "flex", gap: 6, overflowX: "auto", padding: "7px 10px",
    scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
    borderBottom: `1px solid ${T.line}`
  }}>{NAME_KEYBOARD_LAYOUTS.map((l) => <button
    key={l.id}
    type="button"
    data-kb-on={l.id === layoutId ? "1" : "0"}
    onPointerDown={(e) => { e.preventDefault(); setLayoutId(l.id); setShift(false); }}
    aria-label={l.name}
    aria-pressed={l.id === layoutId}
    title={l.name}
    style={{
      flex: "0 0 auto", minWidth: 36, height: 30, borderRadius: 9,
      border: "none",
      background: l.id === layoutId ? T.accent : T.surface,
      color: l.id === layoutId ? "#fff" : T.inkSoft,
      boxShadow: l.id === layoutId ? "none" : "0 1px 2px rgba(20,18,43,0.08)",
      fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
      padding: "0 9px", display: "flex", alignItems: "center", justifyContent: "center"
    }}
  >{l.native}</button>)}</div>{
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
  </span><button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); setValue && setValue(""); }}
    aria-label={`Clear the ${field === "last" ? lastLabel : firstLabel} and start again`}
    style={{
      flexShrink: 0, border: "none", borderRadius: 9, background: T.accentSoft,
      color: T.accent, fontSize: 11.5, fontWeight: 800, fontFamily: "inherit",
      padding: "8px 11px", cursor: "pointer"
    }}
  >Clear it</button></div> : null}{layout.groups.map((group, gi) => <div key={gi} style={{ marginTop: gi ? 9 : 0 }}>{
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
    display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 9px"
  }}>{layout.caps ? <button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); setShift((s) => !s); }}
    aria-label="Capital letter"
    aria-pressed={shift}
    style={{
      flex: "0 0 52px", height: 40, borderRadius: 10, border: "none",
      background: shift ? T.accent : T.surface,
      boxShadow: shift ? "none" : "0 1px 2px rgba(20,18,43,0.10)",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><ArrowUp2 size={16} color={shift ? "#fff" : T.inkSoft} /></button> : null}<button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); backspace(); }}
    aria-label="Backspace"
    disabled={!value}
    style={{
      // A key, not a bar. Stretched across the whole row it stopped
      // reading as something to press — which a render showed plainly.
      flex: "0 0 68px", height: 40, borderRadius: 10, border: "none", background: T.surface,
      boxShadow: "0 1px 2px rgba(20,18,43,0.10)", cursor: value ? "pointer" : "default",
      opacity: value ? 1 : 0.4,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Delete2 size={17} color={T.inkSoft} /></button>{
    /* The half being typed, under the keys as well as above them. The
       chips at the top leave a thumb's field of view once the keys have
       it, and the space the backspace was wrongly filling is exactly
       where somebody is already looking. */
  }<span aria-hidden="true" style={{
    flex: 1, minWidth: 0, textAlign: "center", fontSize: 15, fontWeight: 700,
    color: value ? T.ink : T.inkFaint,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{value || "\u2026"}</span><button
    type="button"
    onPointerDown={(e) => { e.preventDefault(); onClose && onClose(); }}
    aria-label="Done"
    style={{
      flex: "0 0 86px", height: 40, borderRadius: 10, border: "none",
      background: T.gradButton, color: "#fff", cursor: "pointer",
      fontSize: 13, fontWeight: 800, fontFamily: "inherit",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6
    }}
  ><Check11 size={14} color="#fff" />Done</button></div>{
    /* The rule, said at the moment it starts to apply rather than after
       the whole name is typed. It only appears once a half HAS an
       alphabet, so it reads as information about what you wrote rather
       than a warning about what you might. */
  }{locked && !conflict ? <div style={{
    fontSize: 10, fontWeight: 600, color: T.inkFaint, textAlign: "center",
    padding: "0 14px 8px", lineHeight: 1.45
  }}>This part is in {locked}. Each part of a name is written in one alphabet — clear it to switch.</div> : null}</div>;
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
