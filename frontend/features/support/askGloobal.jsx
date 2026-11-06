// src/features/support/askGloobal.jsx
import { useState as useState88, useEffect as useEffect84, useRef as useRef47, useMemo as useMemo21 } from "react";
//
// ── ASK GLOOBAL (0223) ─────────────────────────────────────────────────────
//
// Questions about how GLOOBAL works, answered in the language they are asked
// in — English, हिन्दी, Hinglish, தமிழ், and (0252) 18 more as packs — from the guide the team writes on
// the staff site. No AI service: the cards come from GET /api/guide once,
// stay on the phone, and askEngine.js finds the answer as the person types.
//
// Ways in (0238): Help & Support → "Ask GLOOBAL", the app map, and the
// Profile list. Each opens it full screen, with a greeting, topics and the
// questions people ask most. The small "?" that sat in the header of Send,
// GLOOBAL Bank, My Essentials and My shop is gone, at the founder's ask.
// A "Give feedback" in the page's header (and on its first screen) lets
// anyone say how it is working — anonymous, like everything counted here.
//
// An answer comes in steps, with the screen it is about one tap away, read
// aloud by the phone's own voice if wanted, and — for withdrawing to a bank —
// shown on the real screen, step by step ("Show me": it points, it never
// taps or moves money).
//
// It never sees a balance or a payment. A question about the person's own
// money is spotted (askIsPersonal) and handed to a person on the Support desk,
// with the question filled in. What is counted for the team is anonymous;
// see server/lib/guide.js.

var ASK_LANG_NAMES = { en: "English", hi: "हिन्दी", hl: "Hinglish", ta: "தமிழ்", bn: "বাংলা", te: "తెలుగు", mr: "मराठी", gu: "ગુજરાતી", kn: "ಕನ್ನಡ", ml: "മലയാളം", pa: "ਪੰਜਾਬੀ", ur: "اردو", ar: "العربية", es: "Español", fr: "Français", pt: "Português", de: "Deutsch", id: "Bahasa Indonesia", ru: "Русский", zh: "中文", ja: "日本語", ko: "한국어" };
var ASK_VOICE = { en: "en-IN", hi: "hi-IN", hl: "en-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-PK", ar: "ar-SA", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE", id: "id-ID", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };
var ASK_HEAR = { ...ASK_VOICE, hl: "hi-IN" };
function askDir(l) { return l === "ar" || l === "ur" ? "rtl" : "ltr"; }
var ASK_POPULAR = ["send-how", "bank-withdraw", "send-abroad", "geu-what", "essentials-what", "account-hold"];
var ASK_TILES = [
  ["send", "#6D3AE8", "M5 19L19 5M9 5h10v10"],
  ["bank", "#3B6EF5", "M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"],
  ["essentials", "#0FA372", "M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z"],
  ["shop", "#D98A00", "M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2"],
  ["geu", "#6D3AE8", "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"],
  ["account", "#6B6580", "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c1-4 4-6 8-6s7 2 8 6"],
];
var ASK_SCREEN_NAMES = {
  send: "Send", bank: "GLOOBAL Bank", essentials: "My Essentials", myshop: "My shop", history: "History", receive: "Receive",
  scan: "Scanner", complaints: "Complaints & reports", security: "Security", referral: "Referrals", notifications: "Notifications", help: "Chat with us",
};
// Which Support desk topic a question lands under when handed to a person.
var ASK_DESK_TOPIC = { send: "payment", receive: "payment", bank: "bank", essentials: "essentials", shop: "shop", account: "account", geu: "other", help: "other" };

var ASK_UI = {
  en: {
    sub: "Answers from the GLOOBAL guide", hello: "Hello! Ask anything about GLOOBAL", helloSub: "Write or speak in your own language — the answer comes back in it.",
    placeholder: "Type your question…", more: "Ask something else…", ask: "Ask", popular: "People often ask", maybe: "Did you mean",
    helped: "Did this help?", yes: "Yes", no: "No", thanks: "Thanks — that helps us make the guide better.",
    sorry: "Sorry about that. Ask another way, or a person can help.", askAgain: "Ask again", talk: "Talk to a person", talkTeam: "Talk to the team",
    showMe: "Show me", listen: "Listen", stop: "Stop", readIn: "Read in:", which: "Which of these do you mean?", noneOfThese: "None of these — talk to a person",
    nothing: "I couldn't find that in the guide.", nothingSub: "Try other words, pick a topic, or a person can help.",
    otherLang: "We don't have answers in your language yet — here is the closest in English.",
    personalTitle: "This is about your own money", personalBody: "Ask GLOOBAL can't see your payments or balance. A person from the team can — they will look and answer you in Help & Support.",
    meanwhile: "While you wait, you can check this yourself", talkNote: "Your question goes with it. You pick the payment there.",
    never: "Ask GLOOBAL never sees your balance or payments", voiceNote: "Voice typing uses your phone browser's speech service.",
    loading: "Loading answers…", offline: "Couldn't load the answers. Check your connection and try again.", retry: "Try again",
    from: "From the guide", open: "Open {x}", tourNext: "Next", tourDone: "Got it", tourClose: "Close", tourStep: "Step {n} of {m}",
    noVoice: "This phone has no voice for this language.", listening: "Listening…", lang: "Language", close: "Close",
    topic_send: "Sending money", topic_bank: "GLOOBAL Bank", topic_essentials: "My Essentials", topic_shop: "My shop", topic_geu: "What is GEU", topic_account: "My account", topic_receive: "Receiving money", topic_help: "Help",
    screen_send: "Questions about Send", screen_bank: "Questions about GLOOBAL Bank", screen_essentials: "Questions about My Essentials", screen_shop: "Questions about My shop",
    helpBoxTitle: "Ask GLOOBAL", helpBoxSub: "Ask how anything in GLOOBAL works, in your own language. Answers in seconds.",
    fbOpen: "Give feedback", fbHome: "Help us make Ask GLOOBAL better", fbTitle: "How is Ask GLOOBAL working for you?", fbGood: "Good", fbOk: "Okay", fbBad: "Not good", fbPlaceholder: "What should we add or fix? (optional)", fbNote: "Anonymous. Numbers and emails are removed before it is kept.", fbSend: "Send feedback", fbThanks: "Thank you! The team reads every one.",
    qButton: "Questions about this screen",
  },
  hi: {
    sub: "GLOOBAL गाइड से जवाब", hello: "नमस्ते! GLOOBAL के बारे में कुछ भी पूछें", helloSub: "अपनी भाषा में लिखें या बोलें — जवाब उसी भाषा में मिलेगा।",
    placeholder: "अपना सवाल लिखें…", more: "कुछ और पूछें…", ask: "पूछें", popular: "लोग अक्सर पूछते हैं", maybe: "क्या आपका मतलब",
    helped: "क्या इससे मदद मिली?", yes: "हाँ", no: "नहीं", thanks: "धन्यवाद — इससे हम गाइड को बेहतर बनाते हैं।",
    sorry: "माफ़ कीजिए। दूसरे शब्दों में पूछें, या हमारी टीम से बात करें।", askAgain: "फिर से पूछें", talk: "किसी व्यक्ति से बात करें", talkTeam: "टीम से बात करें",
    showMe: "स्क्रीन पर दिखाओ", listen: "सुनें", stop: "रोकें", readIn: "पढ़ें:", which: "आप इनमें से क्या पूछ रहे हैं?", noneOfThese: "इनमें से कोई नहीं — किसी व्यक्ति से बात करें",
    nothing: "यह गाइड में नहीं मिला।", nothingSub: "दूसरे शब्दों में पूछें, कोई विषय चुनें, या टीम से बात करें।",
    otherLang: "आपकी भाषा में अभी जवाब नहीं हैं — सबसे करीबी जवाब अंग्रेज़ी में है।",
    personalTitle: "यह आपके अपने पैसों की बात है", personalBody: "Ask GLOOBAL आपके पेमेंट या बैलेंस नहीं देख सकता। हमारी टीम देख सकती है — वे जाँचकर Help & Support में जवाब देंगे।",
    meanwhile: "तब तक आप खुद यह जाँच सकते हैं", talkNote: "आपका सवाल साथ जाएगा। पेमेंट आप वहाँ चुनेंगे।",
    never: "Ask GLOOBAL आपका बैलेंस या पेमेंट नहीं देखता", voiceNote: "बोलकर लिखने में आपके फ़ोन ब्राउज़र की आवाज़ सेवा इस्तेमाल होती है।",
    loading: "जवाब लोड हो रहे हैं…", offline: "जवाब लोड नहीं हो सके। इंटरनेट जाँचकर फिर कोशिश करें।", retry: "फिर कोशिश करें",
    from: "गाइड से", open: "{x} खोलें", tourNext: "आगे", tourDone: "समझ गया", tourClose: "बंद करें", tourStep: "स्टेप {n} / {m}",
    noVoice: "इस फ़ोन पर इस भाषा की आवाज़ नहीं है।", listening: "सुन रहे हैं…", lang: "भाषा", close: "बंद करें",
    topic_send: "पैसे भेजना", topic_bank: "GLOOBAL Bank", topic_essentials: "My Essentials", topic_shop: "My shop", topic_geu: "GEU क्या है", topic_account: "मेरा खाता", topic_receive: "पैसे पाना", topic_help: "मदद",
    screen_send: "Send के बारे में सवाल", screen_bank: "GLOOBAL Bank के बारे में सवाल", screen_essentials: "My Essentials के बारे में सवाल", screen_shop: "My shop के बारे में सवाल",
    helpBoxTitle: "Ask GLOOBAL", helpBoxSub: "GLOOBAL में कुछ भी कैसे काम करता है, अपनी भाषा में पूछें। जवाब तुरंत।",
    fbOpen: "सुझाव दें", fbHome: "Ask GLOOBAL को बेहतर बनाने में मदद करें", fbTitle: "Ask GLOOBAL आपके लिए कैसा है?", fbGood: "अच्छा", fbOk: "ठीक", fbBad: "अच्छा नहीं", fbPlaceholder: "हम क्या जोड़ें या सुधारें? (वैकल्पिक)", fbNote: "बिना नाम के। रखने से पहले नंबर और ईमेल हटा दिए जाते हैं।", fbSend: "सुझाव भेजें", fbThanks: "धन्यवाद! टीम हर सुझाव पढ़ती है।",
    qButton: "इस स्क्रीन के बारे में सवाल",
  },
  hl: {
    sub: "GLOOBAL guide se jawab", hello: "Namaste! GLOOBAL ke baare mein kuch bhi poochiye", helloSub: "Apni bhasha mein likhiye ya boliye — jawab usi bhasha mein milega.",
    placeholder: "Apna sawaal likhiye…", more: "Aur kuch poochiye…", ask: "Poochiye", popular: "Log aksar poochte hain", maybe: "Kya aapka matlab",
    helped: "Madad mili?", yes: "Haan", no: "Nahi", thanks: "Shukriya — isse hum guide ko behtar banate hain.",
    sorry: "Maaf kijiye. Dusre shabdon mein poochiye, ya team se baat kariye.", askAgain: "Phir poochiye", talk: "Kisi insaan se baat kariye", talkTeam: "Team se baat karein",
    showMe: "Screen par dikhao", listen: "Suniye", stop: "Rokiye", readIn: "Padhein:", which: "Aap inmein se kya pooch rahe hain?", noneOfThese: "Inmein se koi nahi — kisi insaan se baat kariye",
    nothing: "Ye guide mein nahi mila.", nothingSub: "Dusre shabdon mein poochiye, koi topic chuniye, ya team se baat kariye.",
    otherLang: "Aapki bhasha mein abhi jawab nahi hain — sabse kareeb wala English mein hai.",
    personalTitle: "Ye aapke apne paison ki baat hai", personalBody: "Ask GLOOBAL aapke payments ya balance nahi dekh sakta. Hamari team dekh sakti hai — woh check karke Help & Support mein jawab degi.",
    meanwhile: "Tab tak aap khud ye check kar sakte hain", talkNote: "Aapka sawaal saath jayega. Payment aap wahan chunenge.",
    never: "Ask GLOOBAL aapka balance ya payments nahi dekhta", voiceNote: "Bolkar likhne mein aapke phone browser ki speech service use hoti hai.",
    loading: "Jawab load ho rahe hain…", offline: "Jawab load nahi ho paaye. Internet check karke phir try kariye.", retry: "Phir try kariye",
    from: "Guide se", open: "{x} kholiye", tourNext: "Aage", tourDone: "Samajh gaya", tourClose: "Band karein", tourStep: "Step {n} / {m}",
    noVoice: "Is phone par is bhasha ki awaaz nahi hai.", listening: "Sun rahe hain…", lang: "Bhasha", close: "Band karein",
    topic_send: "Paise bhejna", topic_bank: "GLOOBAL Bank", topic_essentials: "My Essentials", topic_shop: "My shop", topic_geu: "GEU kya hai", topic_account: "Mera account", topic_receive: "Paise paana", topic_help: "Madad",
    screen_send: "Send ke baare mein sawaal", screen_bank: "GLOOBAL Bank ke baare mein sawaal", screen_essentials: "My Essentials ke baare mein sawaal", screen_shop: "My shop ke baare mein sawaal",
    helpBoxTitle: "Ask GLOOBAL", helpBoxSub: "GLOOBAL mein kuch bhi kaise kaam karta hai, apni bhasha mein poochiye. Jawab turant.",
    fbOpen: "Feedback do", fbHome: "Ask GLOOBAL ko behtar banane mein madad karo", fbTitle: "Ask GLOOBAL aapko kaisa laga?", fbGood: "Accha", fbOk: "Theek", fbBad: "Accha nahi", fbPlaceholder: "Kya jodein ya sudhaarein? (zaroori nahi)", fbNote: "Bina naam ke. Rakhne se pehle number aur email hata diye jaate hain.", fbSend: "Feedback bhejo", fbThanks: "Shukriya! Team har feedback padhti hai.",
    qButton: "Is screen ke baare mein sawaal",
  },
  ta: {
    sub: "GLOOBAL வழிகாட்டியிலிருந்து பதில்கள்", hello: "வணக்கம்! GLOOBAL பற்றி எதையும் கேளுங்கள்", helloSub: "உங்கள் மொழியில் எழுதுங்கள் அல்லது பேசுங்கள் — பதிலும் அதே மொழியில் வரும்.",
    placeholder: "உங்கள் கேள்வியை எழுதுங்கள்…", more: "வேறு ஏதாவது கேளுங்கள்…", ask: "கேள்", popular: "அடிக்கடி கேட்கப்படுபவை", maybe: "நீங்கள் கேட்பது",
    helped: "இது உதவியதா?", yes: "ஆம்", no: "இல்லை", thanks: "நன்றி — இது வழிகாட்டியை மேம்படுத்த உதவும்.",
    sorry: "மன்னிக்கவும். வேறு வார்த்தைகளில் கேளுங்கள், அல்லது ஒருவரிடம் பேசுங்கள்.", askAgain: "மீண்டும் கேள்", talk: "ஒருவரிடம் பேசுங்கள்", talkTeam: "குழுவிடம் பேசுங்கள்",
    showMe: "திரையில் காட்டு", listen: "ஒலியாகக் கேள்", stop: "நிறுத்து", readIn: "படிக்க:", which: "இவற்றில் எதைக் கேட்கிறீர்கள்?", noneOfThese: "எதுவும் இல்லை — ஒருவரிடம் பேசுங்கள்",
    nothing: "இது வழிகாட்டியில் இல்லை.", nothingSub: "வேறு வார்த்தைகளில் கேளுங்கள், ஒரு தலைப்பைத் தேர்வு செய்யுங்கள், அல்லது ஒருவரிடம் பேசுங்கள்.",
    otherLang: "உங்கள் மொழியில் இன்னும் பதில்கள் இல்லை — நெருக்கமானது ஆங்கிலத்தில்.",
    personalTitle: "இது உங்கள் சொந்தப் பணம் பற்றியது", personalBody: "Ask GLOOBAL உங்கள் பரிவர்த்தனைகளையோ இருப்பையோ பார்க்க முடியாது. எங்கள் குழு பார்க்க முடியும் — சரிபார்த்து Help & Support-இல் பதில் சொல்வார்கள்.",
    meanwhile: "அதுவரை நீங்களே இதைச் சரிபார்க்கலாம்", talkNote: "உங்கள் கேள்வியும் உடன் செல்லும். பரிவர்த்தனையை அங்கே தேர்வு செய்வீர்கள்.",
    never: "Ask GLOOBAL உங்கள் இருப்பையோ பரிவர்த்தனைகளையோ பார்க்காது", voiceNote: "பேசி எழுத உங்கள் phone browser-இன் பேச்சு சேவை பயன்படுகிறது.",
    loading: "பதில்கள் ஏற்றப்படுகின்றன…", offline: "பதில்களை ஏற்ற முடியவில்லை. இணையத்தைச் சரிபார்த்து மீண்டும் முயலுங்கள்.", retry: "மீண்டும் முயல்",
    from: "வழிகாட்டியிலிருந்து", open: "{x} திற", tourNext: "அடுத்து", tourDone: "புரிந்தது", tourClose: "மூடு", tourStep: "படி {n} / {m}",
    noVoice: "இந்த phone-இல் இந்த மொழிக்குக் குரல் இல்லை.", listening: "கேட்கிறது…", lang: "மொழி", close: "மூடு",
    topic_send: "பணம் அனுப்புதல்", topic_bank: "GLOOBAL Bank", topic_essentials: "My Essentials", topic_shop: "My shop", topic_geu: "GEU என்றால் என்ன", topic_account: "என் கணக்கு", topic_receive: "பணம் பெறுதல்", topic_help: "உதவி",
    screen_send: "Send பற்றிய கேள்விகள்", screen_bank: "GLOOBAL Bank பற்றிய கேள்விகள்", screen_essentials: "My Essentials பற்றிய கேள்விகள்", screen_shop: "My shop பற்றிய கேள்விகள்",
    helpBoxTitle: "Ask GLOOBAL", helpBoxSub: "GLOOBAL-இல் எது எப்படி வேலை செய்கிறது என்று உங்கள் மொழியில் கேளுங்கள். உடனே பதில்.",
    fbOpen: "கருத்து தெரிவிக்க", fbHome: "Ask GLOOBAL-ஐ மேம்படுத்த உதவுங்கள்", fbTitle: "Ask GLOOBAL உங்களுக்கு எப்படி இருக்கிறது?", fbGood: "நன்று", fbOk: "பரவாயில்லை", fbBad: "நன்றாக இல்லை", fbPlaceholder: "எதைச் சேர்க்க அல்லது சரிசெய்ய வேண்டும்? (விருப்பம்)", fbNote: "பெயர் இல்லாமல். சேமிக்கும் முன் எண்களும் மின்னஞ்சல்களும் நீக்கப்படும்.", fbSend: "கருத்தை அனுப்பு", fbThanks: "நன்றி! குழு ஒவ்வொன்றையும் படிக்கிறது.",
    qButton: "இந்தத் திரை பற்றிய கேள்விகள்",
  },
};

// "Show me": point at the real screen, step by step. `sel` finds the thing
// to point at; a step without one is said in the middle of the screen.
var ASK_TOURS = {
  "bank-withdraw": {
    target: "bank",
    steps: [
      { sel: '[data-testid="bank-money-actions"]', t: { en: "Your bank's money buttons are here.", hi: "आपके बैंक के पैसे वाले बटन यहाँ हैं।", hl: "Aapke bank ke paise wale buttons yahan hain.", ta: "உங்கள் வங்கியின் பணப் பொத்தான்கள் இங்கே உள்ளன." } },
      { sel: '[data-guide="bank-send"]', t: { en: "Tap **Send to bank** to start.", hi: "शुरू करने के लिए **Send to bank** दबाएँ।", hl: "Shuru karne ke liye **Send to bank** dabaiye.", ta: "தொடங்க **Send to bank** அழுத்துங்கள்." } },
      { sel: null, t: { en: "Then type the amount, pick your bank, tap **Continue** and confirm with your PIN. It shows **Processing** until your bank confirms.", hi: "फिर रकम लिखें, अपना बैंक चुनें, **Continue** दबाएँ और PIN से पक्का करें। बैंक की पुष्टि तक **Processing** दिखेगा।", hl: "Phir amount likhiye, apna bank chuniye, **Continue** dabaiye aur PIN se confirm kariye. Bank confirm kare tab tak **Processing** dikhega.", ta: "பிறகு தொகையை எழுதி, உங்கள் வங்கியைத் தேர்வு செய்து, **Continue** அழுத்தி PIN மூலம் உறுதிசெய்யுங்கள். வங்கி உறுதி செய்யும் வரை **Processing** என்று காட்டும்." } },
    ],
    missing: { en: "The **Send to bank** button shows on this screen once your GLOOBAL Bank account is open.", hi: "आपका GLOOBAL Bank खाता खुलने के बाद **Send to bank** बटन इसी स्क्रीन पर दिखता है।", hl: "Aapka GLOOBAL Bank account khulne ke baad **Send to bank** button isi screen par dikhta hai.", ta: "உங்கள் GLOOBAL Bank கணக்கு திறந்தவுடன் **Send to bank** பொத்தான் இந்தத் திரையில் தெரியும்." },
  },
};

function askT(lang, key, vars) {
  let s = (ASK_UI[lang] && ASK_UI[lang][key]) || ASK_UI.en[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, vars[k]);
  return s;
}
function askStartLang() {
  try { const saved = localStorage.getItem("gloobal.askLang"); if (ASK_LANG_NAMES[saved]) return saved; } catch (e) { /* private mode */ }
  const nav = (typeof navigator !== "undefined" && navigator.language || "").toLowerCase().slice(0, 2);
  return nav !== "hl" && ASK_LANG_NAMES[nav] ? nav : "en";
}
function askCardIn(card, lang) {
  const l = card && card.t && card.t[lang] ? lang : "en";
  return { lang: l, ...(card && card.t ? card.t[l] || {} : {}) };
}

// ── the guide, on the phone ──
// `extra` is the one pack language this phone holds beside the core four ("" = none).
var askGuide = { version: null, cards: null, index: null, pending: null, fresh: false, extra: "", want: null };
function askUseCards(cards, version, extra, pack) {
  // The pack's words first: the index below is built with them.
  askUsePack(pack);
  if (extra && pack && pack.ui) ASK_UI[extra] = pack.ui;
  if (extra && pack && pack.tours) {
    for (const [id, t] of Object.entries(pack.tours)) {
      const tour = ASK_TOURS[id];
      if (!tour || !t) continue;
      (t.steps || []).forEach((line, i) => { if (tour.steps[i]) tour.steps[i].t[extra] = line; });
      if (t.missing) tour.missing[extra] = t.missing;
    }
  }
  askGuide.cards = cards;
  askGuide.version = version;
  askGuide.extra = extra || "";
  askGuide.index = askBuildIndex(cards);
}
function askLoadGuide(extraWanted) {
  let kept = null;
  if (!askGuide.index) {
    try {
      const raw = localStorage.getItem("gloobal.guide.v1");
      kept = raw ? JSON.parse(raw) : null;
      if (kept && Array.isArray(kept.cards) && kept.cards.length) askUseCards(kept.cards, kept.version, kept.extra || "", kept.pack || null);
    } catch (e) { /* nothing kept */ }
  }
  // Asked for nothing in particular, it keeps what it has (or the chosen language).
  const startLang = askStartLang();
  const want = extraWanted !== undefined ? extraWanted : (askGuide.index ? askGuide.extra : (askIsCore(startLang) ? "" : startLang));
  if (askGuide.index && askGuide.fresh && askGuide.extra === want) return Promise.resolve(askGuide);
  if (askGuide.pending && askGuide.want === want) return askGuide.pending;
  askGuide.want = want;
  const have = askGuide.index && askGuide.extra === want ? askGuide.version : null;
  const pending = GloobalApi.getGuide(have, want).then((r) => {
    if (askGuide.want !== want) return askGuide;
    if (r && r.cards) {
      askUseCards(r.cards, r.version, want, r.pack || null);
      try { localStorage.setItem("gloobal.guide.v1", JSON.stringify({ version: r.version, cards: r.cards, extra: want, pack: r.pack || null })); } catch (e) { /* full */ }
    }
    if (r) askGuide.fresh = true;
    return askGuide.index ? askGuide : null;
  }).catch(() => (askGuide.index ? askGuide : null)).finally(() => { if (askGuide.pending === pending) askGuide.pending = null; });
  askGuide.pending = pending;
  // What the phone already has answers at once; the fresh copy follows. A new
  // language has to be waited for.
  return askGuide.index && askGuide.extra === want ? Promise.resolve(askGuide) : pending;
}

// ── what the team gets to see: anonymous, batched ──
var askQueue = [];
var askFlushTimer = null;
function askLog(e) {
  askQueue.push(e);
  if (askFlushTimer) return;
  askFlushTimer = setTimeout(() => {
    askFlushTimer = null;
    while (askQueue.length) GloobalApi.logGuideEvents(askQueue.splice(0, 5));
  }, 1500);
}

// ── the phone's own voice ──
function askSpeak(text, lang, onEnd) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const want = ASK_VOICE[lang] || "en-IN";
    const voices = synth.getVoices() || [];
    const voice = voices.find((v) => v.lang === want) || voices.find((v) => v.lang && v.lang.slice(0, 2) === want.slice(0, 2));
    if (!voice && voices.length && !["en", "hi", "hl"].includes(lang)) return false;
    const u = new SpeechSynthesisUtterance(askSpoken(text, lang));
    u.lang = want;
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = onEnd; u.onerror = onEnd;
    synth.speak(u);
    return true;
  } catch (e) { return false; }
}
function askStopSpeaking() { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* nothing playing */ } }
function askHearing() { return typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition || null : null; }

// **bold** inside an answer.
function AskRich({ text }) {
  return <>{String(text || "").split("**").map((part, i) => (i % 2 ? <b key={i} style={{ fontWeight: 800, color: T.ink }}>{part}</b> : <span key={i}>{part}</span>))}</>;
}

function AskIcon({ d, color, size = 16, fill }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || "none"} stroke={fill ? "none" : color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
var ASK_SPARK = "M12 2l2.2 6.3L21 10l-6.8 1.9L12 18l-2.2-6.1L3 10l6.8-1.7z";
var ASK_MIC = "M9 5a3 3 0 016 0v6a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3";
var ASK_SPEAKER = "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M19 6a8 8 0 010 12";

// The small ? in a screen's top corner. It opens the questions about that
// screen over it; the screen keeps what was typed.
function AskPill({ on, onClick, children, testid }) {
  return <button type="button" data-testid={testid} onClick={onClick} style={{ border: `1.5px solid ${on ? T.accent : T.line}`, background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.inkSoft, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>{children}</button>;
}

// One answer: the steps, what to do next, and "did this help?".
function AskAnswer({ card, lang, onGo, onShowMe, onTalk, onAgain, question, screen }) {
  const [shown, setShown] = useState88(card.t[lang] ? lang : "en");
  const [said, setSaid] = useState88(null);
  const [speaking, setSpeaking] = useState88(false);
  const [voiceNote, setVoiceNote] = useState88(false);
  const x = askCardIn(card, shown);
  const langs = ASK_LANG_CODES.filter((l) => card.t[l]);
  const tour = card.tour && ASK_TOURS[card.tour];
  useEffect84(() => () => { if (speaking) askStopSpeaking(); }, [speaking]);
  const listen = () => {
    if (speaking) { askStopSpeaking(); setSpeaking(false); return; }
    const ok = askSpeak([x.q, ...(x.steps || [])].join(". "), shown, () => setSpeaking(false));
    if (ok) setSpeaking(true); else setVoiceNote(true);
  };
  const feedback = (kind) => { if (said) return; setSaid(kind); askLog({ kind, cardId: card.id, lang: shown, screen }); };
  const canSpeak = typeof window !== "undefined" && Boolean(window.speechSynthesis);
  const steps = x.steps || [];
  return <div data-testid="ask-answer" dir={askDir(shown)} style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, color: T.accent, display: "flex", alignItems: "center", gap: 6, padding: "0 2px" }}>{askT(shown, "from")} · {askT(shown, `topic_${card.topic}`)}</div>
    <div style={{ background: T.surface, boxShadow: T.shadowCard, borderRadius: "18px 18px 18px 6px", overflow: "hidden" }}>
      <div style={{ padding: "13px 15px 4px", fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.3 }}>{x.q}</div>
      {steps.length > 1
        ? steps.map((s, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 15px", alignItems: "flex-start" }}>
          <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: T.accentSoft, color: T.accent, fontSize: 11, fontWeight: 900, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontSize: 13.5, lineHeight: 1.55, color: T.inkSoft }}><AskRich text={s} /></span></div>)
        : <div style={{ padding: "6px 15px 8px", fontSize: 13.5, lineHeight: 1.6, color: T.inkSoft }}><AskRich text={steps[0]} /></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "8px 15px 12px" }}>
        {tour && <button type="button" data-testid="ask-show-me" onClick={() => onShowMe(card.tour, shown)} style={{ border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><AskIcon d="M8 5v14l11-7z" fill="#fff" size={13} />{askT(shown, "showMe")}</button>}
        {card.action && card.action.target !== screen && <button type="button" data-testid="ask-open" onClick={() => onGo(card.action.target)} style={{ border: tour ? `1.5px solid ${hexToRgba(T.accent, 0.35)}` : "none", background: tour ? T.surface : T.gradButton, color: tour ? T.accent : "#fff", borderRadius: 12, padding: tour ? "8px 11px" : "9px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(shown, "open", { x: ASK_SCREEN_NAMES[card.action.target] || card.action.target })} →</button>}
        {canSpeak && <button type="button" data-testid="ask-listen" onClick={listen} style={{ border: `1.5px solid ${hexToRgba(T.accent, 0.35)}`, background: speaking ? T.accentSoft : T.surface, color: T.accent, borderRadius: 12, padding: "8px 11px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><AskIcon d={ASK_SPEAKER} color={T.accent} size={14} />{askT(shown, speaking ? "stop" : "listen")}</button>}
      </div>
      {voiceNote && <div style={{ padding: "0 15px 10px", fontSize: 11.5, color: T.inkFaint }}>{askT(shown, "noVoice")}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderTop: `1px solid ${T.line}`, fontSize: 11.5, color: T.inkFaint, fontWeight: 700 }}>
        {said === "yes" ? <span>{askT(shown, "thanks")}</span> : <>{askT(shown, "helped")}<span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <AskPill testid="ask-yes" on={said === "yes"} onClick={() => feedback("yes")}>{askT(shown, "yes")}</AskPill>
          <AskPill testid="ask-no" on={said === "no"} onClick={() => feedback("no")}>{askT(shown, "no")}</AskPill></span></>}
      </div>
    </div>
    {langs.length > 1 && <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 11, color: T.inkFaint, fontWeight: 700, padding: "0 2px" }}>{askT(shown, "readIn")}{langs.map((l) => <AskPill key={l} on={l === shown} onClick={() => { askStopSpeaking(); setSpeaking(false); setShown(l); }}>{ASK_LANG_NAMES[l]}</AskPill>)}</div>}
    {said === "no" && <div data-testid="ask-sorry" style={{ display: "flex", flexDirection: "column", gap: 8, background: T.surfaceAlt, borderRadius: 16, padding: "11px 13px", marginTop: 2 }}>
      <span style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>{askT(shown, "sorry")}</span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={onAgain} style={{ border: `1.5px solid ${hexToRgba(T.accent, 0.35)}`, background: T.surface, color: T.accent, borderRadius: 12, padding: "8px 11px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(shown, "askAgain")}</button>
        <button type="button" data-testid="ask-talk" onClick={() => onTalk({ text: question || x.q, topic: ASK_DESK_TOPIC[card.topic] || "other", lang: shown })} style={{ border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(shown, "talk")} →</button>
      </span>
    </div>}
  </div>;
}

// A list of questions to pick from — a topic, a screen, or "did you mean".
function AskList({ cards, lang, onPick, testid }) {
  return <div data-testid={testid} style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{cards.map((c, i) => <button key={c.id} type="button" onClick={() => onPick(c)} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", cursor: "pointer", textAlign: "left" }}>
    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 650, color: T.ink, lineHeight: 1.35 }}>{askCardIn(c, lang).q}</span>
    <span aria-hidden="true" style={{ color: T.inkFaint, fontSize: 16 }}>›</span></button>)}</div>;
}

// The conversation itself — the same in the full screen and in the sheet.
function AskConversation({ mode, screen, guide, lang, setLang, onGo, onTalk, onShowMe, first }) {
  const [msgs, setMsgs] = useState88([]);
  const [text, setText] = useState88("");
  const [hearing, setHearing] = useState88(false);
  const [heardOnce, setHeardOnce] = useState88(false);
  const endRef = useRef47(null);
  const inputRef = useRef47(null);
  const recRef = useRef47(null);
  const seq = useRef47(0);
  // Written in a language this phone doesn't hold yet: it waits for the pack.
  const [waiting, setWaiting] = useState88(null);
  const cards = guide ? guide.cards : [];
  const byId = guide ? guide.index.byId : new Map();
  const add = (...m) => setMsgs((list) => [...list, ...m.map((x) => ({ ...x, key: (seq.current += 1) }))]);
  useEffect84(() => { if (endRef.current && endRef.current.scrollIntoView && msgs.length) endRef.current.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs.length]);
  useEffect84(() => () => { askStopSpeaking(); if (recRef.current) try { recRef.current.abort(); } catch (e) { /* gone */ } }, []);
  // Opened with a question already picked (a suggestion on Help & Support).
  useEffect84(() => { if (first && byId.get(first)) pick(byId.get(first), ""); }, [first, guide]);

  // As they type: the nearest questions, before they press anything.
  const typed = text.trim();
  const suggestions = useMemo21(() => {
    if (!guide || typed.length < 3) return [];
    const det = askDetectLang(typed, lang);
    return askRank(guide.index, typed, { typing: true, lang: det.known ? det.lang : lang, screen }).filter((r) => r.score >= 0.4).slice(0, 3);
  }, [typed, guide, lang, screen]);
  const suggestLang = typed ? (() => { const d = askDetectLang(typed, lang); return d.known ? d.lang : lang; })() : lang;

  function pick(card, typedText, inLang) {
    const want = inLang || lang;
    const l = card.t[want] ? want : "en";
    add({ who: "me", text: typedText || askCardIn(card, l).q }, { who: "bot", kind: "answer", card, lang: l, question: typedText || "" });
    askLog({ kind: "answer", text: typedText || "", lang: l, cardId: card.id, screen });
    setText("");
  }
  function submit() {
    const q = text.trim();
    if (!q || !guide) return;
    const det = askDetectLang(q, lang);
    if (det.known && det.lang !== lang) setLang(det.lang);
    setText("");
    if (det.known && !askIsCore(det.lang) && guide.extra !== det.lang) { setWaiting({ q, det }); return; }
    answer(q, det);
  }
  useEffect84(() => {
    // Whether the pack came or could not (then the closest answer is in English).
    if (waiting && guide && (guide.extra === waiting.det.lang || guide.tried === waiting.det.lang)) { const w = waiting; setWaiting(null); answer(w.q, w.det); }
  }, [waiting, guide]);
  function answer(q, det) {
    const l = det.known ? det.lang : "en";
    const ranked = askRank(guide.index, q, { lang: l, screen });
    const d = askDecide(ranked);
    if (askIsPersonal(q)) {
      const near = d.kind === "answer" ? d.top[0].card : null;
      add({ who: "me", text: q }, { who: "bot", kind: "personal", card: near, lang: l, question: q });
      askLog({ kind: "personal", lang: l, screen });
      return;
    }
    if (d.kind === "answer") add({ who: "me", text: q }, { who: "bot", kind: "answer", card: d.top[0].card, lang: l, question: q, other: !det.known });
    else if (d.kind === "choices") add({ who: "me", text: q }, { who: "bot", kind: "choices", cards: d.top.map((r) => r.card), lang: l, question: q, other: !det.known });
    else add({ who: "me", text: q }, { who: "bot", kind: "none", lang: l, question: q, other: !det.known });
    askLog({ kind: d.kind, text: q, lang: det.known ? l : "", cardId: d.kind === "answer" ? d.top[0].card.id : "", screen });
  }
  const again = () => { if (inputRef.current) inputRef.current.focus(); };
  const listenIn = () => {
    const Rec = askHearing();
    if (!Rec) return;
    if (hearing && recRef.current) { recRef.current.stop(); return; }
    try {
      const r = new Rec();
      r.lang = ASK_HEAR[lang] || "en-IN";
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onresult = (ev) => setText(Array.from(ev.results).map((x) => x[0].transcript).join(" "));
      r.onend = () => { setHearing(false); recRef.current = null; };
      r.onerror = () => { setHearing(false); recRef.current = null; };
      recRef.current = r;
      setHearing(true); setHeardOnce(true);
      r.start();
    } catch (e) { setHearing(false); }
  };
  const talk = (p) => onTalk({ ...p, via: "ask" });

  const empty = msgs.length === 0;
  // That screen's own questions first, then the ones it shares with others.
  const screenTopic = screen === "shop" ? "shop" : screen;
  const screenCards = screen ? cards.filter((c) => (c.screens || []).includes(screen)).sort((a, b) => (a.topic === screenTopic ? 0 : 1) - (b.topic === screenTopic ? 0 : 1)).slice(0, 6) : [];
  const popular = ASK_POPULAR.map((id) => byId.get(id)).filter(Boolean);
  return <div dir={askDir(lang)} style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
    <div data-testid="ask-thread" style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", gap: 12, padding: mode === "page" ? "4px 18px 14px" : "2px 16px 12px" }}>
      {!guide && <div style={{ fontSize: 13, color: T.inkFaint, padding: "18px 2px" }}>{askT(lang, "loading")}</div>}
      {guide && empty && mode === "page" && <>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 2px 2px" }}>
          <span aria-hidden="true" style={{ width: 50, height: 50, borderRadius: 17, background: T.gradButton, display: "grid", placeItems: "center", boxShadow: `0 10px 24px ${hexToRgba(T.accent, 0.32)}` }}><AskIcon d={ASK_SPARK} fill="#fff" size={24} /></span>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 800, color: T.ink, lineHeight: 1.25, marginTop: 8 }}>{askT(lang, "hello")}</div>
          <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>{askT(lang, "helloSub")}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{ASK_TILES.map(([topic, color, d]) => <button key={topic} type="button" data-testid={`ask-topic-${topic}`} onClick={() => add({ who: "bot", kind: "topic", topic, lang })} style={{ border: "none", background: T.surface, boxShadow: T.shadowCard, borderRadius: 16, padding: "11px 10px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 7, cursor: "pointer", textAlign: "left" }}>
          <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 10, background: hexToRgba(color, 0.12), display: "grid", placeItems: "center" }}><AskIcon d={d} color={color} /></span>
          <span style={{ fontSize: 12, fontWeight: 750, color: T.ink, lineHeight: 1.25 }}>{askT(lang, `topic_${topic}`)}</span></button>)}</div>
        {popular.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, margin: "2px 2px -4px" }}>{askT(lang, "popular")}</div>}
        {popular.length > 0 && <AskList testid="ask-popular" cards={popular.slice(0, 4)} lang={lang} onPick={(c) => pick(c, "")} />}
        <button type="button" data-testid="ask-feedback-home" onClick={() => window.dispatchEvent(new Event("gloobal:askFeedback"))} style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px dashed ${hexToRgba(T.accent, 0.35)}`, background: "transparent", borderRadius: 16, padding: "11px 13px", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}><AskIcon d="M4 5h16v11H9l-5 4zM9 10h6" color={T.accent} size={17} /><span style={{ flex: 1, fontSize: 13, fontWeight: 750, color: T.ink }}>{askT(lang, "fbHome")}</span><span style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{askT(lang, "fbOpen")} ›</span></button>
      </>}
      {guide && empty && mode === "sheet" && screenCards.length > 0 && <AskList testid="ask-screen-list" cards={screenCards} lang={lang} onPick={(c) => pick(c, "")} />}
      {msgs.map((m) => {
        if (m.who === "me") return <div key={m.key} style={{ alignSelf: "flex-end", maxWidth: "84%", background: T.accent, color: "#fff", padding: "10px 13px", borderRadius: "18px 18px 6px 18px", fontSize: 13.5, lineHeight: 1.45, overflowWrap: "anywhere" }}>{m.text}</div>;
        const note = m.other ? <div style={{ fontSize: 11.5, color: T.inkFaint, padding: "0 2px" }}>{askT("en", "otherLang")}</div> : null;
        if (m.kind === "answer") return <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>{note}<AskAnswer card={m.card} lang={m.lang} question={m.question} screen={screen} onGo={onGo} onShowMe={onShowMe} onTalk={talk} onAgain={again} /></div>;
        if (m.kind === "topic") {
          const list = cards.filter((c) => c.topic === m.topic || (m.topic === "send" && c.topic === "receive") || (m.topic === "account" && c.topic === "help"));
          return <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}><div style={{ fontSize: 10.5, fontWeight: 800, color: T.accent, padding: "0 2px" }}>{askT(m.lang, `topic_${m.topic}`)}</div><AskList testid="ask-topic-list" cards={list} lang={m.lang} onPick={(c) => pick(c, "")} /></div>;
        }
        if (m.kind === "choices") return <div key={m.key} data-testid="ask-choices" style={{ display: "flex", flexDirection: "column", gap: 6 }}>{note}
          <div style={{ fontSize: 13.5, fontWeight: 750, color: T.ink, fontFamily: T.fontDisplay, padding: "0 2px" }}>{askT(m.lang, "which")}</div>
          <AskList cards={m.cards} lang={m.lang} onPick={(c) => pick(c, m.question, m.lang)} />
          <button type="button" onClick={() => talk({ text: m.question, topic: ASK_DESK_TOPIC[m.cards[0] && m.cards[0].topic] || "other", lang: m.lang })} style={{ alignSelf: "flex-start", border: "none", background: "none", color: T.accent, fontSize: 12.5, fontWeight: 800, padding: "2px 2px", cursor: "pointer" }}>{askT(m.lang, "noneOfThese")} ›</button></div>;
        if (m.kind === "none") return <div key={m.key} data-testid="ask-none" style={{ display: "flex", flexDirection: "column", gap: 8, background: T.surface, boxShadow: T.shadowCard, borderRadius: "18px 18px 18px 6px", padding: "13px 15px" }}>{note}
          <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{askT(m.lang, "nothing")}</span>
          <span style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>{askT(m.lang, "nothingSub")}</span>
          <button type="button" data-testid="ask-talk" onClick={() => talk({ text: m.question, topic: "other", lang: m.lang })} style={{ alignSelf: "flex-start", border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(m.lang, "talk")} →</button></div>;
        if (m.kind === "personal") {
          const near = m.card ? askCardIn(m.card, m.lang) : null;
          return <div key={m.key} data-testid="ask-personal" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 10, background: "rgba(237,161,0,0.13)", borderRadius: 18, padding: "13px 14px" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><AskIcon d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" color="#b26a00" size={20} /></span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: T.ink }}><b style={{ display: "block", color: "#7A4300", marginBottom: 2 }}>{askT(m.lang, "personalTitle")}</b>{askT(m.lang, "personalBody")}</span>
            </div>
            {near && <div style={{ background: T.surface, boxShadow: T.shadowCard, borderRadius: 18, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>{askT(m.lang, "meanwhile")}</span>
              {(near.steps || []).map((s, i) => <span key={i} style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}>{(near.steps || []).length > 1 ? `${i + 1}. ` : ""}<AskRich text={s} /></span>)}
            </div>}
            <button type="button" data-testid="ask-talk" onClick={() => talk({ text: m.question, topic: "payment", lang: m.lang })} style={{ border: "none", background: T.gradButton, color: "#fff", borderRadius: 14, padding: "13px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{askT(m.lang, "talkTeam")}</button>
            <span style={{ fontSize: 11, color: T.inkFaint, textAlign: "center" }}>{askT(m.lang, "talkNote")}</span>
          </div>;
        }
        return null;
      })}
      <div ref={endRef} />
    </div>
    <div style={{ flexShrink: 0, padding: mode === "page" ? "8px 16px calc(12px + env(safe-area-inset-bottom, 0px))" : "8px 16px calc(14px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 8, background: T.bg }}>
      {suggestions.length > 0 && <div data-testid="ask-suggestions" style={{ borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.5, padding: "9px 14px 2px" }}>{askT(suggestLang, "maybe")}</div>
        {suggestions.map((r) => <button key={r.card.id} type="button" onClick={() => { const det = askDetectLang(typed, lang); if (det.known && det.lang !== lang) setLang(det.lang); pick(r.card, typed, det.known ? det.lang : lang); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 650, color: T.ink }}>
          <span style={{ flex: 1, minWidth: 0 }}>{askCardIn(r.card, suggestLang).q}</span><span aria-hidden="true" style={{ color: T.inkFaint }}>›</span></button>)}
      </div>}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, border: `1.5px solid ${typed ? T.accent : T.line}`, padding: "6px 6px 6px 14px" }}>
        <input ref={inputRef} data-testid="ask-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={hearing ? askT(lang, "listening") : askT(lang, empty ? "placeholder" : "more")} enterKeyHint="send" autoComplete="off" maxLength={300}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: 15, padding: "8px 0", fontFamily: "inherit" }} />
        {askHearing() && <button type="button" onClick={listenIn} aria-label={askT(lang, "listen")} style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: hearing ? T.accent : T.surfaceAlt, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}><AskIcon d={ASK_MIC} color={hearing ? "#fff" : T.accent} size={18} /></button>}
        <button type="submit" data-testid="ask-send" disabled={!typed || !guide} aria-label={askT(lang, "ask")} style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: typed && guide ? T.gradButton : T.gradButtonDisabled, display: "grid", placeItems: "center", cursor: typed ? "pointer" : "default", flexShrink: 0 }}><AskIcon d="M5 12h14M13 6l6 6-6 6" color="#fff" size={17} /></button>
      </form>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 10.5, color: T.inkFaint, fontWeight: 700, textAlign: "center" }}>
        <AskIcon d="M6 11h12v9H6zM8 11V8a4 4 0 018 0v3" color={T.inkFaint} size={12} />{heardOnce ? askT(lang, "voiceNote") : askT(lang, "never")}</div>
    </div>
  </div>;
}

function AskLangMenu({ lang, setLang }) {
  const [open, setOpen] = useState88(false);
  return <span style={{ position: "relative", flexShrink: 0 }}>
    <button type="button" data-testid="ask-lang" onClick={() => setOpen(!open)} aria-label={askT(lang, "lang")} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: T.surface, boxShadow: T.shadowCard, color: T.accentDeep || T.accent, borderRadius: 999, padding: "7px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
      <AskIcon d={ASK_TILES[4][2]} color={T.accent} size={14} />{ASK_LANG_NAMES[lang]}</button>
    {open && <span data-testid="ask-lang-list" style={{ position: "absolute", right: 0, top: 40, zIndex: 3, background: T.surface, boxShadow: "0 12px 30px rgba(0,0,0,0.18)", borderRadius: 14, overflowX: "hidden", overflowY: "auto", maxHeight: "min(420px, 62vh)", minWidth: 170, display: "flex", flexDirection: "column" }}>
      {ASK_LANG_CODES.map((l) => <button key={l} type="button" data-testid={`ask-lang-${l}`} onClick={() => { setLang(l); setOpen(false); }} style={{ border: "none", borderTop: l === "en" ? "none" : `1px solid ${T.line}`, background: l === lang ? T.accentSoft : "none", color: l === lang ? T.accent : T.ink, padding: "11px 14px", fontSize: 13.5, fontWeight: l === lang ? 800 : 600, textAlign: "left", cursor: "pointer" }}>{ASK_LANG_NAMES[l]}</button>)}
    </span>}
  </span>;
}

// "Show me": the real screen, dimmed, with one thing lit and a line about it.
function AskTour({ id, lang, onClose }) {
  const tour = ASK_TOURS[id];
  const [i, setI] = useState88(0);
  const [rect, setRect] = useState88(null);
  const [missing, setMissing] = useState88(false);
  const close = useBackClose(true, onClose);
  const step = tour ? tour.steps[i] : null;
  useEffect84(() => {
    if (!step) return undefined;
    setRect(null);
    if (!step.sel) return undefined;
    let tries = 0, el = null, live = true, timer = null;
    const measure = () => { if (live && el) { const r = el.getBoundingClientRect(); setRect({ x: r.left, y: r.top, w: r.width, h: r.height }); } };
    const look = () => {
      el = document.querySelector(step.sel);
      if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); timer = setTimeout(measure, 380); return; }
      tries += 1;
      // Not on this screen (a bank not open yet): say what is missing.
      if (tries > 12) { setMissing(true); return; }
      timer = setTimeout(look, 200);
    };
    look();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => { live = false; clearTimeout(timer); window.removeEventListener("resize", onResize); };
  }, [i, id]);
  if (!tour) return null;
  const last = missing || i === tour.steps.length - 1;
  const text = missing ? tour.missing[lang] || tour.missing.en : step.t[lang] || step.t.en;
  const pad = 6;
  const vh = typeof window !== "undefined" ? window.innerHeight : 700;
  const below = rect && rect.y + rect.h + 190 < vh;
  const bubbleTop = rect && !missing ? (below ? rect.y + rect.h + pad + 14 : Math.max(12, rect.y - pad - 14 - 170)) : null;
  return <div data-testid="ask-tour" role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 1600 }} onClick={(e) => e.stopPropagation()}>
    {rect && !missing
      ? <div style={{ position: "fixed", left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2, borderRadius: 20, boxShadow: `0 0 0 4px #fff, 0 0 0 9px ${hexToRgba(T.accent, 0.55)}, 0 0 0 9999px rgba(12,10,28,0.62)`, transition: "all .25s ease", pointerEvents: "none" }} />
      : <div style={{ position: "fixed", inset: 0, background: "rgba(12,10,28,0.62)" }} />}
    <div style={{ position: "fixed", left: 16, right: 16, maxWidth: 360, margin: "0 auto", top: bubbleTop != null ? bubbleTop : "38%", background: T.surface, borderRadius: 18, padding: "14px 15px", boxShadow: "0 16px 40px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 10 }}>
      {!missing && <span style={{ fontSize: 10.5, fontWeight: 900, color: T.accent, letterSpacing: 0.4, textTransform: "uppercase" }}>{askT(lang, "tourStep", { n: i + 1, m: tour.steps.length })}</span>}
      <span style={{ fontSize: 14, lineHeight: 1.5, color: T.ink, fontWeight: 600 }}><AskRich text={text} /></span>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!missing && <span aria-hidden="true" style={{ display: "flex", gap: 4 }}>{tour.steps.map((_, k) => <i key={k} style={{ width: k === i ? 16 : 6, height: 6, borderRadius: 3, background: k === i ? T.accent : T.line, display: "block" }} />)}</span>}
        {!last && <button type="button" onClick={close} style={{ marginLeft: "auto", border: "none", background: "none", color: T.inkFaint, fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(lang, "tourClose")}</button>}
        <button type="button" data-testid="ask-tour-next" onClick={() => (last ? close() : setI(i + 1))} style={{ marginLeft: last ? "auto" : 0, border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "8px 14px", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{askT(lang, last ? "tourDone" : "tourNext")}</button>
      </span>
    </div>
  </div>;
}

// Lives once in App, over everything: the full screen, the sheet, the tour.
// ── FEEDBACK (0238) ─────────────────────────────────────────────────────
// How Ask GLOOBAL is working, in three faces and an optional line. Sent as
// one anonymous event (kind "feedback"); the server blanks numbers and
// emails before it keeps the words, and keeps them 90 days.
var ASK_MOODS = [["good", "#0FA372", "M8 14s1.5 2 4 2 4-2 4-2"], ["ok", "#D98A00", "M8 15h8"], ["bad", "#E23F45", "M16 16s-1.5-2-4-2-4 2-4 2"]];
function AskFeedback({ lang, onClose }) {
  const [mood, setMood] = useState88("");
  const [text, setText] = useState88("");
  const [sent, setSent] = useState88(false);
  const send = () => { if (!mood || sent) return; askLog({ kind: "feedback", mood, text: text.trim(), lang }); setSent(true); };
  const label = { good: "fbGood", ok: "fbOk", bad: "fbBad" };
  return <div data-testid="ask-feedback" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 18px 18px" }}>
    {sent ? <div data-testid="ask-feedback-thanks" style={{ background: T.surface, boxShadow: T.shadowCard, borderRadius: 18, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{askT(lang, "fbThanks")}</span>
      <button type="button" onClick={onClose} style={{ border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{askT(lang, "close")}</button>
    </div> : <>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.3 }}>{askT(lang, "fbTitle")}</div>
      <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{ASK_MOODS.map(([k, color, mouth]) => <button key={k} type="button" role="radio" aria-checked={mood === k} data-testid={`ask-mood-${k}`} onClick={() => setMood(k)} style={{ border: mood === k ? `2px solid ${color}` : `1.5px solid ${T.line}`, background: mood === k ? hexToRgba(color, 0.1) : T.surface, borderRadius: 16, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="0.6" fill={color} /><circle cx="15" cy="10" r="0.6" fill={color} /><path d={mouth} /></svg>
        <span style={{ fontSize: 12, fontWeight: 800, color: mood === k ? color : T.ink }}>{askT(lang, label[k])}</span></button>)}</div>
      <textarea data-testid="ask-feedback-text" value={text} onChange={(e) => setText(e.target.value.slice(0, 280))} rows={4} placeholder={askT(lang, "fbPlaceholder")} style={{ border: `1.5px solid ${T.line}`, borderRadius: 14, padding: "11px 12px", fontSize: 14, color: T.ink, background: T.surface, fontFamily: "inherit", outline: "none", resize: "none" }} />
      <span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{askT(lang, "fbNote")}</span>
      <button type="button" data-testid="ask-feedback-send" disabled={!mood} onClick={send} style={{ border: "none", borderRadius: 14, padding: 13, background: mood ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontSize: 14, fontWeight: 800, cursor: mood ? "pointer" : "default", fontFamily: "inherit" }}>{askT(lang, "fbSend")}</button>
    </>}
  </div>;
}

function AskGloobalHost({ onGo, onTalk }) {
  const [open, setOpen] = useState88(null);
  const [tour, setTour] = useState88(null);
  const [feedback, setFeedback] = useState88(false);
  const [guide, setGuide] = useState88(askGuide.index ? { cards: askGuide.cards, index: askGuide.index, extra: askGuide.extra } : null);
  const [failed, setFailed] = useState88(false);
  const [lang, setLangRaw] = useState88(askStartLang);
  const setLang = (l) => { setLangRaw(l); try { localStorage.setItem("gloobal.askLang", l); } catch (e) { /* private mode */ } };
  const load = (extra) => {
    setFailed(false);
    askLoadGuide(extra).then((g) => { if (g) setGuide({ cards: g.cards, index: g.index, version: g.version, extra: g.extra, tried: extra }); else setFailed(true); });
  };
  // 0252: a pack language, chosen or written in, is fetched then.
  useEffect84(() => { if (!askIsCore(lang) && (!guide || guide.extra !== lang)) load(lang); }, [lang]);
  useEffect84(() => {
    const onAsk = (e) => { setOpen({ mode: "sheet", ...(e.detail || {}) }); };
    window.addEventListener("gloobal:ask", onAsk);
    // Fetched quietly once the app has settled, so the first question is instant.
    const t = setTimeout(load, 6000);
    return () => { window.removeEventListener("gloobal:ask", onAsk); clearTimeout(t); };
  }, []);
  useEffect84(() => { if (open && !guide) load(); }, [open]);
  const close = useBackClose(Boolean(open), () => { askStopSpeaking(); setOpen(null); setFeedback(false); }, { unwind: true });
  useEffect84(() => { if (!open) setFeedback(false); }, [open]);
  useEffect84(() => {
    const onFb = () => setFeedback(true);
    window.addEventListener("gloobal:askFeedback", onFb);
    return () => window.removeEventListener("gloobal:askFeedback", onFb);
  }, []);
  const go = (target) => { askStopSpeaking(); setOpen(null); setTimeout(() => onGo(target), 0); };
  const talk = (p) => { askStopSpeaking(); setOpen(null); setTimeout(() => onTalk(p), 0); };
  const showMe = (id, l) => { const t = ASK_TOURS[id]; if (!t) return; askStopSpeaking(); setOpen(null); setTimeout(() => { onGo(t.target); setTour({ id, lang: l }); }, 0); };
  const body = open && (feedback
    ? <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}><AskFeedback lang={lang} onClose={() => setFeedback(false)} /></div>
    : failed && !guide
    ? <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}><span style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5 }}>{askT(lang, "offline")}</span><button type="button" onClick={load} style={{ border: "none", background: T.gradButton, color: "#fff", borderRadius: 12, padding: "9px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{askT(lang, "retry")}</button></div>
    : <AskConversation key={`${open.mode}-${open.screen || ""}-${open.first || ""}`} mode={open.mode} screen={open.screen || null} first={open.first || null} guide={guide} lang={lang} setLang={setLang} onGo={go} onTalk={talk} onShowMe={showMe} />);
  return <>
    {open && open.mode === "page" && <div data-testid="ask-page" style={{ position: "fixed", inset: 0, zIndex: 1500, background: T.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px", flexShrink: 0 }}>
        <NavBackButton onClick={feedback ? () => setFeedback(false) : close} />
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Ask GLOOBAL</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600 }}>{askT(lang, "sub")}</span></span>
        {!feedback && <button type="button" data-testid="ask-feedback-open" onClick={() => setFeedback(true)} aria-label={askT(lang, "fbOpen")} title={askT(lang, "fbOpen")} style={{ width: 38, height: 38, borderRadius: 12, border: `1.5px solid ${T.line}`, background: T.surface, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}><AskIcon d="M4 5h16v11H9l-5 4zM9 10h6" color={T.accent} size={17} /></button>}
        <AskLangMenu lang={lang} setLang={setLang} />
      </div>
      {body}
    </div>}
    {open && open.mode === "sheet" && <div data-testid="ask-sheet-wrap" style={{ position: "fixed", inset: 0, zIndex: 1500 }}>
      <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(12,10,28,0.45)" }} />
      <div data-testid="ask-sheet" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "86vh", height: "72vh", maxWidth: 560, margin: "0 auto", background: T.bg, borderRadius: "26px 26px 0 0", display: "flex", flexDirection: "column", boxShadow: "0 -12px 40px rgba(0,0,0,0.2)" }}>
        <span aria-hidden="true" style={{ width: 42, height: 5, borderRadius: 3, background: T.line, alignSelf: "center", marginTop: 9 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 10px" }}>
          <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 11, background: T.gradButton, display: "grid", placeItems: "center", flexShrink: 0 }}><AskIcon d={ASK_SPARK} fill="#fff" size={16} /></span>
          <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.2 }}>{open.screen ? askT(lang, `screen_${open.screen}`) : "Ask GLOOBAL"}</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600 }}>{askT(lang, "sub")}</span></span>
          <AskLangMenu lang={lang} setLang={setLang} />
        </div>
        {body}
      </div>
    </div>}
    {tour && <AskTour id={tour.id} lang={tour.lang} onClose={() => setTour(null)} />}
  </>;
}

// The top of Help & Support: a way into Ask GLOOBAL, with a few questions
// already there to tap.
function AskHelpBox() {
  const [lang] = useState88(askStartLang);
  const [cards, setCards] = useState88(askGuide.cards);
  useEffect84(() => { let on = true; askLoadGuide().then((g) => { if (on && g) setCards(g.cards); }); return () => { on = false; }; }, []);
  const open = (first) => window.dispatchEvent(new CustomEvent("gloobal:ask", { detail: { mode: "page", first } }));
  const chips = (cards || []).filter((c) => ASK_POPULAR.slice(0, 4).includes(c.id));
  return <div data-testid="ask-help-box" style={{ borderRadius: T.radiusLg, padding: "15px 16px", background: `linear-gradient(150deg, ${T.accentSoft} 0%, ${T.surface} 72%)`, border: `1.5px solid ${hexToRgba(T.accent, 0.18)}`, boxShadow: T.shadowCard, display: "flex", flexDirection: "column", gap: 10 }}>
    <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 9, background: T.gradButton, display: "grid", placeItems: "center" }}><AskIcon d={ASK_SPARK} fill="#fff" size={14} /></span>
      <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{askT(lang, "helpBoxTitle")}</span>
    </span>
    <span style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>{askT(lang, "helpBoxSub")}</span>
    <button type="button" data-testid="ask-open-page" onClick={() => open(null)} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surfaceAlt, border: `1.5px solid ${T.line}`, borderRadius: 14, padding: "9px 9px 9px 13px", cursor: "pointer", textAlign: "left" }}>
      <span style={{ flex: 1, fontSize: 13.5, color: T.inkFaint, fontWeight: 600 }}>{askT(lang, "placeholder")}</span>
      <span style={{ background: T.gradButton, color: "#fff", borderRadius: 10, padding: "6px 11px", fontSize: 12, fontWeight: 800 }}>{askT(lang, "ask")}</span>
    </button>
    {chips.length > 0 && <span style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{chips.map((c) => <button key={c.id} type="button" onClick={() => open(c.id)} style={{ border: `1.5px solid ${T.line}`, background: T.surface, color: T.ink, borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{askCardIn(c, lang).q}</button>)}</span>}
  </div>;
}
