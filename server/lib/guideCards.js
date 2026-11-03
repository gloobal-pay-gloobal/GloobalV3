// server/lib/guideCards.js — built-in Ask GLOOBAL guide (0223). Staff edits live in MongoDB; these are the starting set.
//
// Each card: what it is about (topic), the screens whose "?" lists it, whether
// it is about money (then a change to it needs a second person on the staff
// site), the screen its button opens, and — per language (en, hi = हिन्दी,
// hl = Hinglish, ta = தமிழ்) — the question, the ways people ask it, and the
// answer in steps. **Bold** marks a name as the app shows it.
module.exports = [
  // ── SEND ──────────────────────────────────────────────────────────────
  {
    id: "send-how", topic: "send", screens: ["send"], money: true, action: {target:"send"},
    t: {
      en: {
        q: "How do I send money?",
        asks: ["send money", "how to send money", "how to pay someone", "transfer money to a friend", "pay a person", "send money by gloobal id", "send to phone number", "how do i transfer", "make a payment", "sned money", "how can i pay my friend", "pay my friend"],
        steps: [
          "On Home, tap **Send**.",
          "Find the person by their GLOOBAL ID, or switch to their phone number. You can also tap **Scanner** on Home and scan their code.",
          "Type the amount and tap **Send**. Then choose what to pay with, for example **GLOOBAL Bank**.",
          "Confirm with your PIN (and fingerprint or Face ID if your phone asks). Payments between GLOOBAL accounts reach them at once.",
        ],
      },
      hi: {
        q: "पैसे कैसे भेजें?",
        asks: ["पैसे कैसे भेजें", "पैसे भेजना है", "किसी को पेमेंट कैसे करें", "दोस्त को पैसे ट्रांसफर", "पैसा भेजो", "ट्रांसफर कैसे करें", "GLOOBAL ID से पैसे भेजें", "नंबर पर पैसे भेजें", "पेमेंट करना है", "पैसे सेंड करना"],
        steps: [
          "Home पर **Send** दबाएँ।",
          "उस व्यक्ति को उसकी GLOOBAL ID से ढूँढें, या फ़ोन नंबर पर स्विच करें। Home पर **Scanner** से उनका कोड भी स्कैन कर सकते हैं।",
          "रकम लिखें और **Send** दबाएँ। फिर चुनें कि पैसे किससे जाएँ, जैसे **GLOOBAL Bank**।",
          "अपने PIN से पक्का करें (फ़ोन माँगे तो फ़िंगरप्रिंट या Face ID भी)। GLOOBAL खातों के बीच पैसे तुरंत पहुँचते हैं।",
        ],
      },
      hl: {
        q: "Paise kaise bheje?",
        asks: ["paise kaise bheje", "paisa kaise bhejna hai", "paise bhejna", "kisi ko payment kaise kare", "paise transfer karna hai", "dost ko paise bhejo", "money send kaise kare", "gloobal id se paise bhejna", "number pe paise bheje", "pese kaise bhejein"],
        steps: [
          "Home par **Send** dabao.",
          "Us person ko unki GLOOBAL ID se dhoondho, ya phone number par switch karo. Home par **Scanner** se unka code bhi scan kar sakte ho.",
          "Amount likho aur **Send** dabao. Phir chuno paise kisse jaayein, jaise **GLOOBAL Bank**.",
          "Apne PIN se confirm karo (phone maange to fingerprint ya Face ID bhi). GLOOBAL accounts ke beech paise turant pahunchte hain.",
        ],
      },
      ta: {
        q: "பணம் எப்படி அனுப்புவது?",
        asks: ["பணம் அனுப்புவது எப்படி", "பணம் அனுப்பணும்", "காசு அனுப்ப", "ஒருவருக்கு payment செய்ய", "நண்பருக்கு பணம் transfer", "money send பண்ணுவது எப்படி", "GLOOBAL ID மூலம் பணம் அனுப்ப", "phone number க்கு பணம் அனுப்ப", "பணம் அனுப்புறது"],
        steps: [
          "Home-ல் **Send** அழுத்துங்கள்.",
          "அவருடைய GLOOBAL ID மூலம் தேடுங்கள், அல்லது phone number-க்கு மாற்றுங்கள். Home-ல் **Scanner** மூலம் அவருடைய code-ஐயும் scan செய்யலாம்.",
          "தொகையை type செய்து **Send** அழுத்துங்கள். பிறகு எதிலிருந்து பணம் போக வேண்டும் என்று தேர்வு செய்யுங்கள், உதாரணமாக **GLOOBAL Bank**.",
          "உங்கள் PIN மூலம் உறுதி செய்யுங்கள் (phone கேட்டால் fingerprint அல்லது Face ID). GLOOBAL கணக்குகளுக்கு இடையே பணம் உடனே சேரும்.",
        ],
      },
    },
  },
  {
    id: "send-abroad", topic: "send", screens: ["send"], money: true, action: {target:"send"},
    t: {
      en: {
        q: "How do I send money to another country?",
        asks: ["send money abroad", "send to another country", "international transfer", "pay someone in another country", "send money overseas", "foreign transfer", "cross border payment", "which currency will they get", "exchange rate", "how much will they receive", "why do i see two amounts", "two amounts", "both amounts", "they get a different amount"],
        steps: [
          "Use **Send** as usual and find them by GLOOBAL ID or phone number. Their country shows on their card.",
          "You pay in your own country's money, and they get their own country's money.",
          "Before you confirm, the screen shows both amounts — what you pay and what they get — with the rate used.",
          "The receipt in **History** keeps both amounts.",
        ],
      },
      hi: {
        q: "दूसरे देश में पैसे कैसे भेजें?",
        asks: ["विदेश पैसे भेजना", "दूसरे देश में पैसे भेजें", "बाहर पैसे भेजना है", "इंटरनेशनल ट्रांसफर", "विदेश में पेमेंट", "डॉलर में पैसे भेजना", "एक्सचेंज रेट", "उन्हें कितने पैसे मिलेंगे", "दुबई पैसे भेजना", "दो रकम क्यों दिख रही हैं"],
        steps: [
          "हमेशा की तरह **Send** खोलें और उन्हें GLOOBAL ID या फ़ोन नंबर से ढूँढें। उनका देश उनके कार्ड पर दिखता है।",
          "आप अपने देश के पैसे में देते हैं, और उन्हें उनके देश के पैसे मिलते हैं।",
          "पक्का करने से पहले स्क्रीन दोनों रकम दिखाती है — आप कितना देंगे और उन्हें कितना मिलेगा — और कौन सा रेट लगा।",
          "**History** की रसीद में दोनों रकम रहती हैं।",
        ],
      },
      hl: {
        q: "Dusre desh mein paise kaise bheje?",
        asks: ["videsh paise bhejna", "bahar paise bhejne hai", "dusre desh me paise bheje", "international transfer kaise kare", "abroad money send", "dubai paise bhejna", "dollar me paise bhejo", "exchange rate kitna hai", "unko kitna milega", "foreign me payment", "do amount kyu dikh rahe", "dono amount kya hai"],
        steps: [
          "Hamesha ki tarah **Send** kholo aur unhe GLOOBAL ID ya phone number se dhoondho. Unka country unke card par dikhta hai.",
          "Aap apne desh ke paise mein dete ho, aur unhe unke desh ke paise milte hain.",
          "Confirm se pehle screen dono amount dikhati hai — aap kitna doge aur unhe kitna milega — aur kaunsa rate laga.",
          "**History** ki receipt mein dono amount rehte hain.",
        ],
      },
      ta: {
        q: "வேறு நாட்டுக்கு பணம் அனுப்புவது எப்படி?",
        asks: ["வெளிநாட்டுக்கு பணம் அனுப்ப", "வேறு நாட்டுக்கு பணம்", "international transfer", "abroad பணம் அனுப்ப", "dubai க்கு பணம் அனுப்ப", "dollar ல அனுப்ப", "exchange rate என்ன", "அவருக்கு எவ்வளவு கிடைக்கும்", "foreign payment", "இரண்டு தொகை ஏன் காட்டுகிறது"],
        steps: [
          "வழக்கம் போல **Send** திறந்து, GLOOBAL ID அல்லது phone number மூலம் அவரைத் தேடுங்கள். அவருடைய நாடு அவருடைய card-ல் தெரியும்.",
          "நீங்கள் உங்கள் நாட்டுப் பணத்தில் செலுத்துவீர்கள்; அவருக்கு அவருடைய நாட்டுப் பணம் கிடைக்கும்.",
          "உறுதி செய்யும் முன், நீங்கள் செலுத்தும் தொகை, அவருக்குக் கிடைக்கும் தொகை, பயன்படுத்திய rate — இவற்றைத் திரை காட்டும்.",
          "**History**-ல் உள்ள receipt-ல் இரண்டு தொகைகளும் இருக்கும்.",
        ],
      },
    },
  },
  {
    id: "send-limit", topic: "send", screens: ["send"], money: true, action: {target:"send"},
    t: {
      en: {
        q: "Why can't I send this amount?",
        asks: ["sending limit", "why is sending paused", "payment paused", "max amount i can send", "limit on transfer", "cannot send money", "too large to send", "send blocked", "why is it capped", "transfer limit", "how much can i send", "how much can i send today", "what is my limit"],
        steps: [
          "GLOOBAL can pause payments to a country, or cap how much can go there, for a while.",
          "The **Send** screen tells you before you pay — for example \"paused right now\" or \"You can send up to…\". Your limit shows there.",
          "Send a smaller amount, or try again later.",
          "If it says payments from your account are paused, go to **Help & Support** and tap **Chat with us**.",
        ],
      },
      hi: {
        q: "यह रकम क्यों नहीं भेज पा रहे?",
        asks: ["भेजने की लिमिट", "पेमेंट रुका हुआ है", "पैसे नहीं जा रहे", "कितने पैसे भेज सकते हैं", "लिमिट क्यों है", "ट्रांसफर बंद है", "ज़्यादा रकम नहीं जा रही", "सेंड नहीं हो रहा", "paused लिखा आ रहा है"],
        steps: [
          "GLOOBAL कुछ समय के लिए किसी देश को पेमेंट रोक सकता है, या वहाँ जाने वाली रकम पर सीमा लगा सकता है।",
          "पैसे भेजने से पहले ही **Send** स्क्रीन बता देती है — जैसे \"paused right now\" या \"You can send up to…\"। आपकी लिमिट वहीं दिखती है।",
          "कम रकम भेजें, या थोड़ी देर बाद फिर कोशिश करें।",
          "अगर लिखा है कि आपके खाते से पेमेंट रुके हैं, तो **Help & Support** में **Chat with us** दबाएँ।",
        ],
      },
      hl: {
        q: "Ye amount kyu nahi bhej pa rahe?",
        asks: ["send limit kitni hai", "payment paused kyu hai", "paise nahi ja rahe", "kitna bhej sakte hai", "limit kyu laga hai", "transfer band hai", "zyada amount nahi ja raha", "send nahi ho raha", "paused likha aa raha", "limt kya hai", "kitne paise bhej sakta hu", "meri limit kitni hai"],
        steps: [
          "GLOOBAL kuch time ke liye kisi country ko payment rok sakta hai, ya wahan jaane wale amount par limit laga sakta hai.",
          "Paise bhejne se pehle hi **Send** screen bata deti hai — jaise \"paused right now\" ya \"You can send up to…\". Aapki limit wahin dikhti hai.",
          "Kam amount bhejo, ya thodi der baad try karo.",
          "Agar likha hai ki aapke account se payment ruke hain, to **Help & Support** mein **Chat with us** dabao.",
        ],
      },
      ta: {
        q: "இந்தத் தொகையை ஏன் அனுப்ப முடியவில்லை?",
        asks: ["அனுப்பும் limit", "payment நிறுத்தப்பட்டுள்ளது", "பணம் போகவில்லை", "எவ்வளவு அனுப்பலாம்", "limit ஏன்", "transfer block ஆனது", "அதிக தொகை போகவில்லை", "send ஆகவில்லை", "paused னு வருது"],
        steps: [
          "சில நேரம் GLOOBAL ஒரு நாட்டுக்கான payment-ஐ நிறுத்தலாம், அல்லது அங்கு அனுப்பும் தொகைக்கு வரம்பு வைக்கலாம்.",
          "பணம் அனுப்பும் முன்பே **Send** திரை சொல்லும் — \"paused right now\" அல்லது \"You can send up to…\" போல. உங்கள் limit அங்கே தெரியும்.",
          "குறைந்த தொகையை அனுப்புங்கள், அல்லது சிறிது நேரம் கழித்து முயற்சி செய்யுங்கள்.",
          "உங்கள் கணக்கிலிருந்து payment நிறுத்தப்பட்டுள்ளது என்று வந்தால், **Help & Support**-ல் **Chat with us** அழுத்துங்கள்.",
        ],
      },
    },
  },
  {
    id: "send-speed", topic: "send", screens: ["send"], money: true, action: {target:"history"},
    t: {
      en: {
        q: "How fast does the money reach them?",
        asks: ["how long does it take", "payment not received", "did my money arrive", "is it instant", "money not reached", "transfer time", "when will they get it", "payment pending", "they didnt get the money"],
        steps: [
          "Payments between GLOOBAL accounts are instant. Once it shows as sent, it has reached their account.",
          "Not sure? Open the payment in Profile → **History**. Its receipt says exactly where it is.",
          "Money to an outside bank is different: it shows **Processing** until the bank confirms.",
          "Still a problem? Go to **Help & Support** → **Chat with us** and pick **A payment**.",
        ],
      },
      hi: {
        q: "पैसे कितनी देर में पहुँचते हैं?",
        asks: ["पैसे कब पहुँचेंगे", "पैसे नहीं मिले", "पेमेंट पहुँचा या नहीं", "कितना टाइम लगता है", "तुरंत जाता है क्या", "पैसे अटक गए", "सामने वाले को पैसे नहीं मिले", "पेमेंट पेंडिंग है"],
        steps: [
          "GLOOBAL खातों के बीच पेमेंट तुरंत होता है। भेजा हुआ दिखते ही पैसे उनके खाते में पहुँच चुके होते हैं।",
          "पक्का नहीं? Profile → **History** में वह पेमेंट खोलें। उसकी रसीद बताती है कि पैसे कहाँ हैं।",
          "बाहर के बैंक में पैसे भेजना अलग है: बैंक की पुष्टि तक **Processing** दिखता है।",
          "फिर भी दिक्कत है? **Help & Support** → **Chat with us** में **A payment** चुनें।",
        ],
      },
      hl: {
        q: "Paise kitni der mein pahunchte hain?",
        asks: ["paise kab pahunchenge", "paise nahi mile", "payment pahuncha ya nahi", "kitna time lagta hai", "turant jata hai kya", "paise atak gaye", "samne wale ko paise nahi mile", "payment pending hai", "paisa nhi aaya"],
        steps: [
          "GLOOBAL accounts ke beech payment turant hota hai. Sent dikhte hi paise unke account mein pahunch chuke hote hain.",
          "Pakka nahi? Profile → **History** mein woh payment kholo. Uski receipt batati hai paise kahan hain.",
          "Bahar ke bank mein paise bhejna alag hai: bank confirm kare tab tak **Processing** dikhta hai.",
          "Phir bhi problem hai? **Help & Support** → **Chat with us** mein **A payment** chuno.",
        ],
      },
      ta: {
        q: "பணம் எவ்வளவு நேரத்தில் சேரும்?",
        asks: ["பணம் எப்போது சேரும்", "பணம் வரவில்லை", "payment சேர்ந்ததா", "எவ்வளவு நேரம் ஆகும்", "உடனே போகுமா", "பணம் மாட்டிக்கொண்டது", "அவருக்கு பணம் கிடைக்கவில்லை", "payment pending"],
        steps: [
          "GLOOBAL கணக்குகளுக்கு இடையே payment உடனே நடக்கும். அனுப்பப்பட்டது என்று காட்டினால், பணம் அவருடைய கணக்கில் சேர்ந்துவிட்டது.",
          "சந்தேகமா? Profile → **History**-ல் அந்த payment-ஐத் திறங்கள். அதன் receipt பணம் எங்கே உள்ளது என்று சொல்லும்.",
          "வெளி வங்கிக்கு அனுப்புவது வேறு: வங்கி உறுதி செய்யும் வரை **Processing** என்று காட்டும்.",
          "இன்னும் பிரச்சனையா? **Help & Support** → **Chat with us**-ல் **A payment** தேர்வு செய்யுங்கள்.",
        ],
      },
    },
  },
  {
    id: "send-undo", topic: "send", screens: ["send"], money: true, action: {target:"history"},
    t: {
      en: {
        q: "Can I cancel a payment I sent?",
        asks: ["cancel payment", "undo transfer", "reverse payment", "get my money back", "refund my payment", "stop a payment", "take money back", "cancel transaction", "recall money"],
        steps: [
          "Before you enter your PIN you can still back out — nothing has been sent.",
          "Once it is sent, you can't pull it back yourself. The person you paid can send it back.",
          "Open the payment's receipt in **History** and tap **Complain**. They are told, and can tap **Send back** in the case. You can also chat with us.",
        ],
      },
      hi: {
        q: "भेजा हुआ पेमेंट कैंसिल हो सकता है?",
        asks: ["पेमेंट कैंसिल करना है", "पैसे वापस चाहिए", "ट्रांसफर वापस लेना", "रिफंड कैसे मिलेगा", "पेमेंट रोकना है", "गलती से भेज दिया", "पैसे वापस कैसे लें", "ट्रांजैक्शन कैंसिल"],
        steps: [
          "PIN डालने से पहले आप रुक सकते हैं — तब तक कुछ नहीं गया होता।",
          "भेजने के बाद आप खुद पैसे वापस नहीं ले सकते। जिसे पैसे मिले हैं, वह वापस भेज सकता है।",
          "**History** में उस पेमेंट की रसीद खोलें और **Complain** दबाएँ। उन्हें खबर जाती है, और वे केस में **Send back** दबा सकते हैं। आप हमसे चैट भी कर सकते हैं।",
        ],
      },
      hl: {
        q: "Bheja hua payment cancel ho sakta hai?",
        asks: ["payment cancel karna hai", "paise wapas chahiye", "transfer wapas lena", "refund kaise milega", "payment rokna hai", "galti se bhej diya", "paise wapis kaise le", "transaction cancel karo", "paisa return karo"],
        steps: [
          "PIN daalne se pehle aap ruk sakte ho — tab tak kuch nahi gaya hota.",
          "Bhejne ke baad aap khud paise wapas nahi le sakte. Jisko paise mile hain, woh wapas bhej sakta hai.",
          "**History** mein us payment ki receipt kholo aur **Complain** dabao. Unhe khabar jaati hai, aur woh case mein **Send back** daba sakte hain. Aap humse chat bhi kar sakte ho.",
        ],
      },
      ta: {
        q: "அனுப்பிய payment-ஐ cancel செய்ய முடியுமா?",
        asks: ["payment cancel செய்ய", "பணத்தை திரும்ப பெற", "transfer திரும்ப எடுக்க", "refund எப்படி கிடைக்கும்", "payment நிறுத்த", "தவறுதலாக அனுப்பிவிட்டேன்", "பணம் திரும்ப வேண்டும்", "transaction cancel"],
        steps: [
          "PIN போடுவதற்கு முன் நீங்கள் நிறுத்தலாம் — அதுவரை எதுவும் அனுப்பப்படவில்லை.",
          "அனுப்பிய பிறகு, நீங்களே பணத்தைத் திரும்ப எடுக்க முடியாது. பணம் பெற்றவர் அதைத் திருப்பி அனுப்பலாம்.",
          "**History**-ல் அந்த payment-ன் receipt-ஐத் திறந்து **Complain** அழுத்துங்கள். அவருக்குத் தெரிவிக்கப்படும்; அவர் case-ல் **Send back** அழுத்தலாம். நீங்கள் எங்களிடமும் chat செய்யலாம்.",
        ],
      },
    },
  },
  {
    id: "send-wrong", topic: "send", screens: ["send"], money: true, action: {target:"complaints"},
    t: {
      en: {
        q: "I sent money to the wrong person",
        asks: ["sent to wrong person", "wrong number payment", "paid wrong amount", "paid twice", "wrong transfer", "mistake payment", "sent to wrong gloobal id", "money went to wrong account", "paid extra by mistake"],
        steps: [
          "Open the payment from **History** and tap **Complain** on its receipt.",
          "Pick the reason, like **Sent to the wrong person** or **Wrong amount**. Raising it doesn't move any money.",
          "The person is told. You can talk in the case's chat, and they can send the money back from there.",
          "No reply in 48 hours? Tap **Ask support** to hand it to GLOOBAL. All cases are in Profile → **Complaints & reports**.",
        ],
      },
      hi: {
        q: "गलत व्यक्ति को पैसे चले गए",
        asks: ["गलत आदमी को पैसे भेज दिए", "गलत नंबर पर पैसे गए", "गलत रकम भेज दी", "दो बार पेमेंट हो गया", "गलती से पेमेंट", "गलत GLOOBAL ID पर भेजा", "ज़्यादा पैसे चले गए", "गलत ट्रांसफर"],
        steps: [
          "**History** से वह पेमेंट खोलें और रसीद पर **Complain** दबाएँ।",
          "वजह चुनें, जैसे **Sent to the wrong person** या **Wrong amount**। शिकायत करने से कोई पैसा नहीं हिलता।",
          "उस व्यक्ति को खबर जाती है। केस की चैट में बात करें; वे वहीं से पैसे वापस भेज सकते हैं।",
          "48 घंटे में जवाब नहीं? **Ask support** दबाकर GLOOBAL को सौंपें। सारे केस Profile → **Complaints & reports** में हैं।",
        ],
      },
      hl: {
        q: "Galat person ko paise chale gaye",
        asks: ["galat aadmi ko paise bhej diye", "galat number pe paise gaye", "wrong amount bhej diya", "do baar payment ho gaya", "galti se payment", "galat gloobal id pe bheja", "zyada paise chale gaye", "wrong transfer ho gaya", "galat insaan ko paisa"],
        steps: [
          "**History** se woh payment kholo aur receipt par **Complain** dabao.",
          "Reason chuno, jaise **Sent to the wrong person** ya **Wrong amount**. Complaint karne se koi paisa nahi hilta.",
          "Us person ko khabar jaati hai. Case ki chat mein baat karo; woh wahin se paise wapas bhej sakte hain.",
          "48 ghante mein reply nahi? **Ask support** dabakar GLOOBAL ko do. Saare case Profile → **Complaints & reports** mein hain.",
        ],
      },
      ta: {
        q: "தவறான நபருக்கு பணம் அனுப்பிவிட்டேன்",
        asks: ["தவறான நபருக்கு பணம்", "தவறான number க்கு அனுப்பிவிட்டேன்", "தவறான தொகை அனுப்பினேன்", "இரண்டு முறை payment ஆனது", "தவறுதலாக payment", "தவறான GLOOBAL ID", "அதிகமாக அனுப்பிவிட்டேன்", "wrong transfer"],
        steps: [
          "**History**-ல் அந்த payment-ஐத் திறந்து, receipt-ல் **Complain** அழுத்துங்கள்.",
          "காரணத்தைத் தேர்வு செய்யுங்கள், உதாரணமாக **Sent to the wrong person** அல்லது **Wrong amount**. புகார் கொடுத்தால் பணம் எதுவும் நகராது.",
          "அவருக்குத் தெரிவிக்கப்படும். case-ன் chat-ல் பேசலாம்; அவர் அங்கிருந்தே பணத்தைத் திருப்பி அனுப்பலாம்.",
          "48 மணி நேரத்தில் பதில் இல்லையா? **Ask support** அழுத்தி GLOOBAL-இடம் ஒப்படையுங்கள். எல்லா case-களும் Profile → **Complaints & reports**-ல் இருக்கும்.",
        ],
      },
    },
  },
  {
    id: "send-location", topic: "send", screens: ["send"], money: true, action: {target:"send"},
    t: {
      en: {
        q: "Why does GLOOBAL need my location to pay?",
        asks: ["location needed to pay", "turn on location", "location off", "why location", "gps permission", "location blocked", "cant pay because of location", "we couldnt find your location", "location permission"],
        steps: [
          "GLOOBAL checks which country you pay from. It keeps your money safe.",
          "If location is off, the **Send** screen shows **Turn on location** in place of the Send button. Tap it and allow it.",
          "Blocked in your browser? Tap the settings icon next to the web address, tap **Permissions**, and turn **Location** on.",
        ],
      },
      hi: {
        q: "पेमेंट के लिए लोकेशन क्यों चाहिए?",
        asks: ["लोकेशन चालू करो", "लोकेशन क्यों माँग रहा है", "लोकेशन बंद है", "GPS चाहिए क्या", "लोकेशन ब्लॉक है", "बिना लोकेशन पेमेंट", "लोकेशन ऑन कैसे करें", "लोकेशन की वजह से पेमेंट नहीं हो रहा"],
        steps: [
          "GLOOBAL देखता है कि आप किस देश से पेमेंट कर रहे हैं। इससे आपके पैसे सुरक्षित रहते हैं।",
          "लोकेशन बंद हो तो **Send** स्क्रीन पर Send की जगह **Turn on location** दिखता है। उसे दबाएँ और इजाज़त दें।",
          "ब्राउज़र ने ब्लॉक किया है? वेब एड्रेस के पास सेटिंग्स आइकन दबाएँ, **Permissions** दबाएँ, और **Location** चालू करें।",
        ],
      },
      hl: {
        q: "Payment ke liye location kyu chahiye?",
        asks: ["location on karo", "location kyu maang raha hai", "location band hai", "gps chahiye kya", "location block hai", "bina location payment", "location kaise on kare", "location ki wajah se payment nahi ho raha", "lokation"],
        steps: [
          "GLOOBAL dekhta hai ki aap kis country se payment kar rahe ho. Isse aapke paise safe rehte hain.",
          "Location band ho to **Send** screen par Send ki jagah **Turn on location** dikhta hai. Use dabao aur allow karo.",
          "Browser ne block kiya hai? Web address ke paas settings icon dabao, **Permissions** dabao, aur **Location** on karo.",
        ],
      },
      ta: {
        q: "பணம் செலுத்த location ஏன் தேவை?",
        asks: ["location on செய்ய", "location ஏன் கேட்கிறது", "location off ஆக இருக்கு", "GPS தேவையா", "location block ஆனது", "location இல்லாமல் payment", "location எப்படி on செய்வது", "இருப்பிடம் ஏன் கேட்கிறது"],
        steps: [
          "நீங்கள் எந்த நாட்டிலிருந்து பணம் செலுத்துகிறீர்கள் என்று GLOOBAL சரிபார்க்கும். இது உங்கள் பணத்தைப் பாதுகாக்கும்.",
          "Location off ஆக இருந்தால், **Send** திரையில் Send button-க்கு பதிலாக **Turn on location** தெரியும். அதை அழுத்தி அனுமதி கொடுங்கள்.",
          "Browser block செய்துவிட்டதா? Web address அருகில் உள்ள settings icon-ஐ அழுத்தி, **Permissions**-ல் **Location**-ஐ on செய்யுங்கள்.",
        ],
      },
    },
  },
  {
    id: "send-rent", topic: "send", screens: [], money: true,
    t: {
      en: {
        q: "How do I pay my rent every month?",
        asks: ["pay rent", "monthly rent", "rent autopay", "automatic rent payment", "pay my landlord", "rent reminder", "save my rent details", "collect rent from tenant", "accept rent"],
        steps: [
          "On Home, tap **Rent**, then **Add a place** and choose **A place I live**.",
          "Add who you pay (their GLOOBAL ID), how much, and which day.",
          "Choose **Pay by itself** to pay from GLOOBAL Bank on the day, or **Ask me first** for a reminder and one-tap pay.",
          "Collecting rent instead? Choose **A place I'm creating** to see whether it arrived.",
        ],
      },
      hi: {
        q: "हर महीने किराया कैसे दें?",
        asks: ["किराया देना है", "हर महीने का किराया", "किराया अपने आप कटे", "मकान मालिक को पैसे", "रेंट पे करना", "किराए का रिमाइंडर", "किरायेदार से किराया लेना", "रेंट ऑटो पे"],
        steps: [
          "Home पर **Rent** दबाएँ, फिर **Add a place** और **A place I live** चुनें।",
          "किसे देना है (उनकी GLOOBAL ID), कितना और किस दिन — यह भरें।",
          "**Pay by itself** चुनें तो उस दिन GLOOBAL Bank से अपने आप जाएगा, या **Ask me first** चुनें तो याद दिलाया जाएगा और एक टैप में भेज सकेंगे।",
          "आपको किराया मिलता है? तो **A place I'm creating** चुनें, ताकि दिखे कि किराया आया या नहीं।",
        ],
      },
      hl: {
        q: "Har mahine kiraya kaise de?",
        asks: ["kiraya dena hai", "har mahine ka rent", "rent apne aap kate", "makan malik ko paise", "rent pay karna", "kiraye ka reminder", "kirayedar se rent lena", "rent auto pay", "kiraaya", "rent kaise bhare", "kiraya kaise de"],
        steps: [
          "Home par **Rent** dabao, phir **Add a place** aur **A place I live** chuno.",
          "Kisko dena hai (unki GLOOBAL ID), kitna aur kis din — yeh bharo.",
          "**Pay by itself** chuno to us din GLOOBAL Bank se apne aap jayega, ya **Ask me first** chuno to reminder aayega aur ek tap mein bhej sakoge.",
          "Aapko rent milta hai? To **A place I'm creating** chuno, taaki dikhe rent aaya ya nahi.",
        ],
      },
      ta: {
        q: "ஒவ்வொரு மாதமும் வாடகை எப்படி செலுத்துவது?",
        asks: ["வாடகை செலுத்த", "மாத வாடகை", "வாடகை தானாக போக", "வீட்டு உரிமையாளருக்கு பணம்", "rent pay செய்ய", "வாடகை reminder", "வாடகைதாரரிடம் வாடகை வாங்க", "rent autopay"],
        steps: [
          "Home-ல் **Rent** அழுத்தி, பிறகு **Add a place**-ல் **A place I live** தேர்வு செய்யுங்கள்.",
          "யாருக்குச் செலுத்த வேண்டும் (அவருடைய GLOOBAL ID), எவ்வளவு, எந்த நாள் என்று சேர்க்கவும்.",
          "**Pay by itself** தேர்வு செய்தால் அந்த நாளில் GLOOBAL Bank-லிருந்து தானாகப் போகும்; **Ask me first** தேர்வு செய்தால் நினைவூட்டல் வரும், ஒரே tap-ல் செலுத்தலாம்.",
          "உங்களுக்கு வாடகை வருகிறதா? **A place I'm creating** தேர்வு செய்தால் வாடகை வந்ததா என்று பார்க்கலாம்.",
        ],
      },
    },
  },
  {
    id: "scan-pay", topic: "send", screens: ["send"], money: true, action: {target:"scan"},
    t: {
      en: {
        q: "How do I pay by scanning a QR code?",
        asks: ["scan and pay", "scan qr", "pay with qr", "scanner", "scan code to pay", "pay at a shop", "scan not working", "upload qr from gallery", "qr payment"],
        steps: [
          "On Home, tap **Scanner** and allow camera access.",
          "Point it at a GLOOBAL code. Have the QR as a picture? Tap **Upload from gallery**.",
          "Check the name that shows, then type the amount and confirm with your PIN.",
        ],
      },
      hi: {
        q: "QR स्कैन करके पेमेंट कैसे करें?",
        asks: ["स्कैन करके पेमेंट", "QR स्कैन करना", "QR से पैसे भेजें", "स्कैनर कहाँ है", "दुकान पर पेमेंट", "स्कैन नहीं हो रहा", "गैलरी से QR", "क्यूआर कोड पेमेंट", "कैमरा नहीं खुल रहा"],
        steps: [
          "Home पर **Scanner** दबाएँ और कैमरे की इजाज़त दें।",
          "कैमरा GLOOBAL कोड पर रखें। QR फ़ोटो में है? **Upload from gallery** दबाएँ।",
          "जो नाम दिखे उसे जाँच लें, फिर रकम लिखें और PIN से पक्का करें।",
        ],
      },
      hl: {
        q: "QR scan karke payment kaise kare?",
        asks: ["scan karke payment", "qr scan karna", "qr se paise bhejo", "scanner kahan hai", "dukan pe payment", "scan nahi ho raha", "gallery se qr", "qr code payment", "camera nahi khul raha", "skan karke pay"],
        steps: [
          "Home par **Scanner** dabao aur camera allow karo.",
          "Camera GLOOBAL code par rakho. QR photo mein hai? **Upload from gallery** dabao.",
          "Jo naam dikhe use check karo, phir amount likho aur PIN se confirm karo.",
        ],
      },
      ta: {
        q: "QR scan செய்து பணம் செலுத்துவது எப்படி?",
        asks: ["scan செய்து pay", "QR scan செய்ய", "QR மூலம் பணம்", "scanner எங்கே", "கடையில் payment", "scan ஆகவில்லை", "gallery யிலிருந்து QR", "QR code payment", "camera திறக்கவில்லை"],
        steps: [
          "Home-ல் **Scanner** அழுத்தி, camera-க்கு அனுமதி கொடுங்கள்.",
          "GLOOBAL code-ஐ நோக்கி camera-வைக் காட்டுங்கள். QR படமாக இருக்கிறதா? **Upload from gallery** அழுத்துங்கள்.",
          "தெரியும் பெயரைச் சரிபாருங்கள், பிறகு தொகையை type செய்து PIN மூலம் உறுதி செய்யுங்கள்.",
        ],
      },
    },
  },
  // ── RECEIVE ───────────────────────────────────────────────────────────
  {
    id: "receive-qr", topic: "receive", screens: [], money: true, action: {target:"receive"},
    t: {
      en: {
        q: "How do I receive money?",
        asks: ["receive money", "get paid", "my qr code", "show my qr", "share my gloobal id", "how can someone pay me", "collect money", "where is my qr", "get money from a friend", "recieve money"],
        steps: [
          "On Home, tap **Receive**. It shows your GLOOBAL QR and your GLOOBAL ID.",
          "Let them scan the QR, or use the copy or share buttons to send your GLOOBAL ID in any chat.",
          "The money lands in your GLOOBAL balance at once, and you get a notification.",
        ],
      },
      hi: {
        q: "पैसे कैसे मँगाएँ / लें?",
        asks: ["पैसे कैसे लें", "पैसे मँगाने हैं", "मेरा QR कोड", "QR दिखाना है", "अपनी GLOOBAL ID भेजें", "कोई मुझे पैसे कैसे भेजे", "पेमेंट लेना है", "मेरा QR कहाँ है", "दोस्त से पैसे लेने हैं"],
        steps: [
          "Home पर **Receive** दबाएँ। वहाँ आपका GLOOBAL QR और आपकी GLOOBAL ID दिखती है।",
          "सामने वाला QR स्कैन करे, या कॉपी/शेयर बटन से अपनी GLOOBAL ID किसी भी चैट में भेजें।",
          "पैसे तुरंत आपके GLOOBAL बैलेंस में आ जाते हैं, और आपको नोटिफ़िकेशन मिलता है।",
        ],
      },
      hl: {
        q: "Paise kaise mangaye / le?",
        asks: ["paise kaise le", "paise mangane hai", "mera qr code", "qr dikhana hai", "apni gloobal id bhejo", "koi mujhe paise kaise bheje", "payment lena hai", "mera qr kahan hai", "dost se paise lene hai", "paisa receive karna"],
        steps: [
          "Home par **Receive** dabao. Wahan aapka GLOOBAL QR aur aapki GLOOBAL ID dikhti hai.",
          "Saamne wala QR scan kare, ya copy/share button se apni GLOOBAL ID kisi bhi chat mein bhejo.",
          "Paise turant aapke GLOOBAL balance mein aa jaate hain, aur aapko notification milta hai.",
        ],
      },
      ta: {
        q: "பணம் எப்படி பெறுவது?",
        asks: ["பணம் பெற", "பணம் வாங்க", "என் QR code", "QR காட்ட", "என் GLOOBAL ID share செய்ய", "ஒருவர் எனக்கு எப்படி பணம் அனுப்புவது", "payment வாங்க", "என் QR எங்கே", "receive money"],
        steps: [
          "Home-ல் **Receive** அழுத்துங்கள். உங்கள் GLOOBAL QR மற்றும் GLOOBAL ID அங்கே தெரியும்.",
          "அவர் QR-ஐ scan செய்யலாம், அல்லது copy / share button மூலம் உங்கள் GLOOBAL ID-ஐ எந்த chat-லும் அனுப்பலாம்.",
          "பணம் உடனே உங்கள் GLOOBAL balance-ல் வரும்; உங்களுக்கு notification வரும்.",
        ],
      },
    },
  },
  // ── ACCOUNT ───────────────────────────────────────────────────────────
  {
    id: "gloobal-id", topic: "account", screens: [], money: false, action: {target:"receive"},
    t: {
      en: {
        q: "What is my GLOOBAL ID?",
        asks: ["what is gloobal id", "my id", "where is my gloobal id", "how does the id work", "symbols in my id", "how to read my id", "account number", "find my id", "gloobal id meaning"],
        steps: [
          "Your GLOOBAL ID is your address on GLOOBAL: 12 symbols, made from 8 shapes, the same in every language.",
          "People use it to pay you, and you can use it to sign in. It is also your GLOOBAL Bank account number.",
          "Read it aloud in groups of four, like a phone number. You can always find it on **Receive**.",
        ],
      },
      hi: {
        q: "मेरी GLOOBAL ID क्या है?",
        asks: ["GLOOBAL ID क्या है", "मेरी आईडी", "मेरी GLOOBAL ID कहाँ है", "आईडी कैसे काम करती है", "आईडी में निशान क्या हैं", "आईडी कैसे पढ़ें", "अकाउंट नंबर", "मेरी आईडी ढूँढनी है"],
        steps: [
          "GLOOBAL ID, GLOOBAL पर आपका पता है: 12 निशान, 8 आकारों से बने, हर भाषा में एक जैसे।",
          "लोग इसी से आपको पैसे भेजते हैं, और आप इससे लॉग इन भी कर सकते हैं। यही आपका GLOOBAL Bank अकाउंट नंबर भी है।",
          "इसे फ़ोन नंबर की तरह चार-चार के ग्रुप में बोलें। यह हमेशा **Receive** पर मिलती है।",
        ],
      },
      hl: {
        q: "Meri GLOOBAL ID kya hai?",
        asks: ["gloobal id kya hai", "meri id", "meri gloobal id kahan hai", "id kaise kaam karti hai", "id mein symbol kya hai", "id kaise padhe", "account number kya hai", "meri id dhundhni hai", "globle id"],
        steps: [
          "GLOOBAL ID, GLOOBAL par aapka address hai: 12 symbols, 8 shapes se bane, har language mein ek jaise.",
          "Log isi se aapko paise bhejte hain, aur aap isse login bhi kar sakte ho. Yahi aapka GLOOBAL Bank account number bhi hai.",
          "Ise phone number ki tarah chaar-chaar ke group mein bolo. Yeh hamesha **Receive** par milti hai.",
        ],
      },
      ta: {
        q: "என் GLOOBAL ID என்றால் என்ன?",
        asks: ["GLOOBAL ID என்றால் என்ன", "என் ID", "என் GLOOBAL ID எங்கே", "ID எப்படி வேலை செய்கிறது", "ID ல உள்ள குறிகள்", "ID எப்படி படிப்பது", "account number", "என் ID கண்டுபிடிக்க"],
        steps: [
          "GLOOBAL ID என்பது GLOOBAL-ல் உங்கள் முகவரி: 8 வடிவங்களால் ஆன 12 குறிகள், எல்லா மொழியிலும் ஒன்றே.",
          "மற்றவர்கள் இதைக் கொண்டு உங்களுக்குப் பணம் அனுப்புவார்கள்; நீங்கள் இதைக் கொண்டு login செய்யலாம். இதுவே உங்கள் GLOOBAL Bank account number.",
          "Phone number போல நான்கு நான்காகப் பிரித்துச் சொல்லுங்கள். இது எப்போதும் **Receive**-ல் கிடைக்கும்.",
        ],
      },
    },
  },
  {
    id: "account-login", topic: "account", screens: [], money: false,
    t: {
      en: {
        q: "How do I sign in on a new phone?",
        asks: ["login on new phone", "sign in", "changed my phone", "new mobile login", "how to log in", "login with mobile number", "login with gloobal id", "cant login", "log in again"],
        steps: [
          "Open GLOOBAL on the new phone and tap the **Log in** button on the first screen.",
          "Enter your GLOOBAL ID, or switch to your mobile number.",
          "Enter your PIN. Your PIN works on any phone; you can turn on **Biometric login** later in Profile → **Security**.",
        ],
      },
      hi: {
        q: "नए फ़ोन में लॉग इन कैसे करें?",
        asks: ["नए फ़ोन में लॉग इन", "साइन इन कैसे करें", "फ़ोन बदल लिया", "नया मोबाइल", "लॉगिन कैसे करें", "मोबाइल नंबर से लॉगिन", "GLOOBAL ID से लॉगिन", "लॉगिन नहीं हो रहा"],
        steps: [
          "नए फ़ोन में GLOOBAL खोलें और पहली स्क्रीन पर **Log in** बटन दबाएँ।",
          "अपनी GLOOBAL ID डालें, या मोबाइल नंबर पर स्विच करें।",
          "अपना PIN डालें। PIN हर फ़ोन पर चलता है; बाद में Profile → **Security** में **Biometric login** चालू कर सकते हैं।",
        ],
      },
      hl: {
        q: "Naye phone mein login kaise kare?",
        asks: ["naye phone me login", "sign in kaise kare", "phone badal liya", "naya mobile login", "login kaise kare", "mobile number se login", "gloobal id se login", "login nahi ho raha", "lagin kaise kare"],
        steps: [
          "Naye phone mein GLOOBAL kholo aur pehli screen par **Log in** button dabao.",
          "Apni GLOOBAL ID daalo, ya mobile number par switch karo.",
          "Apna PIN daalo. PIN har phone par chalta hai; baad mein Profile → **Security** mein **Biometric login** on kar sakte ho.",
        ],
      },
      ta: {
        q: "புதிய phone-ல் login செய்வது எப்படி?",
        asks: ["புதிய phone ல login", "sign in செய்ய", "phone மாற்றிவிட்டேன்", "புது mobile login", "login எப்படி", "mobile number மூலம் login", "GLOOBAL ID மூலம் login", "login ஆகவில்லை"],
        steps: [
          "புதிய phone-ல் GLOOBAL-ஐத் திறந்து, முதல் திரையில் உள்ள **Log in** button-ஐ அழுத்துங்கள்.",
          "உங்கள் GLOOBAL ID-ஐ உள்ளிடுங்கள், அல்லது mobile number-க்கு மாற்றுங்கள்.",
          "உங்கள் PIN-ஐ உள்ளிடுங்கள். PIN எந்த phone-லும் வேலை செய்யும்; பின்னர் Profile → **Security**-ல் **Biometric login**-ஐ on செய்யலாம்.",
        ],
      },
    },
  },
  {
    id: "account-security", topic: "account", screens: [], money: false, action: {target:"security"},
    t: {
      en: {
        q: "How do I change my PIN or lock the app?",
        asks: ["change pin", "new pin", "app lock", "fingerprint login", "face id", "security settings", "pin locked", "wrong pin too many times", "turn on biometric", "passkey"],
        steps: [
          "Go to Profile → **Security**.",
          "Tap **Change PIN**. You need your current PIN to set a new one.",
          "Turn on **App lock** to ask for your PIN again after 5 minutes away, and **Biometric login** to use fingerprint or Face ID.",
          "Never share your PIN. Too many wrong tries lock it for a while.",
        ],
      },
      hi: {
        q: "PIN कैसे बदलें या ऐप लॉक कैसे करें?",
        asks: ["PIN बदलना है", "नया PIN", "ऐप लॉक", "फ़िंगरप्रिंट से लॉगिन", "फेस आईडी", "सिक्योरिटी सेटिंग", "PIN लॉक हो गया", "गलत PIN बार बार", "बायोमेट्रिक चालू"],
        steps: [
          "Profile → **Security** में जाएँ।",
          "**Change PIN** दबाएँ। नया PIN बनाने के लिए पुराना PIN चाहिए।",
          "**App lock** चालू करें ताकि 5 मिनट दूर रहने के बाद PIN फिर माँगा जाए, और **Biometric login** से फ़िंगरप्रिंट या Face ID इस्तेमाल करें।",
          "अपना PIN कभी किसी को न बताएँ। बहुत बार गलत PIN डालने पर वह कुछ देर के लिए लॉक हो जाता है।",
        ],
      },
      hl: {
        q: "PIN kaise badle ya app lock kaise kare?",
        asks: ["pin badalna hai", "naya pin", "app lock kaise kare", "fingerprint se login", "face id", "security setting", "pin lock ho gaya", "galat pin baar baar", "biometric on karo", "pin change"],
        steps: [
          "Profile → **Security** mein jao.",
          "**Change PIN** dabao. Naya PIN banane ke liye purana PIN chahiye.",
          "**App lock** on karo taaki 5 minute door rehne ke baad PIN phir maange, aur **Biometric login** se fingerprint ya Face ID use karo.",
          "Apna PIN kabhi kisi ko mat batao. Bahut baar galat PIN daalne par woh kuch der ke liye lock ho jaata hai.",
        ],
      },
      ta: {
        q: "PIN மாற்றுவது அல்லது app lock செய்வது எப்படி?",
        asks: ["PIN மாற்ற", "புதிய PIN", "app lock", "fingerprint login", "face id", "security settings", "PIN lock ஆனது", "தவறான PIN பல முறை", "biometric on செய்ய"],
        steps: [
          "Profile → **Security**-க்குச் செல்லுங்கள்.",
          "**Change PIN** அழுத்துங்கள். புதிய PIN வைக்க உங்கள் தற்போதைய PIN தேவை.",
          "5 நிமிடம் வெளியே சென்ற பின் மீண்டும் PIN கேட்க **App lock**-ஐ on செய்யுங்கள்; fingerprint அல்லது Face ID-க்கு **Biometric login**-ஐ on செய்யுங்கள்.",
          "உங்கள் PIN-ஐ யாரிடமும் சொல்லாதீர்கள். பல முறை தவறான PIN போட்டால் சிறிது நேரம் lock ஆகிவிடும்.",
        ],
      },
    },
  },
  {
    id: "account-history", topic: "account", screens: [], money: false, action: {target:"history"},
    t: {
      en: {
        q: "Where can I see my payments and receipts?",
        asks: ["payment history", "transaction history", "my receipts", "see old payments", "statement", "where is my receipt", "download receipt", "share receipt", "past transactions"],
        steps: [
          "Go to Profile → **History**. Switch between **Paid** and **Received**, and pick a period.",
          "Tap any payment to open its receipt: who, how much, when, and where the payment is.",
          "From the receipt you can **Share** it, or tap **Complain** if something went wrong.",
        ],
      },
      hi: {
        q: "मेरे पेमेंट और रसीदें कहाँ दिखेंगी?",
        asks: ["पेमेंट हिस्ट्री", "लेन-देन देखना", "मेरी रसीद", "पुराने पेमेंट", "स्टेटमेंट", "रसीद कहाँ है", "रसीद शेयर करनी है", "ट्रांजैक्शन हिस्ट्री"],
        steps: [
          "Profile → **History** में जाएँ। **Paid** और **Received** के बीच बदलें, और समय चुनें।",
          "किसी भी पेमेंट पर टैप करके उसकी रसीद खोलें: किसको, कितना, कब, और पेमेंट कहाँ है।",
          "रसीद से आप उसे **Share** कर सकते हैं, या कुछ गलत हो तो **Complain** दबा सकते हैं।",
        ],
      },
      hl: {
        q: "Mere payments aur receipts kahan dikhenge?",
        asks: ["payment history", "len den dekhna", "meri receipt", "purane payment", "statement chahiye", "receipt kahan hai", "receipt share karni hai", "transaction history", "raseed"],
        steps: [
          "Profile → **History** mein jao. **Paid** aur **Received** ke beech switch karo, aur time period chuno.",
          "Kisi bhi payment par tap karke uski receipt kholo: kisko, kitna, kab, aur payment kahan hai.",
          "Receipt se aap use **Share** kar sakte ho, ya kuch galat ho to **Complain** daba sakte ho.",
        ],
      },
      ta: {
        q: "என் payments மற்றும் receipts எங்கே பார்ப்பது?",
        asks: ["payment history", "transaction history", "என் receipt", "பழைய payments", "statement", "receipt எங்கே", "receipt share செய்ய", "பரிவர்த்தனை வரலாறு"],
        steps: [
          "Profile → **History**-க்குச் செல்லுங்கள். **Paid**, **Received** இடையே மாற்றி, காலத்தைத் தேர்வு செய்யுங்கள்.",
          "எந்த payment-ஐ tap செய்தாலும் அதன் receipt திறக்கும்: யாருக்கு, எவ்வளவு, எப்போது, payment எங்கே உள்ளது.",
          "Receipt-லிருந்து அதை **Share** செய்யலாம், அல்லது ஏதாவது தவறு என்றால் **Complain** அழுத்தலாம்.",
        ],
      },
    },
  },
  {
    id: "account-notifications", topic: "account", screens: [], money: false, action: {target:"notifications"},
    t: {
      en: {
        q: "How do I get notified when money comes in?",
        asks: ["notifications", "turn on notifications", "no alert when money comes", "push notification", "payment alert", "notifications blocked", "not getting notifications", "enable alerts"],
        steps: [
          "Go to Profile → **Notifications**.",
          "Tap **Enable** and allow notifications when your phone asks. You'll be told when money arrives, even when GLOOBAL is closed.",
          "If it says notifications are blocked, turn them on for this site in your browser settings.",
          "The list keeps your latest notices; **History** keeps every payment.",
        ],
      },
      hi: {
        q: "पैसे आने पर नोटिफ़िकेशन कैसे मिले?",
        asks: ["नोटिफ़िकेशन चालू करें", "पैसे आने का अलर्ट", "नोटिफ़िकेशन नहीं आ रहे", "पुश नोटिफ़िकेशन", "पेमेंट अलर्ट", "नोटिफ़िकेशन ब्लॉक है", "मैसेज नहीं आता"],
        steps: [
          "Profile → **Notifications** में जाएँ।",
          "**Enable** दबाएँ और फ़ोन पूछे तो इजाज़त दें। GLOOBAL बंद हो तब भी पैसे आने पर आपको बताया जाएगा।",
          "अगर लिखा है कि नोटिफ़िकेशन ब्लॉक हैं, तो ब्राउज़र की सेटिंग में इस साइट के लिए उन्हें चालू करें।",
          "इस लिस्ट में हाल के नोटिस रहते हैं; हर पेमेंट **History** में रहता है।",
        ],
      },
      hl: {
        q: "Paise aane par notification kaise mile?",
        asks: ["notification on karo", "paise aane ka alert", "notification nahi aa rahe", "push notification", "payment alert", "notification block hai", "message nahi aata", "notifcation"],
        steps: [
          "Profile → **Notifications** mein jao.",
          "**Enable** dabao aur phone pooche to allow karo. GLOOBAL band ho tab bhi paise aane par aapko bataya jayega.",
          "Agar likha hai notifications blocked hain, to browser settings mein is site ke liye on karo.",
          "Is list mein haal ke notice rehte hain; har payment **History** mein rehta hai.",
        ],
      },
      ta: {
        q: "பணம் வந்தால் notification எப்படி பெறுவது?",
        asks: ["notification on செய்ய", "பணம் வந்த alert", "notification வரவில்லை", "push notification", "payment alert", "notification block", "அறிவிப்பு வரவில்லை"],
        steps: [
          "Profile → **Notifications**-க்குச் செல்லுங்கள்.",
          "**Enable** அழுத்தி, phone கேட்கும்போது அனுமதி கொடுங்கள். GLOOBAL மூடியிருந்தாலும் பணம் வந்தால் உங்களுக்குத் தெரிவிக்கப்படும்.",
          "Notifications block என்று வந்தால், browser settings-ல் இந்த site-க்கு on செய்யுங்கள்.",
          "இந்தப் பட்டியலில் சமீபத்திய அறிவிப்புகள் இருக்கும்; ஒவ்வொரு payment-ம் **History**-ல் இருக்கும்.",
        ],
      },
    },
  },
  {
    id: "account-hold", topic: "account", screens: ["send","bank","shop"], money: true, action: {target:"help"},
    t: {
      en: {
        q: "Why is my account on hold?",
        asks: ["account on hold", "account blocked", "payments from this account are paused", "cant send anything", "account frozen", "sending to bank paused", "account restricted", "why is my account paused", "account suspended"],
        steps: [
          "The GLOOBAL team can pause part of an account: sending money, sending to a bank, or a shop.",
          "You can still sign in and receive money.",
          "To find out more, go to Profile → **Help & Support** → **Chat with us** and pick **My account**. A person will reply.",
        ],
      },
      hi: {
        q: "मेरा अकाउंट होल्ड पर क्यों है?",
        asks: ["अकाउंट होल्ड पर है", "अकाउंट बंद हो गया", "अकाउंट ब्लॉक", "पैसे नहीं भेज पा रहा", "अकाउंट रुका हुआ है", "बैंक में भेजना बंद", "अकाउंट फ्रीज़", "पेमेंट paused है"],
        steps: [
          "GLOOBAL टीम अकाउंट का कोई हिस्सा रोक सकती है: पैसे भेजना, बैंक में भेजना, या दुकान।",
          "आप फिर भी लॉग इन कर सकते हैं और पैसे पा सकते हैं।",
          "ज़्यादा जानने के लिए Profile → **Help & Support** → **Chat with us** में **My account** चुनें। एक व्यक्ति जवाब देगा।",
        ],
      },
      hl: {
        q: "Mera account hold par kyu hai?",
        asks: ["account hold par hai", "account band ho gaya", "account block ho gaya", "paise nahi bhej pa raha", "account ruka hua hai", "bank me bhejna band", "account freeze", "payment paused hai", "acount hold"],
        steps: [
          "GLOOBAL team account ka koi hissa rok sakti hai: paise bhejna, bank mein bhejna, ya shop.",
          "Aap phir bhi login kar sakte ho aur paise le sakte ho.",
          "Zyada jaanne ke liye Profile → **Help & Support** → **Chat with us** mein **My account** chuno. Ek person reply karega.",
        ],
      },
      ta: {
        q: "என் கணக்கு ஏன் hold-ல் உள்ளது?",
        asks: ["account hold", "account block", "கணக்கு நிறுத்தப்பட்டது", "பணம் அனுப்ப முடியவில்லை", "account freeze", "bank க்கு அனுப்புவது நிறுத்தம்", "account paused", "கணக்கு முடக்கம்"],
        steps: [
          "GLOOBAL குழு கணக்கின் ஒரு பகுதியை நிறுத்தலாம்: பணம் அனுப்புவது, வங்கிக்கு அனுப்புவது, அல்லது கடை.",
          "நீங்கள் இன்னும் login செய்யலாம், பணமும் பெறலாம்.",
          "மேலும் அறிய Profile → **Help & Support** → **Chat with us**-ல் **My account** தேர்வு செய்யுங்கள். ஒருவர் பதில் சொல்வார்.",
        ],
      },
    },
  },
  {
    id: "account-safe", topic: "account", screens: [], money: true, action: {target:"security"},
    t: {
      en: {
        q: "Is my money safe on GLOOBAL?",
        asks: ["is my money safe", "is gloobal safe", "someone used my account", "account hacked", "fraud", "is it secure", "protect my account", "can someone steal my money", "scam"],
        steps: [
          "Every payment needs your PIN, plus fingerprint or Face ID where your phone has it. Too many wrong PINs lock it for a while.",
          "GLOOBAL checks which country you pay from before money moves.",
          "Turn on **App lock** in Profile → **Security**. If someone else used your account, change your PIN now and chat with us.",
        ],
      },
      hi: {
        q: "क्या GLOOBAL पर मेरे पैसे सुरक्षित हैं?",
        asks: ["पैसे सुरक्षित हैं क्या", "GLOOBAL सेफ है", "किसी ने मेरा अकाउंट इस्तेमाल किया", "अकाउंट हैक", "धोखाधड़ी", "फ्रॉड", "अकाउंट कैसे बचाएँ", "पैसे चोरी तो नहीं होंगे"],
        steps: [
          "हर पेमेंट के लिए आपका PIN चाहिए, और फ़ोन में हो तो फ़िंगरप्रिंट या Face ID भी। बहुत बार गलत PIN पर वह कुछ देर लॉक हो जाता है।",
          "पैसे भेजने से पहले GLOOBAL देखता है कि आप किस देश से पेमेंट कर रहे हैं।",
          "Profile → **Security** में **App lock** चालू करें। अगर किसी और ने आपका अकाउंट इस्तेमाल किया है, तो अभी PIN बदलें और हमसे चैट करें।",
        ],
      },
      hl: {
        q: "Kya GLOOBAL par mere paise safe hain?",
        asks: ["paise safe hai kya", "gloobal safe hai", "kisi ne mera account use kiya", "account hack ho gaya", "dhokha", "fraud", "account kaise bachaye", "paise chori to nahi honge", "sef hai kya"],
        steps: [
          "Har payment ke liye aapka PIN chahiye, aur phone mein ho to fingerprint ya Face ID bhi. Bahut baar galat PIN par woh kuch der lock ho jaata hai.",
          "Paise bhejne se pehle GLOOBAL dekhta hai ki aap kis country se payment kar rahe ho.",
          "Profile → **Security** mein **App lock** on karo. Agar kisi aur ne aapka account use kiya hai, to abhi PIN badlo aur humse chat karo.",
        ],
      },
      ta: {
        q: "GLOOBAL-ல் என் பணம் பாதுகாப்பாக உள்ளதா?",
        asks: ["பணம் பாதுகாப்பா", "GLOOBAL safe ஆ", "வேறொருவர் என் கணக்கைப் பயன்படுத்தினார்", "account hack", "மோசடி", "fraud", "கணக்கை எப்படி பாதுகாப்பது", "பணம் திருடப்படுமா"],
        steps: [
          "ஒவ்வொரு payment-க்கும் உங்கள் PIN தேவை; phone-ல் இருந்தால் fingerprint அல்லது Face ID-யும். பல முறை தவறான PIN போட்டால் சிறிது நேரம் lock ஆகும்.",
          "பணம் நகரும் முன், நீங்கள் எந்த நாட்டிலிருந்து செலுத்துகிறீர்கள் என்று GLOOBAL சரிபார்க்கும்.",
          "Profile → **Security**-ல் **App lock**-ஐ on செய்யுங்கள். வேறொருவர் உங்கள் கணக்கைப் பயன்படுத்தியிருந்தால், உடனே PIN-ஐ மாற்றி எங்களிடம் chat செய்யுங்கள்.",
        ],
      },
    },
  },
  {
    id: "account-privacy", topic: "account", screens: [], money: false,
    t: {
      en: {
        q: "Who can see my chats and details?",
        asks: ["who sees my data", "privacy", "can gloobal read my chat", "who can see my complaint", "is my selfie stored", "hide my balance", "my personal data", "data safe"],
        steps: [
          "A complaint chat is only between you and the other person. GLOOBAL support sees it only if the case is handed to them.",
          "Help & Support chats are read by the GLOOBAL team, so they can help you.",
          "The selfie for opening GLOOBAL Bank stays on your phone. Tap the eye on your balance to hide it.",
        ],
      },
      hi: {
        q: "मेरी चैट और जानकारी कौन देख सकता है?",
        asks: ["मेरा डेटा कौन देखता है", "प्राइवेसी", "GLOOBAL मेरी चैट पढ़ता है क्या", "शिकायत कौन देखता है", "सेल्फी कहाँ जाती है", "बैलेंस छुपाना है", "मेरी निजी जानकारी"],
        steps: [
          "शिकायत की चैट सिर्फ़ आपके और सामने वाले के बीच होती है। केस सौंपे जाने पर ही GLOOBAL सपोर्ट उसे देखता है।",
          "Help & Support की चैट GLOOBAL टीम पढ़ती है, ताकि आपकी मदद कर सके।",
          "GLOOBAL Bank खोलते समय ली गई सेल्फी आपके फ़ोन पर ही रहती है। बैलेंस छुपाने के लिए उस पर आँख वाला निशान दबाएँ।",
        ],
      },
      hl: {
        q: "Meri chat aur details kaun dekh sakta hai?",
        asks: ["mera data kaun dekhta hai", "privacy", "gloobal meri chat padhta hai kya", "complaint kaun dekhta hai", "selfie kahan jaati hai", "balance chupana hai", "meri personal details", "data safe hai"],
        steps: [
          "Complaint ki chat sirf aapke aur saamne wale ke beech hoti hai. Case saunpne par hi GLOOBAL support use dekhta hai.",
          "Help & Support ki chat GLOOBAL team padhti hai, taaki aapki madad kar sake.",
          "GLOOBAL Bank kholte waqt li gayi selfie aapke phone par hi rehti hai. Balance chupane ke liye uspar aankh wala icon dabao.",
        ],
      },
      ta: {
        q: "என் chat-களையும் விவரங்களையும் யார் பார்க்க முடியும்?",
        asks: ["என் data யார் பார்ப்பார்கள்", "privacy", "GLOOBAL என் chat படிக்குமா", "புகாரை யார் பார்ப்பார்கள்", "selfie எங்கே சேமிக்கப்படும்", "balance மறைக்க", "என் தனிப்பட்ட விவரங்கள்"],
        steps: [
          "புகார் chat உங்களுக்கும் மற்றவருக்கும் மட்டுமே. Case ஒப்படைக்கப்பட்டால் மட்டுமே GLOOBAL support அதைப் பார்க்கும்.",
          "Help & Support chat-களை உங்களுக்கு உதவ GLOOBAL குழு படிக்கும்.",
          "GLOOBAL Bank திறக்க எடுத்த selfie உங்கள் phone-லேயே இருக்கும். Balance-ஐ மறைக்க அதன் மேல் உள்ள கண் icon-ஐ அழுத்துங்கள்.",
        ],
      },
    },
  },
  {
    id: "account-referral", topic: "account", screens: [], money: false, action: {target:"referral"},
    t: {
      en: {
        q: "How do referrals work?",
        asks: ["referral", "invite friends", "refer a friend", "referral code", "my referral network", "who joined with my id", "share referral link", "refferal"],
        steps: [
          "Share your GLOOBAL ID. When someone signs up, they can type it in the **Referral Code** step.",
          "They then show as yours in Profile → **My Referral Network**.",
          "Nothing is taken from what they pay. The referral step is optional for them.",
        ],
      },
      hi: {
        q: "रेफ़रल कैसे काम करता है?",
        asks: ["रेफ़रल", "दोस्तों को बुलाना", "रेफ़र करना", "रेफ़रल कोड", "मेरा रेफ़रल नेटवर्क", "मेरी आईडी से कौन जुड़ा", "इनवाइट करना"],
        steps: [
          "अपनी GLOOBAL ID शेयर करें। कोई साइन अप करते समय **Referral Code** वाले कदम में उसे डाल सकता है।",
          "फिर वह Profile → **My Referral Network** में आपके नाम से दिखेगा।",
          "उनके पेमेंट में से कुछ नहीं कटता। रेफ़रल डालना उनके लिए ज़रूरी नहीं है।",
        ],
      },
      hl: {
        q: "Referral kaise kaam karta hai?",
        asks: ["referral kya hai", "doston ko invite", "refer kaise kare", "referral code", "mera referral network", "meri id se kaun juda", "invite karna hai", "refral"],
        steps: [
          "Apni GLOOBAL ID share karo. Koi sign up karte waqt **Referral Code** wale step mein use daal sakta hai.",
          "Phir woh Profile → **My Referral Network** mein aapke naam se dikhega.",
          "Unke payment mein se kuch nahi katta. Referral daalna unke liye zaroori nahi hai.",
        ],
      },
      ta: {
        q: "Referral எப்படி வேலை செய்கிறது?",
        asks: ["referral", "நண்பர்களை அழைக்க", "refer செய்ய", "referral code", "என் referral network", "என் ID மூலம் யார் சேர்ந்தார்கள்", "invite செய்ய"],
        steps: [
          "உங்கள் GLOOBAL ID-ஐ share செய்யுங்கள். ஒருவர் sign up செய்யும்போது **Referral Code** படியில் அதை type செய்யலாம்.",
          "பிறகு அவர் Profile → **My Referral Network**-ல் உங்களுடையவராகத் தெரிவார்.",
          "அவர்கள் செலுத்தும் பணத்திலிருந்து எதுவும் எடுக்கப்படாது. Referral படி அவர்களுக்குக் கட்டாயமில்லை.",
        ],
      },
    },
  },
  // ── BANK ──────────────────────────────────────────────────────────────
  {
    id: "bank-what", topic: "bank", screens: ["bank"], money: true, action: {target:"bank"},
    t: {
      en: {
        q: "How does GLOOBAL Bank work?",
        asks: ["what is gloobal bank", "gloobal bank", "how does the bank work", "my bank account", "bank balance", "move money to my bank", "where is gloobal bank", "bank account number"],
        steps: [
          "GLOOBAL Bank is your GLOOBAL account. Open it from the **Accounts** tab, or tap **Add Bank** on Home.",
          "Use **Add money** to bring money in, and **Send to bank** to move it out to a bank account you link.",
          "Money going out shows **Processing** until your bank confirms. If a bank sends it back, it returns to your balance by itself.",
        ],
      },
      hi: {
        q: "GLOOBAL Bank कैसे काम करता है?",
        asks: ["GLOOBAL Bank क्या है", "बैंक कैसे काम करता है", "मेरा बैंक अकाउंट", "बैंक बैलेंस", "बैंक में पैसे भेजना", "GLOOBAL Bank कहाँ है", "बैंक अकाउंट नंबर"],
        steps: [
          "GLOOBAL Bank आपका GLOOBAL खाता है। इसे **Accounts** टैब से खोलें, या Home पर **Add Bank** दबाएँ।",
          "पैसे डालने के लिए **Add money**, और लिंक किए बैंक खाते में निकालने के लिए **Send to bank** इस्तेमाल करें।",
          "बाहर जाते पैसे पर बैंक की पुष्टि तक **Processing** दिखता है। अगर बैंक पैसे लौटा दे, तो वे अपने आप आपके बैलेंस में आ जाते हैं।",
        ],
      },
      hl: {
        q: "GLOOBAL Bank kaise kaam karta hai?",
        asks: ["gloobal bank kya hai", "bank kaise kaam karta hai", "mera bank account", "bank balance", "bank me paise bhejna", "gloobal bank kahan hai", "bank account number", "globel bank"],
        steps: [
          "GLOOBAL Bank aapka GLOOBAL account hai. Ise **Accounts** tab se kholo, ya Home par **Add Bank** dabao.",
          "Paise daalne ke liye **Add money**, aur link kiye bank account mein nikalne ke liye **Send to bank** use karo.",
          "Bahar jaate paise par bank confirm kare tab tak **Processing** dikhta hai. Agar bank paise lauta de, to woh apne aap aapke balance mein aa jaate hain.",
        ],
      },
      ta: {
        q: "GLOOBAL Bank எப்படி வேலை செய்கிறது?",
        asks: ["GLOOBAL Bank என்றால் என்ன", "bank எப்படி வேலை செய்கிறது", "என் bank account", "bank balance", "என் வங்கிக்கு பணம் அனுப்ப", "GLOOBAL Bank எங்கே", "account number"],
        steps: [
          "GLOOBAL Bank என்பது உங்கள் GLOOBAL கணக்கு. **Accounts** tab-லிருந்து திறங்கள், அல்லது Home-ல் **Add Bank** அழுத்துங்கள்.",
          "பணம் சேர்க்க **Add money**, நீங்கள் link செய்த வங்கிக் கணக்குக்கு அனுப்ப **Send to bank** பயன்படுத்துங்கள்.",
          "வெளியே போகும் பணம், வங்கி உறுதி செய்யும் வரை **Processing** என்று காட்டும். வங்கி திருப்பி அனுப்பினால், அது தானாக உங்கள் balance-க்கு வரும்.",
        ],
      },
    },
  },
  {
    id: "bank-open", topic: "bank", screens: ["bank"], money: false, action: {target:"bank"},
    t: {
      en: {
        q: "How do I open my GLOOBAL Bank account?",
        asks: ["open gloobal bank", "open bank account", "create bank account", "finish opening my account", "kyc", "nominee", "continue bank opening", "how long to open account"],
        steps: [
          "Go to **Accounts** → **GLOOBAL Bank** and tap **Open account**. It takes about 5 minutes with your ID.",
          "Go through the steps: About you, Your ID, Selfie, Nominee, Review, and confirm with your PIN.",
          "Need a break? Tap **Save & exit** and continue later from the same card.",
          "Your GLOOBAL ID becomes your account number.",
        ],
      },
      hi: {
        q: "GLOOBAL Bank खाता कैसे खोलें?",
        asks: ["GLOOBAL Bank खोलना है", "बैंक खाता खोलें", "अकाउंट खोलना", "KYC करना है", "नॉमिनी", "बैंक खोलना बाकी है", "अकाउंट खोलने में कितना टाइम"],
        steps: [
          "**Accounts** → **GLOOBAL Bank** में जाकर **Open account** दबाएँ। आपकी ID के साथ लगभग 5 मिनट लगते हैं।",
          "ये कदम पूरे करें: About you, Your ID, Selfie, Nominee, Review, और फिर PIN से पक्का करें।",
          "बीच में रुकना है? **Save & exit** दबाएँ और बाद में उसी कार्ड से आगे बढ़ें।",
          "आपकी GLOOBAL ID ही आपका अकाउंट नंबर बन जाती है।",
        ],
      },
      hl: {
        q: "GLOOBAL Bank account kaise khole?",
        asks: ["gloobal bank kholna hai", "bank account kholo", "account kholna", "kyc karna hai", "nominee kya hai", "bank kholna baaki hai", "account kholne me kitna time", "bank acount open"],
        steps: [
          "**Accounts** → **GLOOBAL Bank** mein jaakar **Open account** dabao. Aapki ID ke saath lagbhag 5 minute lagte hain.",
          "Yeh steps poore karo: About you, Your ID, Selfie, Nominee, Review, aur phir PIN se confirm karo.",
          "Beech mein rukna hai? **Save & exit** dabao aur baad mein usi card se aage badho.",
          "Aapki GLOOBAL ID hi aapka account number ban jaati hai.",
        ],
      },
      ta: {
        q: "GLOOBAL Bank கணக்கை எப்படி திறப்பது?",
        asks: ["GLOOBAL Bank திறக்க", "bank account திறக்க", "கணக்கு திறக்க", "KYC", "nominee", "bank திறப்பது பாதியில் உள்ளது", "கணக்கு திறக்க எவ்வளவு நேரம்"],
        steps: [
          "**Accounts** → **GLOOBAL Bank**-ல் **Open account** அழுத்துங்கள். உங்கள் ID-யுடன் சுமார் 5 நிமிடம் ஆகும்.",
          "இந்தப் படிகளை முடியுங்கள்: About you, Your ID, Selfie, Nominee, Review, பிறகு PIN மூலம் உறுதி செய்யுங்கள்.",
          "இடைவேளை வேண்டுமா? **Save & exit** அழுத்தி, பின்னர் அதே card-லிருந்து தொடருங்கள்.",
          "உங்கள் GLOOBAL ID-யே உங்கள் account number ஆகும்.",
        ],
      },
    },
  },
  {
    id: "bank-link", topic: "bank", screens: ["bank"], money: true, action: {target:"bank"},
    t: {
      en: {
        q: "How do I link my bank account?",
        asks: ["link bank account", "add bank account", "connect my bank", "link upi id", "add ifsc", "link another bank", "verify my bank account", "linked banks"],
        steps: [
          "Open **GLOOBAL Bank**, tap **Link another bank**, and pick your bank.",
          "Follow **Verify it's your account**. The app checks that the name at the bank matches yours.",
          "Only accounts in your own name can be linked. You can also add one while sending: **Send to bank** → **Add a bank account**.",
        ],
      },
      hi: {
        q: "अपना बैंक खाता कैसे लिंक करें?",
        asks: ["बैंक खाता लिंक करना", "बैंक अकाउंट जोड़ना", "बैंक कनेक्ट करें", "UPI ID लिंक", "IFSC डालना", "दूसरा बैंक जोड़ना", "बैंक वेरिफ़ाई"],
        steps: [
          "**GLOOBAL Bank** खोलें, **Link another bank** दबाएँ और अपना बैंक चुनें।",
          "**Verify it's your account** के कदम पूरे करें। ऐप देखता है कि बैंक में नाम आपके नाम से मिलता है।",
          "सिर्फ़ आपके अपने नाम के खाते जुड़ सकते हैं। पैसे भेजते समय भी जोड़ सकते हैं: **Send to bank** → **Add a bank account**।",
        ],
      },
      hl: {
        q: "Apna bank account kaise link kare?",
        asks: ["bank account link karna", "bank account jodna", "bank connect karo", "upi id link", "ifsc daalna", "dusra bank jodna", "bank verify karna", "bank lnk"],
        steps: [
          "**GLOOBAL Bank** kholo, **Link another bank** dabao aur apna bank chuno.",
          "**Verify it's your account** ke steps poore karo. App check karta hai ki bank mein naam aapke naam se milta hai.",
          "Sirf aapke apne naam ke account jud sakte hain. Paise bhejte waqt bhi jod sakte ho: **Send to bank** → **Add a bank account**.",
        ],
      },
      ta: {
        q: "என் வங்கிக் கணக்கை எப்படி link செய்வது?",
        asks: ["bank account link செய்ய", "bank account சேர்க்க", "bank connect", "UPI ID link", "IFSC சேர்க்க", "இன்னொரு bank link", "bank verify செய்ய"],
        steps: [
          "**GLOOBAL Bank** திறந்து, **Link another bank** அழுத்தி, உங்கள் வங்கியைத் தேர்வு செய்யுங்கள்.",
          "**Verify it's your account** படிகளைப் பின்பற்றுங்கள். வங்கியில் உள்ள பெயர் உங்கள் பெயருடன் பொருந்துகிறதா என்று app சரிபார்க்கும்.",
          "உங்கள் சொந்தப் பெயரில் உள்ள கணக்குகள் மட்டுமே link ஆகும். அனுப்பும்போதும் சேர்க்கலாம்: **Send to bank** → **Add a bank account**.",
        ],
      },
    },
  },
  {
    id: "bank-withdraw", topic: "bank", screens: ["bank"], money: true, action: {target:"bank"}, tour: "bank-withdraw",
    t: {
      en: {
        q: "How do I withdraw money to my bank?",
        asks: ["withdraw money", "withdraw to bank", "send money to my bank", "cash out", "transfer to my bank account", "move balance to bank", "take money out", "withdrawl", "payout to bank"],
        steps: [
          "Open **GLOOBAL Bank** and tap **Send to bank**.",
          "Type the amount and pick your bank account, or tap **Add a bank account** (it must be in your name). Tap **Continue**.",
          "Check the details, enter your GLOOBAL PIN, and tap **Send**.",
          "It shows **Processing** until your bank confirms. Find it any time under **Bank transfers**.",
        ],
      },
      hi: {
        q: "अपने बैंक में पैसे कैसे निकालें?",
        asks: ["पैसे निकालना है", "बैंक में पैसे निकालें", "अपने बैंक में पैसे भेजें", "विदड्रॉ कैसे करें", "बैलेंस बैंक में डालना", "पैसे बाहर निकालना", "बैंक ट्रांसफर करना है", "कैश आउट"],
        steps: [
          "**GLOOBAL Bank** खोलें और **Send to bank** दबाएँ।",
          "रकम लिखें और अपना बैंक खाता चुनें, या **Add a bank account** दबाएँ (खाता आपके नाम का हो)। **Continue** दबाएँ।",
          "जानकारी जाँचें, अपना GLOOBAL PIN डालें और **Send** दबाएँ।",
          "बैंक की पुष्टि तक **Processing** दिखता है। इसे कभी भी **Bank transfers** में देख सकते हैं।",
        ],
      },
      hl: {
        q: "Apne bank mein paise kaise nikale?",
        asks: ["paise nikalna hai", "bank me paise nikalo", "apne bank me paise bhejo", "withdraw kaise kare", "balance bank me daalna", "paise bahar nikalna", "bank transfer karna hai", "cash out", "paisa nikale"],
        steps: [
          "**GLOOBAL Bank** kholo aur **Send to bank** dabao.",
          "Amount likho aur apna bank account chuno, ya **Add a bank account** dabao (account aapke naam ka ho). **Continue** dabao.",
          "Details check karo, apna GLOOBAL PIN daalo aur **Send** dabao.",
          "Bank confirm kare tab tak **Processing** dikhta hai. Ise kabhi bhi **Bank transfers** mein dekh sakte ho.",
        ],
      },
      ta: {
        q: "என் வங்கிக்கு பணம் எப்படி எடுப்பது?",
        asks: ["பணம் எடுக்க", "bank க்கு withdraw", "என் வங்கிக்கு பணம் அனுப்ப", "withdraw செய்வது எப்படி", "balance ஐ bank க்கு மாற்ற", "பணத்தை வெளியே எடுக்க", "bank transfer", "cash out"],
        steps: [
          "**GLOOBAL Bank** திறந்து **Send to bank** அழுத்துங்கள்.",
          "தொகையை type செய்து உங்கள் வங்கிக் கணக்கைத் தேர்வு செய்யுங்கள், அல்லது **Add a bank account** அழுத்துங்கள் (உங்கள் பெயரில் இருக்க வேண்டும்). **Continue** அழுத்துங்கள்.",
          "விவரங்களைச் சரிபார்த்து, உங்கள் GLOOBAL PIN போட்டு **Send** அழுத்துங்கள்.",
          "வங்கி உறுதி செய்யும் வரை **Processing** என்று காட்டும். எப்போது வேண்டுமானாலும் **Bank transfers**-ல் பார்க்கலாம்.",
        ],
      },
    },
  },
  {
    id: "bank-add", topic: "bank", screens: ["bank"], money: true, action: {target:"bank"},
    t: {
      en: {
        q: "How do I add money to GLOOBAL?",
        asks: ["add money", "top up", "load money", "deposit money", "add money by upi", "add money from bank", "add money with debit card", "put money in gloobal", "add limit today"],
        steps: [
          "Open **GLOOBAL Bank** and tap **Add money**.",
          "Type the amount and choose **UPI**, **Bank transfer** or **Debit card**.",
          "Money can only come from an account in your own name. The screen shows how much you can still add today.",
        ],
      },
      hi: {
        q: "GLOOBAL में पैसे कैसे डालें?",
        asks: ["पैसे डालने हैं", "पैसे ऐड करना", "टॉप अप", "UPI से पैसे डालें", "बैंक से पैसे डालें", "डेबिट कार्ड से पैसे", "वॉलेट में पैसे डालना", "आज कितने पैसे डाल सकते हैं"],
        steps: [
          "**GLOOBAL Bank** खोलें और **Add money** दबाएँ।",
          "रकम लिखें और **UPI**, **Bank transfer** या **Debit card** चुनें।",
          "पैसे सिर्फ़ आपके अपने नाम के खाते से आ सकते हैं। स्क्रीन बताती है कि आज और कितना डाल सकते हैं।",
        ],
      },
      hl: {
        q: "GLOOBAL mein paise kaise daale?",
        asks: ["paise daalne hai", "paise add karna", "top up karna", "upi se paise daalo", "bank se paise daalo", "debit card se paise", "wallet me paise daalna", "aaj kitna daal sakte hai", "ad money"],
        steps: [
          "**GLOOBAL Bank** kholo aur **Add money** dabao.",
          "Amount likho aur **UPI**, **Bank transfer** ya **Debit card** chuno.",
          "Paise sirf aapke apne naam ke account se aa sakte hain. Screen batati hai ki aaj aur kitna daal sakte ho.",
        ],
      },
      ta: {
        q: "GLOOBAL-ல் பணம் எப்படி சேர்ப்பது?",
        asks: ["பணம் சேர்க்க", "add money", "top up", "UPI மூலம் பணம் சேர்க்க", "bank லிருந்து பணம் சேர்க்க", "debit card மூலம்", "பணம் போட", "இன்று எவ்வளவு சேர்க்கலாம்"],
        steps: [
          "**GLOOBAL Bank** திறந்து **Add money** அழுத்துங்கள்.",
          "தொகையை type செய்து **UPI**, **Bank transfer** அல்லது **Debit card** தேர்வு செய்யுங்கள்.",
          "உங்கள் சொந்தப் பெயரில் உள்ள கணக்கிலிருந்து மட்டுமே பணம் வர முடியும். இன்று இன்னும் எவ்வளவு சேர்க்கலாம் என்று திரை காட்டும்.",
        ],
      },
    },
  },
  {
    id: "bank-processing", topic: "bank", screens: ["bank"], money: true, action: {target:"bank"},
    t: {
      en: {
        q: "Why does my bank transfer say Processing or Returned?",
        asks: ["bank transfer processing", "money not reached my bank", "withdrawal pending", "transfer returned", "bank sent money back", "returned by bank", "bank transfer failed", "money stuck in processing", "why does it say processing", "processing for long"],
        steps: [
          "**Processing** means the money is on its way and GLOOBAL is waiting for your bank to confirm. It changes to **Credited** once the bank does.",
          "**Returned** means the bank sent it back. The money goes back into your GLOOBAL balance by itself.",
          "Still stuck? Open it in **Bank transfers** and tap **Report a problem**.",
        ],
      },
      hi: {
        q: "बैंक ट्रांसफर पर Processing या Returned क्यों लिखा है?",
        asks: ["बैंक ट्रांसफर प्रोसेसिंग में है", "बैंक में पैसे नहीं पहुँचे", "विदड्रॉ पेंडिंग", "पैसे वापस आ गए", "बैंक ने पैसे लौटा दिए", "ट्रांसफर फेल", "पैसे अटके हैं"],
        steps: [
          "**Processing** का मतलब है पैसे रास्ते में हैं और GLOOBAL आपके बैंक की पुष्टि का इंतज़ार कर रहा है। पुष्टि होते ही **Credited** हो जाता है।",
          "**Returned** का मतलब है बैंक ने पैसे लौटा दिए। पैसे अपने आप आपके GLOOBAL बैलेंस में वापस आ जाते हैं।",
          "फिर भी अटका है? **Bank transfers** में उसे खोलें और **Report a problem** दबाएँ।",
        ],
      },
      hl: {
        q: "Bank transfer par Processing ya Returned kyu likha hai?",
        asks: ["bank transfer processing me hai", "bank me paise nahi pahunche", "withdraw pending hai", "paise wapas aa gaye", "bank ne paise lauta diye", "transfer fail ho gaya", "paise atke hai", "prosessing", "processing kyu dikh raha hai", "processing kyu likha hai"],
        steps: [
          "**Processing** ka matlab paise raaste mein hain aur GLOOBAL aapke bank ke confirm ka wait kar raha hai. Confirm hote hi **Credited** ho jaata hai.",
          "**Returned** ka matlab bank ne paise lauta diye. Paise apne aap aapke GLOOBAL balance mein wapas aa jaate hain.",
          "Phir bhi atka hai? **Bank transfers** mein use kholo aur **Report a problem** dabao.",
        ],
      },
      ta: {
        q: "Bank transfer-ல் ஏன் Processing அல்லது Returned என்று உள்ளது?",
        asks: ["bank transfer processing", "பணம் வங்கிக்கு வரவில்லை", "withdraw pending", "பணம் திரும்ப வந்தது", "வங்கி பணத்தை திருப்பி அனுப்பியது", "transfer failed", "பணம் மாட்டிக்கொண்டது"],
        steps: [
          "**Processing** என்றால் பணம் வழியில் உள்ளது; GLOOBAL உங்கள் வங்கியின் உறுதிக்காகக் காத்திருக்கிறது. வங்கி உறுதி செய்ததும் **Credited** ஆகும்.",
          "**Returned** என்றால் வங்கி பணத்தைத் திருப்பி அனுப்பியது. பணம் தானாக உங்கள் GLOOBAL balance-க்குத் திரும்பும்.",
          "இன்னும் பிரச்சனையா? **Bank transfers**-ல் அதைத் திறந்து **Report a problem** அழுத்துங்கள்.",
        ],
      },
    },
  },
  // ── ESSENTIALS ────────────────────────────────────────────────────────
  {
    id: "essentials-what", topic: "essentials", screens: ["essentials"], money: true, action: {target:"essentials"},
    t: {
      en: {
        q: "What is My Essentials?",
        asks: ["what is my essentials", "essentials", "daily essentials", "food water shelter", "daily limit", "do i pay it back", "is essentials free", "essentials baseline", "free money every day"],
        steps: [
          "My Essentials is a daily amount GLOOBAL carries for you, towards food, water, shelter and creativity.",
          "It is free and never paid back. What you don't use today doesn't carry over; it refills tomorrow.",
          "Find it in the **Accounts** tab → **My Essentials**. You need GLOOBAL Bank open to see your amounts and use them.",
        ],
      },
      hi: {
        q: "My Essentials क्या है?",
        asks: ["My Essentials क्या है", "एसेंशियल्स", "रोज़ की ज़रूरतें", "खाना पानी घर", "डेली लिमिट", "क्या वापस देना पड़ेगा", "क्या ये फ़्री है", "रोज़ के पैसे"],
        steps: [
          "My Essentials वह रोज़ की रकम है जो GLOOBAL आपके लिए खाना, पानी, घर और क्रिएटिविटी के लिए उठाता है।",
          "यह फ़्री है और कभी वापस नहीं देनी होती। आज की बची रकम आगे नहीं जुड़ती; कल फिर भर जाती है।",
          "यह **Accounts** टैब → **My Essentials** में है। रकम देखने और इस्तेमाल करने के लिए GLOOBAL Bank खुला होना चाहिए।",
        ],
      },
      hl: {
        q: "My Essentials kya hai?",
        asks: ["my essentials kya hai", "essentials kya hai", "roz ki zarurat", "khana pani ghar", "daily limit", "kya wapas dena padega", "kya ye free hai", "roz ke paise", "esentials"],
        steps: [
          "My Essentials woh roz ka amount hai jo GLOOBAL aapke liye khana, paani, ghar aur creativity ke liye uthata hai.",
          "Yeh free hai aur kabhi wapas nahi dena hota. Aaj ka bacha amount aage nahi judta; kal phir bhar jaata hai.",
          "Yeh **Accounts** tab → **My Essentials** mein hai. Amount dekhne aur use karne ke liye GLOOBAL Bank khula hona chahiye.",
        ],
      },
      ta: {
        q: "My Essentials என்றால் என்ன?",
        asks: ["My Essentials என்றால் என்ன", "essentials", "தினசரி தேவைகள்", "உணவு தண்ணீர் வீடு", "daily limit", "திருப்பி கொடுக்க வேண்டுமா", "இது free ஆ", "தினமும் கிடைக்கும் பணம்"],
        steps: [
          "My Essentials என்பது உணவு, தண்ணீர், வீடு, படைப்பாற்றல் ஆகியவற்றுக்காக GLOOBAL உங்களுக்காக ஏற்கும் தினசரி தொகை.",
          "இது இலவசம்; திருப்பித் தர வேண்டியதில்லை. இன்று பயன்படுத்தாதது அடுத்த நாளுக்குச் சேராது; நாளை மீண்டும் நிரம்பும்.",
          "**Accounts** tab → **My Essentials**-ல் உள்ளது. தொகைகளைப் பார்க்கவும் பயன்படுத்தவும் GLOOBAL Bank திறந்திருக்க வேண்டும்.",
        ],
      },
    },
  },
  {
    id: "essentials-use", topic: "essentials", screens: ["essentials","send"], money: true, action: {target:"send"},
    t: {
      en: {
        q: "How do I pay with my Essentials?",
        asks: ["use essentials", "pay with essentials", "spend essentials", "how to use my essentials", "essentials not working", "nothing left in essentials", "gloobal essentials payment"],
        steps: [
          "Send money as usual. After you tap **Send**, choose **GLOOBAL Essentials** under **Pay with**.",
          "It covers what it can from what's left today, and the rest is paid from your GLOOBAL Bank.",
          "Then confirm with your PIN. If nothing is left today, or GLOOBAL Bank isn't open yet, the payment comes from your bank balance.",
        ],
      },
      hi: {
        q: "Essentials से पेमेंट कैसे करें?",
        asks: ["एसेंशियल्स इस्तेमाल करना", "एसेंशियल्स से पेमेंट", "एसेंशियल्स कैसे खर्च करें", "एसेंशियल्स काम नहीं कर रहा", "आज कुछ नहीं बचा", "GLOOBAL Essentials से भेजें"],
        steps: [
          "हमेशा की तरह पैसे भेजें। **Send** दबाने के बाद **Pay with** में **GLOOBAL Essentials** चुनें।",
          "आज की बची रकम से जितना हो सके उतना लगता है, बाकी आपके GLOOBAL Bank से जाता है।",
          "फिर PIN से पक्का करें। आज कुछ नहीं बचा, या GLOOBAL Bank अभी खुला नहीं, तो पेमेंट आपके बैंक बैलेंस से जाता है।",
        ],
      },
      hl: {
        q: "Essentials se payment kaise kare?",
        asks: ["essentials use karna", "essentials se payment", "essentials kaise kharch kare", "essentials kaam nahi kar raha", "aaj kuch nahi bacha", "gloobal essentials se bhejo", "esential se pay"],
        steps: [
          "Hamesha ki tarah paise bhejo. **Send** dabane ke baad **Pay with** mein **GLOOBAL Essentials** chuno.",
          "Aaj ke bache amount se jitna ho sake utna lagta hai, baaki aapke GLOOBAL Bank se jaata hai.",
          "Phir PIN se confirm karo. Aaj kuch nahi bacha, ya GLOOBAL Bank abhi khula nahi, to payment aapke bank balance se jaata hai.",
        ],
      },
      ta: {
        q: "Essentials மூலம் எப்படி பணம் செலுத்துவது?",
        asks: ["essentials பயன்படுத்த", "essentials மூலம் pay", "essentials செலவு செய்ய", "essentials வேலை செய்யவில்லை", "இன்று எதுவும் மீதி இல்லை", "GLOOBAL Essentials payment"],
        steps: [
          "வழக்கம் போல பணம் அனுப்புங்கள். **Send** அழுத்திய பிறகு **Pay with**-ல் **GLOOBAL Essentials** தேர்வு செய்யுங்கள்.",
          "இன்று மீதியுள்ளதிலிருந்து முடிந்த அளவு அது ஏற்கும்; மீதி உங்கள் GLOOBAL Bank-லிருந்து போகும்.",
          "பிறகு PIN மூலம் உறுதி செய்யுங்கள். இன்று மீதி இல்லையென்றால், அல்லது GLOOBAL Bank இன்னும் திறக்கவில்லையென்றால், payment உங்கள் bank balance-லிருந்து போகும்.",
        ],
      },
    },
  },
  {
    id: "essentials-unlock", topic: "essentials", screens: ["essentials"], money: true, action: {target:"essentials"},
    t: {
      en: {
        q: "Why are my Essentials amounts hidden?",
        asks: ["essentials hidden", "unlock essentials", "essentials locked", "cant see my essentials", "essentials dots", "how to unlock my essentials", "daily limit hidden", "reveal my amounts"],
        steps: [
          "Your amounts are already worked out. Opening GLOOBAL Bank is what shows them.",
          "In **My Essentials**, tap **Start opening GLOOBAL Bank**. It takes about 5 minutes with your ID.",
          "Once it's open, you can see what's left today and use it.",
        ],
      },
      hi: {
        q: "मेरी Essentials की रकम छुपी क्यों है?",
        asks: ["एसेंशियल्स छुपा है", "एसेंशियल्स अनलॉक कैसे करें", "एसेंशियल्स लॉक है", "एसेंशियल्स दिख नहीं रहा", "सिर्फ़ बिंदु दिख रहे", "डेली लिमिट छुपी है", "रकम कैसे दिखेगी"],
        steps: [
          "आपकी रकम पहले से तय है। GLOOBAL Bank खोलने पर ही वह दिखती है।",
          "**My Essentials** में **Start opening GLOOBAL Bank** दबाएँ। आपकी ID के साथ लगभग 5 मिनट लगते हैं।",
          "खाता खुलते ही आप देख सकते हैं कि आज कितना बचा है, और उसे इस्तेमाल कर सकते हैं।",
        ],
      },
      hl: {
        q: "Meri Essentials ki amount chhupi kyu hai?",
        asks: ["essentials chhupa hai", "essentials unlock kaise kare", "essentials lock hai", "essentials dikh nahi raha", "sirf dots dikh rahe", "daily limit hidden hai", "amount kaise dikhega", "essentials anlock"],
        steps: [
          "Aapka amount pehle se tay hai. GLOOBAL Bank kholne par hi woh dikhta hai.",
          "**My Essentials** mein **Start opening GLOOBAL Bank** dabao. Aapki ID ke saath lagbhag 5 minute lagte hain.",
          "Account khulte hi aap dekh sakte ho aaj kitna bacha hai, aur use use kar sakte ho.",
        ],
      },
      ta: {
        q: "என் Essentials தொகைகள் ஏன் மறைந்துள்ளன?",
        asks: ["essentials மறைந்துள்ளது", "essentials unlock", "essentials lock", "essentials தெரியவில்லை", "புள்ளிகள் மட்டும் தெரிகிறது", "daily limit hidden", "தொகை எப்படி தெரியும்"],
        steps: [
          "உங்கள் தொகைகள் ஏற்கனவே கணக்கிடப்பட்டுள்ளன. GLOOBAL Bank திறந்தால்தான் அவை தெரியும்.",
          "**My Essentials**-ல் **Start opening GLOOBAL Bank** அழுத்துங்கள். உங்கள் ID-யுடன் சுமார் 5 நிமிடம் ஆகும்.",
          "கணக்கு திறந்ததும், இன்று எவ்வளவு மீதி என்று பார்த்து பயன்படுத்தலாம்.",
        ],
      },
    },
  },
  {
    id: "essentials-locked", topic: "essentials", screens: ["essentials","bank"], money: true, action: {target:"essentials"},
    t: {
      en: {
        q: "Why can't I send my whole balance to my bank?",
        asks: ["what is locked in my essentials", "stays in gloobal", "is it still my money", "cant withdraw full balance", "the most you can send", "nothing can go out yet", "essentials held", "locked money", "why is part of my balance stuck"],
        steps: [
          "What you've used from Essentials is free. In return, the same amount stays in GLOOBAL when money comes in.",
          "That part is still your money: you can spend it or pay anyone on GLOOBAL. It just can't go to an outside bank.",
          "Everything above it can go to any bank. **My Essentials** shows what stays in, and **Send to bank** shows the most you can send.",
        ],
      },
      hi: {
        q: "पूरा बैलेंस बैंक में क्यों नहीं भेज पा रहे?",
        asks: ["My Essentials में क्या लॉक है", "GLOOBAL में रुका पैसा", "क्या ये मेरा ही पैसा है", "पूरा बैलेंस नहीं निकल रहा", "सारे पैसे नहीं निकल रहे", "पैसे लॉक हैं", "बैलेंस का हिस्सा अटका है"],
        steps: [
          "Essentials से जो इस्तेमाल किया वह फ़्री है। बदले में, पैसे आने पर उतनी ही रकम GLOOBAL में रहती है।",
          "वह हिस्सा आपका ही पैसा है: आप उसे खर्च कर सकते हैं या GLOOBAL पर किसी को भी भेज सकते हैं। बस बाहर के बैंक में नहीं जा सकता।",
          "उससे ऊपर का सब किसी भी बैंक में जा सकता है। **My Essentials** बताता है कितना रहता है, और **Send to bank** बताता है ज़्यादा से ज़्यादा कितना भेज सकते हैं।",
        ],
      },
      hl: {
        q: "Poora balance bank mein kyu nahi bhej pa rahe?",
        asks: ["my essentials me kya lock hai", "gloobal me ruka paisa", "kya ye mera hi paisa hai", "poora balance nahi nikal raha", "saare paise nahi nikal rahe", "paise lock hai", "balance ka hissa atka hai", "stays in gloobal kya hai"],
        steps: [
          "Essentials se jo use kiya woh free hai. Badle mein, paise aane par utna hi amount GLOOBAL mein rehta hai.",
          "Woh hissa aapka hi paisa hai: aap use kharch kar sakte ho ya GLOOBAL par kisi ko bhi bhej sakte ho. Bas bahar ke bank mein nahi ja sakta.",
          "Usse upar ka sab kisi bhi bank mein ja sakta hai. **My Essentials** batata hai kitna rehta hai, aur **Send to bank** batata hai zyada se zyada kitna bhej sakte ho.",
        ],
      },
      ta: {
        q: "என் முழு balance-ஐ ஏன் வங்கிக்கு அனுப்ப முடியவில்லை?",
        asks: ["My Essentials ல என்ன lock", "GLOOBAL ல தங்கும் பணம்", "இது இன்னும் என் பணமா", "முழு balance எடுக்க முடியவில்லை", "எல்லா பணமும் எடுக்க முடியவில்லை", "பணம் lock ஆகியுள்ளது", "balance ல ஒரு பகுதி மாட்டியுள்ளது"],
        steps: [
          "Essentials-லிருந்து நீங்கள் பயன்படுத்தியது இலவசம். அதற்குப் பதிலாக, பணம் வரும்போது அதே தொகை GLOOBAL-ல் தங்கும்.",
          "அந்தப் பகுதி இன்னும் உங்கள் பணம்தான்: செலவு செய்யலாம், GLOOBAL-ல் யாருக்கும் அனுப்பலாம். வெளி வங்கிக்கு மட்டும் போக முடியாது.",
          "அதற்கு மேல் உள்ளது எந்த வங்கிக்கும் போகலாம். எவ்வளவு தங்கும் என்று **My Essentials** காட்டும்; அதிகபட்சம் எவ்வளவு அனுப்பலாம் என்று **Send to bank** காட்டும்.",
        ],
      },
    },
  },
  // ── GEU ───────────────────────────────────────────────────────────────
  {
    id: "geu-what", topic: "geu", screens: [], money: false,
    t: {
      en: {
        q: "What is GEU?",
        asks: ["what is geu", "geu meaning", "why does it say geu", "switch to geu", "show amounts in my currency", "change currency display", "geu vs rupees", "is geu a coin", "gue"],
        steps: [
          "GEU is another name for your own money: 1 GEU is 1 of your country's money. In India, 1 GEU = ₹1.",
          "Tap the switch on your balance card to show amounts in GEU or in your currency. Nothing is converted, there is no fee, and your money doesn't change.",
          "GEU means a different amount in each country, so sending always uses real money on both sides.",
        ],
      },
      hi: {
        q: "GEU क्या है?",
        asks: ["GEU क्या है", "GEU का मतलब", "GEU क्यों लिखा है", "GEU में बदलें", "रुपये में दिखाओ", "करेंसी बदलना", "GEU और रुपया", "क्या GEU कोई कॉइन है"],
        steps: [
          "GEU आपके अपने पैसे का दूसरा नाम है: 1 GEU यानी आपके देश का 1। भारत में 1 GEU = ₹1।",
          "बैलेंस कार्ड पर स्विच दबाकर रकम GEU में या अपनी करेंसी में देखें। कुछ बदला नहीं जाता, कोई फ़ीस नहीं, आपके पैसे वही रहते हैं।",
          "हर देश में GEU की कीमत अलग है, इसलिए पैसे भेजते समय दोनों तरफ़ असली करेंसी ही इस्तेमाल होती है।",
        ],
      },
      hl: {
        q: "GEU kya hai?",
        asks: ["geu kya hai", "geu ka matlab", "geu kyu likha hai", "geu me badlo", "rupees me dikhao", "currency badalna", "geu aur rupaya", "kya geu coin hai", "gue kya hai"],
        steps: [
          "GEU aapke apne paise ka doosra naam hai: 1 GEU yaani aapke desh ka 1. India mein 1 GEU = ₹1.",
          "Balance card par switch dabakar amount GEU mein ya apni currency mein dekho. Kuch convert nahi hota, koi fee nahi, aapke paise wahi rehte hain.",
          "Har desh mein GEU ki value alag hai, isliye paise bhejte waqt dono taraf asli currency hi use hoti hai.",
        ],
      },
      ta: {
        q: "GEU என்றால் என்ன?",
        asks: ["GEU என்றால் என்ன", "GEU அர்த்தம்", "GEU என்று ஏன் வருகிறது", "GEU க்கு மாற்ற", "ரூபாயில் காட்ட", "currency மாற்ற", "GEU vs ரூபாய்", "GEU ஒரு coin ஆ"],
        steps: [
          "GEU என்பது உங்கள் சொந்தப் பணத்தின் இன்னொரு பெயர்: 1 GEU = உங்கள் நாட்டுப் பணத்தில் 1. இந்தியாவில் 1 GEU = ₹1.",
          "Balance card-ல் உள்ள switch-ஐ அழுத்தி தொகைகளை GEU-விலோ உங்கள் currency-யிலோ பாருங்கள். எதுவும் மாற்றப்படாது, கட்டணம் இல்லை, உங்கள் பணம் மாறாது.",
          "ஒவ்வொரு நாட்டிலும் GEU-வின் மதிப்பு வேறு; அதனால் பணம் அனுப்பும்போது இரு பக்கமும் உண்மையான currency மட்டுமே.",
        ],
      },
    },
  },
  // ── SHOP ──────────────────────────────────────────────────────────────
  {
    id: "shop-setup", topic: "shop", screens: ["shop"], money: false, action: {target:"myshop"},
    t: {
      en: {
        q: "How do I set up my shop?",
        asks: ["open a shop", "set up my shop", "creator side", "shop name", "start selling", "become a creator", "business account", "add another shop", "creator name", "how to make a shop", "create a shop"],
        steps: [
          "Tap the round switch at the top of Home to go to your Creator side. The first time, shop setup opens — tap **Join — open my shop**.",
          "Choose your shop name in two parts, like rasoi.ghar. Any language works. Opening a shop is free.",
          "Skipped it? Go to Profile → **Creator Profile** → **Set up my creator name**.",
          "On the Creator side, Profile → **My shops** lets you add more shops.",
        ],
      },
      hi: {
        q: "अपनी दुकान कैसे सेट करें?",
        asks: ["दुकान खोलनी है", "शॉप सेट अप", "क्रिएटर साइड", "दुकान का नाम", "बेचना शुरू करना", "बिज़नेस अकाउंट", "दूसरी दुकान जोड़नी है", "क्रिएटर नाम", "दुकान कैसे खोलें", "अपनी दुकान बनानी है"],
        steps: [
          "Home के ऊपर गोल स्विच दबाकर Creator साइड पर जाएँ। पहली बार दुकान का सेटअप खुलता है — **Join — open my shop** दबाएँ।",
          "दुकान का नाम दो हिस्सों में चुनें, जैसे rasoi.ghar। किसी भी भाषा में चलेगा। दुकान खोलना फ़्री है।",
          "छोड़ दिया था? Profile → **Creator Profile** → **Set up my creator name** में जाएँ।",
          "Creator साइड पर Profile → **My shops** से और दुकानें जोड़ सकते हैं।",
        ],
      },
      hl: {
        q: "Apni shop kaise set kare?",
        asks: ["dukan kholni hai", "shop setup", "creator side", "shop ka naam", "bechna shuru karna", "business account", "dusri shop jodni hai", "creator naam", "dukaan kaise khole", "dukan kaise banaye", "shop kaise banaye", "shop kaise khole", "apni dukan kholna"],
        steps: [
          "Home ke upar gol switch dabakar Creator side par jao. Pehli baar shop setup khulta hai — **Join — open my shop** dabao.",
          "Shop ka naam do hisson mein chuno, jaise rasoi.ghar. Kisi bhi language mein chalega. Shop kholna free hai.",
          "Skip kar diya tha? Profile → **Creator Profile** → **Set up my creator name** mein jao.",
          "Creator side par Profile → **My shops** se aur shops jod sakte ho.",
        ],
      },
      ta: {
        q: "என் கடையை எப்படி அமைப்பது?",
        asks: ["கடை திறக்க", "shop setup", "creator side", "கடை பெயர்", "விற்பனை தொடங்க", "business account", "இன்னொரு கடை சேர்க்க", "creator name", "கடை எப்படி திறப்பது", "என் கடையை திறக்க", "புதிய கடை தொடங்க"],
        steps: [
          "Home மேலே உள்ள வட்ட switch-ஐ அழுத்தி Creator பக்கத்துக்குச் செல்லுங்கள். முதல் முறை கடை அமைப்பு திறக்கும் — **Join — open my shop** அழுத்துங்கள்.",
          "கடையின் பெயரை இரண்டு பகுதிகளாகத் தேர்வு செய்யுங்கள், உதாரணமாக rasoi.ghar. எந்த மொழியிலும் வைக்கலாம். கடை திறப்பது இலவசம்.",
          "தவிர்த்துவிட்டீர்களா? Profile → **Creator Profile** → **Set up my creator name**-க்குச் செல்லுங்கள்.",
          "Creator பக்கத்தில் Profile → **My shops** மூலம் மேலும் கடைகளைச் சேர்க்கலாம்.",
        ],
      },
    },
  },
  {
    id: "shop-get-paid", topic: "shop", screens: ["shop"], money: true, action: {target:"myshop"},
    t: {
      en: {
        q: "How do customers pay my shop?",
        asks: ["customers pay my shop", "shop qr code", "my shop code", "print qr for counter", "scan to pay poster", "how will people find my shop", "accept payments in shop", "get paid as a shop"],
        steps: [
          "Show your shop's code: on the Creator side tap **Receive**, or go to Profile → **Creator Profile** → **Show your code**. Customers scan it with **Scanner**.",
          "From the code screen, get **Poster for your counter** — a \"Scan to pay\" sheet to print.",
          "Customers can also type your shop name in **Pay & Services** (tap **More** on Home).",
        ],
      },
      hi: {
        q: "ग्राहक मेरी दुकान को पैसे कैसे दें?",
        asks: ["ग्राहक पैसे कैसे देंगे", "दुकान का QR कोड", "मेरी दुकान का कोड", "काउंटर के लिए QR प्रिंट", "स्कैन टू पे पोस्टर", "लोग मेरी दुकान कैसे ढूँढें", "दुकान पर पेमेंट लेना"],
        steps: [
          "अपनी दुकान का कोड दिखाएँ: Creator साइड पर **Receive** दबाएँ, या Profile → **Creator Profile** → **Show your code** में जाएँ। ग्राहक उसे **Scanner** से स्कैन करते हैं।",
          "कोड वाली स्क्रीन से **Poster for your counter** लें — प्रिंट करने के लिए \"Scan to pay\" शीट।",
          "ग्राहक **Pay & Services** (Home पर **More**) में आपकी दुकान का नाम लिखकर भी पैसे दे सकते हैं।",
        ],
      },
      hl: {
        q: "Customer meri shop ko paise kaise de?",
        asks: ["customer paise kaise denge", "shop ka qr code", "meri shop ka code", "counter ke liye qr print", "scan to pay poster", "log meri shop kaise dhundhe", "shop pe payment lena", "dukan ka qr"],
        steps: [
          "Apni shop ka code dikhao: Creator side par **Receive** dabao, ya Profile → **Creator Profile** → **Show your code** mein jao. Customer use **Scanner** se scan karte hain.",
          "Code wali screen se **Poster for your counter** lo — print karne ke liye \"Scan to pay\" sheet.",
          "Customer **Pay & Services** (Home par **More**) mein aapki shop ka naam likhkar bhi pay kar sakte hain.",
        ],
      },
      ta: {
        q: "வாடிக்கையாளர்கள் என் கடைக்கு எப்படி பணம் செலுத்துவார்கள்?",
        asks: ["வாடிக்கையாளர்கள் எப்படி pay செய்வார்கள்", "கடை QR code", "என் கடை code", "counter க்கு QR print", "scan to pay poster", "என் கடையை எப்படி கண்டுபிடிப்பார்கள்", "கடையில் payment வாங்க"],
        steps: [
          "உங்கள் கடையின் code-ஐக் காட்டுங்கள்: Creator பக்கத்தில் **Receive** அழுத்துங்கள், அல்லது Profile → **Creator Profile** → **Show your code**. வாடிக்கையாளர்கள் **Scanner** மூலம் scan செய்வார்கள்.",
          "Code திரையிலிருந்து **Poster for your counter** எடுங்கள் — print செய்ய \"Scan to pay\" தாள்.",
          "வாடிக்கையாளர்கள் **Pay & Services**-ல் (Home-ல் **More**) உங்கள் கடைப் பெயரை type செய்தும் செலுத்தலாம்.",
        ],
      },
    },
  },
  {
    id: "shop-money", topic: "shop", screens: ["shop"], money: true, action: {target:"myshop"},
    t: {
      en: {
        q: "When does shop money reach my balance?",
        asks: ["when do i get shop money", "shop payments balance", "where does shop money go", "creator balance", "todays collection", "shop earnings", "money from my shop", "shop settlement"],
        steps: [
          "Straight away. Every payment to any of your shops lands in your one Creator balance as soon as it is paid.",
          "On the Creator side, Home shows **Today's Collection**, and Profile → **My shops** shows each shop's totals.",
          "Each payment is also in **History** with its receipt.",
        ],
      },
      hi: {
        q: "दुकान के पैसे मेरे बैलेंस में कब आते हैं?",
        asks: ["दुकान के पैसे कब मिलेंगे", "दुकान का पेमेंट कहाँ जाता है", "क्रिएटर बैलेंस", "आज का कलेक्शन", "दुकान की कमाई", "शॉप सेटलमेंट", "दुकान के पैसे"],
        steps: [
          "तुरंत। आपकी किसी भी दुकान को मिला हर पेमेंट उसी समय आपके एक Creator बैलेंस में आ जाता है।",
          "Creator साइड पर Home में **Today's Collection** दिखता है, और Profile → **My shops** में हर दुकान का हिसाब।",
          "हर पेमेंट अपनी रसीद के साथ **History** में भी है।",
        ],
      },
      hl: {
        q: "Shop ke paise mere balance mein kab aate hain?",
        asks: ["shop ke paise kab milenge", "shop ka payment kahan jaata hai", "creator balance", "aaj ka collection", "shop ki kamai", "shop settlement", "dukan ke paise", "shop paisa kab aayega"],
        steps: [
          "Turant. Aapki kisi bhi shop ko mila har payment usi waqt aapke ek Creator balance mein aa jaata hai.",
          "Creator side par Home mein **Today's Collection** dikhta hai, aur Profile → **My shops** mein har shop ka hisaab.",
          "Har payment apni receipt ke saath **History** mein bhi hai.",
        ],
      },
      ta: {
        q: "கடைப் பணம் என் balance-க்கு எப்போது வரும்?",
        asks: ["கடை பணம் எப்போது கிடைக்கும்", "கடை payment எங்கே போகும்", "creator balance", "இன்றைய collection", "கடை வருமானம்", "shop settlement", "கடையிலிருந்து பணம்"],
        steps: [
          "உடனே. உங்கள் எந்தக் கடைக்கு வரும் payment-ம் செலுத்தப்பட்டவுடன் உங்கள் ஒரே Creator balance-க்கு வரும்.",
          "Creator பக்கத்தில் Home-ல் **Today's Collection** தெரியும்; Profile → **My shops**-ல் ஒவ்வொரு கடையின் மொத்தமும் தெரியும்.",
          "ஒவ்வொரு payment-ம் அதன் receipt-உடன் **History**-லும் இருக்கும்.",
        ],
      },
    },
  },
  {
    id: "shop-hidden", topic: "shop", screens: ["shop"], money: false, action: {target:"help"},
    t: {
      en: {
        q: "Why can't people find my shop?",
        asks: ["shop not showing", "cant find my shop", "shop hidden", "customers cant see my shop", "shop not in search", "shop on hold", "my shop disappeared", "shop blocked"],
        steps: [
          "Customers find a shop by its exact name, so check they type both parts correctly.",
          "A shop with no name yet can't be found. Finish it in Profile → **Creator Profile**.",
          "GLOOBAL can also hide a shop for a while; you still see it yourself. On the Creator side, go to **Help & Support** → **Chat with us** → **My shop**.",
        ],
      },
      hi: {
        q: "लोगों को मेरी दुकान क्यों नहीं मिल रही?",
        asks: ["दुकान नहीं दिख रही", "मेरी दुकान नहीं मिल रही", "दुकान छुपी है", "ग्राहकों को दुकान नहीं दिखती", "सर्च में दुकान नहीं", "दुकान होल्ड पर", "दुकान गायब हो गई"],
        steps: [
          "ग्राहक दुकान को उसके पूरे सही नाम से ढूँढते हैं, इसलिए देखें कि वे दोनों हिस्से ठीक लिख रहे हैं।",
          "जिस दुकान का नाम अभी तय नहीं, वह नहीं मिलती। Profile → **Creator Profile** में उसे पूरा करें।",
          "GLOOBAL कुछ समय के लिए दुकान छुपा भी सकता है; आपको वह फिर भी दिखती है। Creator साइड पर **Help & Support** → **Chat with us** → **My shop** चुनें।",
        ],
      },
      hl: {
        q: "Logon ko meri shop kyu nahi mil rahi?",
        asks: ["shop nahi dikh rahi", "meri shop nahi mil rahi", "shop chhupi hai", "customer ko shop nahi dikhti", "search me shop nahi", "shop hold par hai", "shop gayab ho gayi", "dukan nahi dikh rahi"],
        steps: [
          "Customer shop ko uske poore sahi naam se dhoondhte hain, isliye dekho ki woh dono hisse theek likh rahe hain.",
          "Jis shop ka naam abhi tay nahi, woh nahi milti. Profile → **Creator Profile** mein use poora karo.",
          "GLOOBAL kuch time ke liye shop chhupa bhi sakta hai; aapko woh phir bhi dikhti hai. Creator side par **Help & Support** → **Chat with us** → **My shop** chuno.",
        ],
      },
      ta: {
        q: "மக்களுக்கு என் கடை ஏன் கிடைக்கவில்லை?",
        asks: ["கடை தெரியவில்லை", "என் கடையை கண்டுபிடிக்க முடியவில்லை", "கடை மறைக்கப்பட்டது", "வாடிக்கையாளர்களுக்கு கடை தெரியவில்லை", "search ல கடை இல்லை", "கடை hold", "கடை காணவில்லை"],
        steps: [
          "வாடிக்கையாளர்கள் கடையை அதன் சரியான முழுப் பெயரால் தேடுவார்கள்; இரண்டு பகுதிகளையும் சரியாக type செய்கிறார்களா என்று பாருங்கள்.",
          "பெயர் இன்னும் வைக்காத கடை கிடைக்காது. Profile → **Creator Profile**-ல் அதை முடியுங்கள்.",
          "GLOOBAL சிறிது காலம் கடையை மறைக்கவும் கூடும்; உங்களுக்கு அது தெரியும். Creator பக்கத்தில் **Help & Support** → **Chat with us** → **My shop** தேர்வு செய்யுங்கள்.",
        ],
      },
    },
  },
  // ── HELP ──────────────────────────────────────────────────────────────
  {
    id: "help-chat", topic: "help", screens: [], money: false, action: {target:"help"},
    t: {
      en: {
        q: "How do I talk to a person at GLOOBAL?",
        asks: ["talk to support", "customer care", "contact gloobal", "chat with us", "speak to a person", "help", "support number", "complain to gloobal", "customer service"],
        steps: [
          "Go to Profile → **Help & Support**.",
          "Under **Chat with us**, pick what it's about, write what happened, and tap **Send to GLOOBAL**.",
          "A person from GLOOBAL replies there. You get a notice and a push when they do.",
          "About a payment? Pick **A payment** and choose it from your recent payments, so the team sees exactly which one.",
        ],
      },
      hi: {
        q: "GLOOBAL में किसी इंसान से बात कैसे करें?",
        asks: ["सपोर्ट से बात", "कस्टमर केयर", "GLOOBAL से संपर्क", "चैट करनी है", "किसी से बात करनी है", "मदद चाहिए", "हेल्पलाइन नंबर", "कस्टमर सर्विस"],
        steps: [
          "Profile → **Help & Support** में जाएँ।",
          "**Chat with us** में विषय चुनें, जो हुआ वह लिखें, और **Send to GLOOBAL** दबाएँ।",
          "GLOOBAL का एक व्यक्ति वहीं जवाब देता है। जवाब आने पर नोटिस और पुश मिलता है।",
          "पेमेंट के बारे में है? **A payment** चुनें और अपने हाल के पेमेंट में से वह चुनें, ताकि टीम को ठीक वही दिखे।",
        ],
      },
      hl: {
        q: "GLOOBAL mein kisi insaan se baat kaise kare?",
        asks: ["support se baat", "customer care", "gloobal se contact", "chat karni hai", "kisi se baat karni hai", "madad chahiye", "helpline number", "customer service", "suport"],
        steps: [
          "Profile → **Help & Support** mein jao.",
          "**Chat with us** mein topic chuno, jo hua woh likho, aur **Send to GLOOBAL** dabao.",
          "GLOOBAL ka ek person wahin reply karta hai. Reply aane par notice aur push milta hai.",
          "Payment ke baare mein hai? **A payment** chuno aur apne haal ke payments mein se woh chuno, taaki team ko theek wahi dikhe.",
        ],
      },
      ta: {
        q: "GLOOBAL-ல் ஒருவரிடம் எப்படி பேசுவது?",
        asks: ["support உடன் பேச", "customer care", "GLOOBAL ஐ தொடர்பு கொள்ள", "chat செய்ய", "ஒருவரிடம் பேச வேண்டும்", "உதவி வேண்டும்", "helpline number", "customer service"],
        steps: [
          "Profile → **Help & Support**-க்குச் செல்லுங்கள்.",
          "**Chat with us**-ல் எதைப் பற்றி என்று தேர்வு செய்து, நடந்ததை எழுதி, **Send to GLOOBAL** அழுத்துங்கள்.",
          "GLOOBAL-லிருந்து ஒருவர் அங்கேயே பதில் சொல்வார். பதில் வந்ததும் notice-ம் push-ம் வரும்.",
          "Payment பற்றியா? **A payment** தேர்வு செய்து, சமீபத்திய payments-லிருந்து அதைத் தேர்வு செய்யுங்கள்; குழுவுக்கு எது என்று சரியாகத் தெரியும்.",
        ],
      },
    },
  },
  {
    id: "help-complaint", topic: "help", screens: [], money: true, action: {target:"complaints"},
    t: {
      en: {
        q: "How do I report a problem with a payment?",
        asks: ["report a problem", "raise a complaint", "complaints and reports", "dispute a payment", "didnt get the item", "i didnt make this payment", "my complaints", "open a case"],
        steps: [
          "Open the payment from **History** and tap **Complain** on its receipt, then pick a reason.",
          "Every case you raised, or that is about you, is in Profile → **Complaints & reports**.",
          "For a GLOOBAL Bank transfer, open it in **Bank transfers** and tap **Report a problem**.",
        ],
      },
      hi: {
        q: "किसी पेमेंट की शिकायत कैसे करें?",
        asks: ["शिकायत करनी है", "कंप्लेंट कैसे करें", "पेमेंट में दिक्कत", "सामान नहीं मिला", "यह पेमेंट मैंने नहीं किया", "मेरी शिकायतें", "केस खोलना है"],
        steps: [
          "**History** से वह पेमेंट खोलें, रसीद पर **Complain** दबाएँ और वजह चुनें।",
          "आपके या आपके बारे में खुले सारे केस Profile → **Complaints & reports** में हैं।",
          "GLOOBAL Bank ट्रांसफर के लिए उसे **Bank transfers** में खोलें और **Report a problem** दबाएँ।",
        ],
      },
      hl: {
        q: "Kisi payment ki complaint kaise kare?",
        asks: ["complaint karni hai", "shikayat kaise kare", "payment me problem", "saman nahi mila", "ye payment maine nahi kiya", "meri complaints", "case kholna hai", "complain kaise kare"],
        steps: [
          "**History** se woh payment kholo, receipt par **Complain** dabao aur reason chuno.",
          "Aapke ya aapke baare mein khule saare case Profile → **Complaints & reports** mein hain.",
          "GLOOBAL Bank transfer ke liye use **Bank transfers** mein kholo aur **Report a problem** dabao.",
        ],
      },
      ta: {
        q: "ஒரு payment பற்றி புகார் எப்படி கொடுப்பது?",
        asks: ["புகார் கொடுக்க", "complaint செய்ய", "payment ல பிரச்சனை", "பொருள் கிடைக்கவில்லை", "இந்த payment நான் செய்யவில்லை", "என் புகார்கள்", "case திறக்க"],
        steps: [
          "**History**-ல் அந்த payment-ஐத் திறந்து, receipt-ல் **Complain** அழுத்தி, காரணத்தைத் தேர்வு செய்யுங்கள்.",
          "நீங்கள் கொடுத்த அல்லது உங்களைப் பற்றிய எல்லா case-களும் Profile → **Complaints & reports**-ல் இருக்கும்.",
          "GLOOBAL Bank transfer என்றால், **Bank transfers**-ல் அதைத் திறந்து **Report a problem** அழுத்துங்கள்.",
        ],
      },
    },
  },
];
