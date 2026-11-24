// src/features/creator/shopTheme.js
//
// A SHOP'S OWN LOOK, AND THE LINE IT MAY NOT CROSS.
//
// One creator's page should be able to look like a tea stall and another's
// like a tailor's studio. This module turns the handful of choices an owner
// makes — a theme, then colour, type, corners, cards, density, photo shape —
// into the concrete values CreatorPage draws with.
//
// ── THE RULE THAT MAKES THE REST SAFE ───────────────────────────────────
//
// A theme may change how a shop LOOKS. It may never change how MONEY READS.
//
// Every value this module produces is for chrome: the cover band, the mark,
// the name, the category chips, the add buttons, the badges, the card edges.
// The price, the GEU pair, the cart total and the Pay button are drawn from
// the app's own tokens in every shop, under every theme, and nothing here
// reaches them.
//
// That is not tidiness. A customer walking between two Gloobal shops has to
// be able to read a figure the same way in both, and the one thing a shop
// must not be able to restyle is its own total — a shop that could would be
// a shop that could make 550 read as 55. The tests assert it, and
// shopThemeGuard below is the list they assert against.
//
// Everything degrades to the app's own look: an unknown theme, a malformed
// colour, a profile saved before this feature existed all resolve to
// GLOOBAL_SHOP_THEME, which is the purple the app already is.

// ── ONE SET OF THEMES, FOR ALL THREE PLACES ─────────────────────────────
//
// A shop's theme is one of the app's own twenty looks (constants/theme.js):
// the same list a person picks from for their Personal side and their
// Creator side. There used to be a second list here that existed nowhere
// else — Street, Studio, Chai Stall, Mithai and eight more — so "theme"
// meant one thing in Appearance and another on a shop page.
//
// A look gives a shop its COLOUR and its page (the look's own paper, ink
// and lines). The shop-only dials — own colour, font, corners, cards,
// density, photo shape, layout, buttons, cover — are still the owner's to
// set afterwards, and picking a theme no longer resets them.
//
// The twelve retired themes are kept below for one reason: a shop saved
// under one of them still has that theme's dials wherever its owner never
// set their own, and it opens under the nearest look (SHOP_THEME_RETIRED).
var SHOP_THEME_DEFAULT = "day.personal";
var SHOP_THEME_RETIRED = {
  gloobal: "day.personal", street: "rajasthan.creator", studio: "monsoon.personal", market: "peacock.creator",
  night: "day.creator", chai: "chai.personal", mithai: "lotus.personal", boutique: "chai.personal",
  pharmacy: "jamun.creator", dhaba: "rajasthan.creator", kirana: "chai.creator", minimal: "monsoon.personal"
};

var SHOP_THEMES_RETIRED_DIALS = {
  gloobal: {
    name: "GLOOBAL",
    note: "The app's own look",
    color: T.accent,
    font: "grotesk",
    corners: "round",
    cards: "raised",
    density: "cosy",
    photoShape: "rounded",
    dark: false
  },
  street: {
    name: "Street",
    note: "Warm, round, photo-led",
    color: "#C2663A",
    font: "grotesk",
    corners: "round",
    cards: "raised",
    density: "cosy",
    photoShape: "rounded",
    dark: false
  },
  studio: {
    name: "Studio",
    note: "Quiet, sharp, lots of air",
    color: "#36414E",
    font: "fraunces",
    corners: "sharp",
    cards: "outline",
    density: "roomy",
    photoShape: "wide",
    dark: false
  },
  market: {
    name: "Market",
    note: "Bold, dense, high contrast",
    color: "#1F6B4B",
    font: "inter",
    corners: "soft",
    cards: "flat",
    density: "compact",
    photoShape: "rounded",
    dark: false
  },
  night: {
    name: "Night",
    note: "Dark, for late shops",
    color: "#C8A24E",
    font: "mono",
    corners: "round",
    cards: "plain",
    density: "cosy",
    photoShape: "circle",
    dark: true
  },
  // ── READY THEMES FOR THE SHOPS GLOOBAL IS FOR ──────────────────────────
  // Each sets every dial at once — including the four added with them:
  // buttons, the name card's style, and the cover drawn when there is no
  // photo — so one tap gives a whole, coherent look.
  chai: {
    name: "Chai Stall", note: "Warm, round, a rangoli cover",
    color: "#C2663A", font: "baloo", corners: "round", cards: "raised", density: "cosy",
    photoShape: "circle", dark: false, layout: "list", buttons: "filled", heroStyle: "gradient",
    coverStyle: "pattern", pattern: "rangoli"
  },
  mithai: {
    name: "Mithai", note: "Festive pink, sweets in a grid",
    color: "#A3327E", font: "rozha", corners: "leaf", cards: "raised", density: "cosy",
    photoShape: "rounded", dark: false, layout: "grid", buttons: "soft", heroStyle: "gradient",
    coverStyle: "pattern", pattern: "dots"
  },
  boutique: {
    name: "Boutique", note: "Quiet, tall photos, outlines",
    color: "#5A4636", font: "fraunces", corners: "sharp", cards: "outline", density: "roomy",
    photoShape: "tall", dark: false, layout: "grid", buttons: "outline", heroStyle: "minimal",
    coverStyle: "pattern", pattern: "stripes"
  },
  pharmacy: {
    name: "Pharmacy", note: "Clean, clear, easy to scan",
    color: "#2F7A74", font: "mukta", corners: "soft", cards: "flat", density: "compact",
    photoShape: "rounded", dark: false, layout: "list", buttons: "filled", heroStyle: "solid",
    coverStyle: "pattern", pattern: "grid"
  },
  dhaba: {
    name: "Night Dhaba", note: "Dark, warm, for late hours",
    color: "#C2663A", font: "yatra", corners: "round", cards: "plain", density: "cosy",
    photoShape: "circle", dark: true, layout: "list", buttons: "soft", heroStyle: "glass",
    coverStyle: "gradient", pattern: "dots"
  },
  kirana: {
    name: "Kirana", note: "Green, dense, everything listed",
    color: "#4F7A46", font: "mukta", corners: "soft", cards: "flat", density: "compact",
    photoShape: "rounded", dark: false, layout: "list", buttons: "filled", heroStyle: "solid",
    coverStyle: "pattern", pattern: "dots"
  },
  minimal: {
    name: "Minimal", note: "Just the name and the things",
    color: "#36414E", font: "hind", corners: "sharp", cards: "plain", density: "roomy",
    photoShape: "wide", dark: false, layout: "list", buttons: "outline", heroStyle: "minimal",
    coverStyle: "photo", pattern: "dots"
  }
};

// The four style dials added with the ready themes. The first value of
// each is what a shop saved before they existed gets, which is exactly
// how such a shop already looked.
// The twenty, built from the app's themes so the two can never drift:
// { "day.personal": { name: "Violet", note: "Day", color, look, …dials } }.
var SHOP_THEMES = {};
var SHOP_THEME_KEYS = [];
gloobalLooks().forEach(function (look) {
  SHOP_THEME_KEYS.push(look.id);
  SHOP_THEMES[look.id] = {
    name: look.name,
    note: GLOOBAL_THEMES[look.theme].name,
    color: String(GLOOBAL_THEMES[look.theme][look.side].accent).toUpperCase(),
    look: look.id,
    font: "grotesk", corners: "round", cards: "raised", density: "cosy", photoShape: "rounded", dark: false
  };
});
// The look a stored theme stands for: itself, the nearest look for a
// retired one, the app's own for anything else.
function shopThemeKey(value) {
  return SHOP_THEMES[value] ? value : SHOP_THEME_RETIRED[value] || SHOP_THEME_DEFAULT;
}

// ── WHAT KIND OF PAGE THIS IS ───────────────────────────────────────────
//
// "What do people come to you for?" One answer shapes the page: how the
// list is laid out, what the button on each item says, what the list is
// called, and which parts are on. Eight kinds, which between them cover a
// tea stall, a kirana, a salon, a tuition class, a photographer, a taxi, a
// temple fund and a freelancer who only needs to be paid.
//
// A page type is a STARTING POSITION, like a theme: everything it sets is
// the owner's to change afterwards. And it obeys the rule at the top of
// this file — it changes words and layout, never how money reads. "Book"
// and "Donate" are the same button as "Add": they put the item in the
// basket, and the basket and Pay are the app's own.
//
// `who` is the examples line on the picker. `set` is what a pick writes
// over the shop's dials; `hide` the parts that start switched off; `sample`
// two made-up items ([title, note, price]) the setup preview draws.
var SHOP_PAGE_TYPES = {
  menu: { name: "Menu", who: "Chai, dhaba, café, tiffin, sweets, bakery", color: "#E8701E", sample: [["Masala chai", "Kadak, with ginger", 15], ["Samosa", "2 pieces", 30]],
    set: { itemButton: "order", listName: "menu", layout: "list", photoShape: "circle", corners: "round" }, hide: [] },
  store: { name: "Store", who: "Kirana, farm produce, clothes, mobiles, hardware", color: "#2F5D8C", sample: [["Basmati rice", "5 kg", 620], ["Sunflower oil", "1 litre", 165]],
    set: { itemButton: "add", listName: "products", layout: "grid", photoShape: "rounded", corners: "soft" }, hide: [] },
  services: { name: "Services", who: "Salon, tailor, cobbler, mechanic, plumber, clinic", color: "#0B7A55", sample: [["Haircut", "30 min", 150], ["Facial", "45 min", 400]],
    set: { itemButton: "book", listName: "services", layout: "list", photoShape: "circle", corners: "soft" }, hide: [] },
  classes: { name: "Classes", who: "Tuition, coaching, music, dance, yoga, gym", color: "#5E2A84", sample: [["Maths, class 10", "Mon · Wed · Fri", 1500], ["Trial class", "1 hour", 100]],
    set: { itemButton: "join", listName: "classes", layout: "list", photoShape: "rounded", corners: "round" }, hide: [] },
  portfolio: { name: "Portfolio", who: "Artist, photographer, YouTuber, musician, writer", color: "#C2185B", sample: [["Wedding album", "200 edited photos", 15000], ["Buy me a chai", "Support my work", 50]],
    set: { itemButton: "support", listName: "work", layout: "grid", photoShape: "tall", corners: "sharp" }, hide: ["where"] },
  bookings: { name: "Bookings", who: "Taxi, tours, hotel, events, tent, DJ, tickets", color: "#D98A00", sample: [["Airport drop", "Sedan, up to 4", 900], ["Day tour", "8 hours", 2500]],
    set: { itemButton: "book", listName: "packages", layout: "list", photoShape: "wide", corners: "soft" }, hide: [] },
  giving: { name: "Giving", who: "NGO, temple, club, fundraiser, community", color: "#A2401C", sample: [["Feed a child", "One meal", 50], ["Temple repair fund", "Any amount helps", 500]],
    set: { itemButton: "donate", listName: "causes", layout: "list", photoShape: "wide", corners: "round" }, hide: [] },
  pay: { name: "Just pay me", who: "Labour, maid, driver, guard, freelancer — no list, only pay", color: "#36414E", sample: [],
    set: { itemButton: "add", listName: "", layout: "list", photoShape: "rounded", corners: "round" }, hide: ["list", "reviews"] }
};
var SHOP_PAGE_TYPE_KEYS = ["menu", "store", "services", "classes", "portfolio", "bookings", "giving", "pay"];

// ── WHICH ONE, EXACTLY ──────────────────────────────────────────────────
//
// A page type is broad: "Services" is a salon and a plumber. So under the
// type the setup asks which one is closest, from the Bazaar's own
// categories and sub-categories (bazaar.jsx) — the same two things "What
// you sell" saves, so the answer is also where the shop is found in Pay &
// Services. Nothing new is stored for it.
//
// Each type lists the categories it draws from, and which of their
// sub-categories ("*" for all of them). The order is the order shown.
var SHOP_PAGE_TYPE_KINDS = {
  menu: [["food", "*"], ["sweets", "*"]],
  store: [["grocery", "*"], ["farm", ["farmer", "dairyfarm", "poultry", "fishery", "nursery", "seeds", "cattlefeed", "honey", "flowergrower", "mandi"]],
    ["fashion", ["clothes", "saree", "shoes", "jewellery", "kids", "boutique", "bangles", "bags", "handloom"]],
    ["electronics", ["mobile", "computer", "appliances"]], ["home", ["furniture", "decor", "hardware", "utensils"]],
    ["building", ["cement", "steel", "sand", "bricks", "tiles", "paint", "plumbing", "electrical", "wood", "glass", "roofing", "solar"]],
    ["education", ["books", "stationery"]], ["art", ["handmade", "pottery", "gifts", "framing", "idol", "bamboo", "toys"]], ["health", ["pharmacy", "optical"]]],
  services: [["beauty", "*"], ["fashion", ["tailor", "laundry", "cobbler", "embroidery"]], ["repair", "*"],
    ["home", ["cleaning", "pestcontrol", "movers", "gardening", "cook", "scrap", "mattress"]],
    ["health", ["clinic", "doctor", "dentist", "lab", "physio", "ayurveda", "vet", "nurse", "ambulance"]],
    ["electronics", ["phonerepair", "internet", "printing", "recharge", "cyber", "tvrepair"]]],
  classes: [["education", ["tuition", "coaching", "music", "dance", "language", "computerclass", "sports", "preschool", "driving", "library", "craftclass"]], ["health", ["gym", "yoga"]]],
  portfolio: [["creator", "*"], ["art", ["painting", "photography", "design", "handmade"]]],
  bookings: [["travel", "*"], ["events", "*"], ["home", ["rent"]], ["farm", ["tractor"]], ["building", ["machinery"]]],
  giving: [["community", "*"]],
  // No list, only pay: the people paid for a day's work come first here.
  pay: [["work", "*"], ["creator", ["freelancer", "consultant", "developer", "designer", "writer"]], ["travel", ["taxi", "auto", "erickshaw", "rickshaw", "driver", "tempo", "courier"]], ["repair", ["plumber", "electrician", "carpenter", "painter", "mason"]]]
};

// Words people say for a kind that are not its name, so typing "hair"
// finds the barber and the salon as well as the hair stylist, and "nai"
// finds the barber. Keyed "<category>.<sub>"; lower case.
var SHOP_KIND_WORDS = {
  "beauty.salon": "hair haircut unisex beauty", "beauty.parlour": "beauty parlor ladies facial threading waxing hair",
  "beauty.barber": "hair haircut shave nai gents saloon", "beauty.hair": "hair haircut hairdresser colour color styling keratin",
  "beauty.makeup": "bridal mua beauty", "beauty.nails": "manicure pedicure nail art", "beauty.skincare": "facial skin clinic derma",
  "beauty.mehendi": "henna bridal", "beauty.spa": "massage", "beauty.tattoo": "piercing ink",
  "fashion.tailor": "darzi stitching alteration boutique", "fashion.laundry": "dhobi dry clean press ironing istri presswala", "fashion.boutique": "designer clothes ladies",
  "food.chai": "tea tapri stall", "food.streetfood": "chaat pani puri momos thela vada pav golgappa bhel tikki", "food.homekitchen": "cloud kitchen home food tiffin", "food.tiffin": "dabba mess meals",
  "grocery.kirana": "general store provision ration", "grocery.water": "gas cylinder water can",
  "health.doctor": "clinic physician", "health.physio": "physiotherapist", "health.optical": "spectacles glasses eye chashma", "health.vet": "pet animal dog",
  "health.gym": "fitness trainer", "health.yoga": "meditation fitness",
  "repair.mechanic": "garage mistri service", "repair.ac": "fridge washing machine appliance", "repair.puncture": "tyre", "repair.electrician": "wiring light",
  "home.cook": "maid bai househelp", "home.movers": "shifting transport", "home.rent": "pg flat room broker property",
  "education.tuition": "teacher home tutor classes", "education.coaching": "institute exam classes", "education.language": "english spoken",
  "education.music": "guitar singing tabla", "education.driving": "car learning",
  "travel.taxi": "cab driver car", "travel.auto": "rickshaw driver", "travel.tempo": "truck loading transport", "travel.courier": "delivery parcel",
  "events.photovideo": "photographer videographer wedding shoot", "events.pandit": "puja priest", "events.band": "dhol baja", "events.catering": "halwai food",
  "art.photography": "photographer photo studio", "art.design": "graphic logo",
  "creator.youtuber": "youtube channel vlogger video", "creator.musician": "singer band music artist", "creator.writer": "author poet blogger",
  "creator.photographer": "photo shoot", "creator.videomaker": "editor reels film", "creator.designer": "graphic ui logo", "creator.developer": "coder programmer software app website",
  "creator.influencer": "instagram reels", "creator.freelancer": "self employed gig", "creator.consultant": "advisor ca lawyer coach", "creator.astrology": "jyotish kundli tarot",
  "community.ngo": "charity trust foundation donation", "community.worship": "temple mandir mosque masjid church gurudwara donation",
  "community.fundraiser": "donation help medical", "community.society": "rwa apartment maintenance", "community.club": "group association", "community.sportsclub": "cricket football team",
  "food.eggcart": "anda egg omelette bhurji thela boiled",
  "food.biryani": "pulao rice",
  "food.chinese": "noodles chowmein momos manchurian thela",
  "food.southindian": "dosa idli vada sambar uttapam",
  "food.juice": "ganna sugarcane shake nimbu lemon soda",
  "grocery.flourmill": "chakki atta grinding besan",
  "grocery.milkman": "doodh doodhwala dairy",
  "grocery.spices": "masala mirch haldi",
  "grocery.pickles": "achar papad badi homemade",
  "grocery.coconut": "nariyal pani tender",
  "grocery.vegetables": "sabzi sabji thela mandi",
  "grocery.fruits": "phal thela cart",
  "sweets.homebaker": "cake home bakery cookies",
  "fashion.cobbler": "mochi shoe repair polish chappal",
  "fashion.embroidery": "zari zardozi kadhai aari work",
  "fashion.bangles": "chudi bindi cosmetic manihari",
  "fashion.handloom": "weaver bunkar khadi powerloom",
  "fashion.bags": "purse luggage school bag",
  "beauty.homebeauty": "parlour at home beautician facial",
  "beauty.massage": "maalish malish champi",
  "health.nurse": "caretaker attendant injection home nursing",
  "health.ambulance": "emergency patient",
  "electronics.cyber": "csc online form aadhaar pan print ticket jan seva",
  "electronics.tvrepair": "television fridge mixer cooler washing machine",
  "repair.cycle": "bicycle puncture saikil",
  "repair.keymaker": "chabi lock duplicate key",
  "repair.watch": "ghadi clock battery",
  "repair.stove": "chulha gas cooker burner",
  "repair.knife": "dhaar scissors sharpening",
  "repair.mason": "mistri raj mistri construction brick plaster",
  "repair.tiles": "marble flooring granite",
  "repair.borewell": "motor pump boring tubewell",
  "home.scrap": "kabadi kabadiwala raddi old newspaper iron",
  "home.mattress": "gadda razai quilt cotton pinjara",
  "home.utensils": "bartan steel vessel",
  "education.library": "reading room study",
  "education.craftclass": "silai sewing stitching class",
  "travel.erickshaw": "toto battery rickshaw",
  "travel.rickshaw": "cycle rickshaw riksha",
  "travel.driver": "chauffeur car driver",
  "travel.schoolvan": "school auto children van",
  "art.idol": "murti moorti statue ganesh",
  "art.bamboo": "cane basket tokri",
  "art.toys": "khilona balloon gubbara",
  "events.lights": "generator genset lighting",
  "building.cement": "siment opc ppc bag construction", "building.steel": "sariya saria tmt rod bar loha", "building.sand": "reti bajri gitti aggregate stone grit",
  "building.bricks": "eent int block fly ash", "building.tiles": "marble granite flooring kota stone", "building.paint": "colour color putty primer",
  "building.plumbing": "pipe tank tap sanitary nal", "building.electrical": "wire switch light bijli fitting", "building.wood": "lakdi plywood door board timber",
  "building.glass": "kaanch window aluminium", "building.roofing": "tin sheet chadar khaprail roof", "building.solar": "panel inverter battery street light",
  "building.machinery": "jcb mixer crane tractor hire",
  "community.shg": "self help group mahila mandal samooh",
  "community.gaushala": "cow shelter gau seva",
  "community.school": "fees college donation",
  "farm.farmer": "kisan kheti crops grain anaj wheat rice",
  "farm.dairyfarm": "doodh milk cow buffalo dairy",
  "farm.poultry": "murgi chicken eggs anda",
  "farm.fishery": "machhli fish pond",
  "farm.nursery": "plants paudha garden saplings",
  "farm.seeds": "beej khad fertiliser fertilizer pesticide",
  "farm.cattlefeed": "chara pashu aahar khal",
  "farm.honey": "shahad madhu bee",
  "farm.flowergrower": "phool genda rose",
  "farm.mandi": "aadhat wholesale grain trader",
  "farm.tractor": "jcb harvester trolley rental",
  "work.labour": "mazdoor majdoor labor dihadi daily wage beldar",
  "work.helper": "loader loading unloading hamal",
  "work.porter": "coolie kuli luggage station",
  "work.guard": "chowkidar watchman security",
  "work.sweeper": "safai cleaner jhadu safaiwala",
  "work.maid": "bai kaamwali househelp jhadu pocha bartan",
  "work.babysitter": "aaya nanny child care",
  "work.eldercare": "caretaker attendant old age patient",
  "work.homecook": "cook rasoiya khana maharaj",
  "work.gardener": "mali garden plants",
  "work.rider": "delivery boy bike courier zomato swiggy",
  "work.waiter": "catering staff server helper event"
};

// The kinds to offer: for a page type, its own (grouped by category); for
// words typed in the search box, every kind anywhere whose name, category
// or other words contain them — "similar and around", not just one list.
// `cats` is [{ key, label }], `subs` is { category: [[key, label]] }: the
// Bazaar's two tables, passed in so this file needs nothing from that one.
function shopKindGroups(pageType, query, cats, subs) {
  const q = String(query || "").trim().toLowerCase();
  const groups = [];
  const push = (cat, keys) => {
    const info = (cats || []).find((c) => c.key === cat);
    const rows = ((subs || {})[cat] || []).filter(([k]) => keys === "*" || keys.indexOf(k) >= 0);
    if (info && rows.length) groups.push({ category: cat, label: info.label, kinds: rows.map(([k, label]) => ({ sub: k, label: label })) });
  };
  if (!q) {
    for (const [cat, keys] of SHOP_PAGE_TYPE_KINDS[pageType] || []) push(cat, keys);
    return groups;
  }
  for (const info of cats || []) {
    const rows = ((subs || {})[info.key] || []).filter(([k, label]) => {
      const hay = `${label} ${info.label} ${SHOP_KIND_WORDS[`${info.key}.${k}`] || ""}`.toLowerCase();
      return q.split(/\s+/).every((word) => hay.indexOf(word) >= 0);
    });
    if (rows.length) groups.push({ category: info.key, label: info.label, kinds: rows.map(([k, label]) => ({ sub: k, label: label })) });
  }
  return groups;
}

// ── A FIRST LIST FOR EACH KIND ──────────────────────────────────────────
//
// Most new shops stall at "add your first item". So each kind comes with
// a few things that kind usually sells: [title, note, a typical price].
// Setup offers them to tick; the owner types their OWN price for each one
// they keep. The price here is never saved — it is only what the preview
// shows and the hint in the empty price box (and only for a rupee account,
// since it is a rupee figure).
var SHOP_KIND_STARTERS = {
  "food.chai": [["Masala chai", "Kadak, with ginger", 15], ["Cutting chai", "Half glass", 10], ["Bun maska", "", 30], ["Biscuit", "", 5]],
  "food.dhaba": [["Dal tadka", "", 120], ["Paneer butter masala", "", 180], ["Tandoori roti", "Per piece", 15], ["Thali", "Full meal", 150]],
  "food.fastfood": [["Veg burger", "", 60], ["French fries", "", 70], ["Veg sandwich", "", 50], ["Cold drink", "", 20]],
  "food.restaurant": [["Veg thali", "", 180], ["Paneer tikka", "", 220], ["Butter naan", "Per piece", 40], ["Gulab jamun", "2 pieces", 60]],
  "food.cafe": [["Cappuccino", "", 120], ["Cold coffee", "", 140], ["Sandwich", "", 150], ["Brownie", "", 110]],
  "food.tiffin": [["Daily tiffin", "One meal", 80], ["Monthly tiffin", "Lunch, 26 days", 2000], ["Extra roti", "Per piece", 8]],
  "food.juice": [["Mosambi juice", "Glass", 40], ["Sugarcane juice", "Glass", 20], ["Mango shake", "", 60], ["Fruit plate", "", 50]],
  "food.streetfood": [["Pani puri", "6 pieces", 30], ["Samosa", "2 pieces", 30], ["Vada pav", "", 20], ["Momos", "8 pieces", 60]],
  "food.homekitchen": [["Home thali", "", 120], ["Rajma chawal", "", 90], ["Paratha", "2 pieces, with curd", 70]],
  "food.paan": [["Meetha paan", "", 20], ["Saada paan", "", 15], ["Mouth freshener", "", 10]],
  "grocery.kirana": [["Basmati rice", "5 kg", 620], ["Atta", "10 kg", 420], ["Sunflower oil", "1 litre", 165], ["Sugar", "1 kg", 48]],
  "grocery.vegetables": [["Tomato", "1 kg", 40], ["Onion", "1 kg", 35], ["Potato", "1 kg", 30], ["Green chilli", "100 g", 10]],
  "grocery.fruits": [["Banana", "1 dozen", 60], ["Apple", "1 kg", 160], ["Orange", "1 kg", 80], ["Papaya", "1 piece", 50]],
  "grocery.dairy": [["Milk", "1 litre", 60], ["Curd", "500 g", 40], ["Paneer", "200 g", 90], ["Ghee", "500 ml", 330]],
  "grocery.meat": [["Chicken", "1 kg", 240], ["Eggs", "1 tray of 30", 200], ["Fish", "1 kg", 300], ["Mutton", "1 kg", 750]],
  "grocery.organic": [["Organic atta", "5 kg", 350], ["Cold-pressed oil", "1 litre", 380], ["Jaggery", "1 kg", 90], ["Honey", "500 g", 300]],
  "grocery.general": [["Soap", "", 35], ["Toothpaste", "", 60], ["Biscuits", "", 20], ["Detergent", "1 kg", 110]],
  "grocery.water": [["Water can", "20 litres", 40], ["Gas cylinder", "Refill", 950], ["Water bottles", "Case of 12", 200]],
  "sweets.mithai": [["Kaju katli", "250 g", 250], ["Gulab jamun", "500 g", 180], ["Rasgulla", "500 g", 170], ["Jalebi", "250 g", 80]],
  "sweets.bakery": [["Bread", "", 40], ["Veg puff", "", 20], ["Cream bun", "", 25], ["Cookies", "250 g", 90]],
  "sweets.cakes": [["Chocolate cake", "500 g", 400], ["Black forest", "1 kg", 700], ["Cupcakes", "Box of 6", 300], ["Custom cake", "Per kg", 900]],
  "sweets.namkeen": [["Aloo bhujia", "250 g", 70], ["Mixture", "250 g", 70], ["Mathri", "250 g", 80], ["Chips", "", 20]],
  "sweets.icecream": [["Vanilla cup", "", 30], ["Chocolate cone", "", 50], ["Kulfi", "", 40], ["Family pack", "700 ml", 220]],
  "sweets.dryfruits": [["Almonds", "250 g", 260], ["Cashews", "250 g", 280], ["Raisins", "250 g", 120], ["Gift box", "", 600]],
  "fashion.tailor": [["Blouse stitching", "", 350], ["Shirt stitching", "", 400], ["Pant stitching", "", 450], ["Alteration", "Per piece", 80]],
  "fashion.clothes": [["Shirt", "", 600], ["Jeans", "", 900], ["Kurti", "", 500], ["T-shirt", "", 350]],
  "fashion.saree": [["Cotton saree", "", 900], ["Silk saree", "", 3500], ["Fall and pico", "", 120], ["Blouse piece", "", 250]],
  "fashion.shoes": [["Sports shoes", "", 1200], ["Sandals", "", 450], ["Formal shoes", "", 1500], ["Slippers", "", 200]],
  "fashion.jewellery": [["Earrings", "", 250], ["Necklace set", "", 900], ["Bangles", "Set of 12", 300], ["Ring", "", 200]],
  "fashion.kids": [["Kids T-shirt", "", 250], ["Frock", "", 500], ["School uniform", "Set", 800], ["Kids shoes", "", 500]],
  "fashion.boutique": [["Designer kurti", "", 1500], ["Lehenga", "", 6000], ["Custom stitching", "", 1200], ["Dupatta", "", 400]],
  "fashion.laundry": [["Ironing", "Per piece", 8], ["Wash and iron", "Per kg", 80], ["Dry clean, saree", "", 200], ["Dry clean, suit", "", 350]],
  "beauty.salon": [["Haircut", "30 min", 150], ["Hair colour", "1 hour", 800], ["Facial", "45 min", 400], ["Threading", "10 min", 40]],
  "beauty.parlour": [["Threading", "Eyebrows", 40], ["Facial", "45 min", 400], ["Waxing", "Full arms", 250], ["Bridal makeup", "Ask for a date", 8000]],
  "beauty.barber": [["Haircut", "20 min", 80], ["Shave", "10 min", 40], ["Beard trim", "10 min", 50], ["Head massage", "15 min", 60]],
  "beauty.spa": [["Full body massage", "60 min", 1500], ["Head and shoulder massage", "30 min", 600], ["Foot massage", "30 min", 500]],
  "beauty.mehendi": [["Simple mehendi", "One hand", 150], ["Bridal mehendi", "Both hands and feet", 3000], ["Arabic design", "Both hands", 500]],
  "beauty.hair": [["Haircut", "30 min", 200], ["Hair colour", "1 hour", 1200], ["Blow dry", "20 min", 300], ["Keratin treatment", "3 hours", 4000]],
  "beauty.makeup": [["Party makeup", "1 hour", 1500], ["Bridal makeup", "Ask for a date", 10000], ["Saree draping", "", 300], ["Hairstyling", "", 500]],
  "beauty.nails": [["Manicure", "40 min", 400], ["Pedicure", "45 min", 500], ["Gel polish", "30 min", 600], ["Nail art", "Per nail", 50]],
  "beauty.skincare": [["Clean-up", "30 min", 300], ["Gold facial", "1 hour", 900], ["De-tan", "30 min", 400], ["Skin consultation", "", 300]],
  "beauty.tattoo": [["Small tattoo", "Up to 2 inches", 1000], ["Custom tattoo", "Per square inch", 500], ["Piercing", "", 300]],
  "health.pharmacy": [["Paracetamol", "Strip of 10", 20], ["ORS", "Sachet", 20], ["Bandage", "", 30], ["Hand sanitiser", "100 ml", 50]],
  "health.clinic": [["Consultation", "", 300], ["Follow-up visit", "", 150], ["Dressing", "", 100], ["Injection", "", 50]],
  "health.dentist": [["Check-up", "", 300], ["Cleaning", "", 800], ["Filling", "Per tooth", 1000], ["Extraction", "", 700]],
  "health.lab": [["Blood sugar", "", 80], ["CBC", "", 250], ["Thyroid profile", "", 450], ["Full body check-up", "", 1500]],
  "health.gym": [["Monthly membership", "", 1000], ["Quarterly membership", "", 2700], ["Personal training", "Per month", 3000], ["Day pass", "", 100]],
  "health.yoga": [["Monthly classes", "Morning batch", 1200], ["Single class", "1 hour", 150], ["Private session", "1 hour", 600]],
  "health.doctor": [["Consultation", "", 400], ["Follow-up visit", "", 200], ["Home visit", "", 800]],
  "health.physio": [["Assessment", "", 400], ["Session", "45 min", 500], ["Home visit", "", 800]],
  "health.optical": [["Eye test", "", 100], ["Frame", "", 800], ["Lenses", "Pair", 600], ["Sunglasses", "", 700]],
  "health.ayurveda": [["Consultation", "", 300], ["Abhyanga massage", "45 min", 900], ["Chyawanprash", "500 g", 250]],
  "health.vet": [["Consultation", "", 300], ["Vaccination", "", 500], ["Grooming", "", 600], ["Deworming", "", 150]],
  "electronics.mobile": [["Tempered glass", "", 150], ["Back cover", "", 200], ["Charger", "", 350], ["Earphones", "", 300]],
  "electronics.phonerepair": [["Screen replacement", "", 1500], ["Battery replacement", "", 800], ["Charging port repair", "", 400], ["Software update", "", 200]],
  "electronics.computer": [["Laptop service", "", 500], ["Windows install", "", 400], ["Mouse", "", 300], ["Keyboard", "", 500]],
  "electronics.appliances": [["Mixer grinder", "", 2500], ["Iron", "", 800], ["Ceiling fan", "", 1600], ["LED bulb", "", 90]],
  "electronics.recharge": [["Mobile recharge", "Service charge", 10], ["DTH recharge", "Service charge", 10], ["New SIM", "", 50]],
  "electronics.internet": [["Broadband, monthly", "50 Mbps", 600], ["Cable TV, monthly", "", 300], ["New connection", "Installation", 1000]],
  "electronics.printing": [["Xerox", "Per page", 2], ["Colour print", "Per page", 10], ["Passport photos", "Set of 8", 60], ["Lamination", "", 30]],
  "repair.mechanic": [["General service", "", 800], ["Oil change", "", 500], ["Brake check", "", 300], ["Washing", "", 150]],
  "repair.bike": [["Bike service", "", 500], ["Oil change", "", 350], ["Chain set", "", 1200], ["Washing", "", 100]],
  "repair.car": [["Car service", "", 3000], ["Oil change", "", 1500], ["Wheel alignment", "", 600], ["Car wash", "", 300]],
  "repair.plumber": [["Visit charge", "", 200], ["Tap repair", "", 150], ["Pipe leak repair", "", 400], ["Tank cleaning", "", 600]],
  "repair.electrician": [["Visit charge", "", 200], ["Fan fitting", "", 250], ["Switch board repair", "", 150], ["Wiring", "Per point", 300]],
  "repair.carpenter": [["Visit charge", "", 200], ["Door repair", "", 400], ["Furniture polish", "", 1500], ["Lock fitting", "", 250]],
  "repair.ac": [["AC service", "", 500], ["Gas refill", "", 2500], ["Fridge repair", "Visit", 300], ["Washing machine repair", "Visit", 300]],
  "repair.puncture": [["Puncture, bike", "", 50], ["Puncture, car", "", 100], ["Air check", "", 10], ["Tube change", "", 250]],
  "repair.welding": [["Gate repair", "", 500], ["Grill work", "Per square foot", 150], ["Small welding job", "", 200]],
  "repair.painter": [["Room painting", "Per room", 3000], ["Wall putty", "Per square foot", 12], ["Touch-up", "", 800]],
  "home.furniture": [["Chair", "", 1500], ["Table", "", 3500], ["Bed", "", 12000], ["Wardrobe", "", 15000]],
  "home.decor": [["Curtains", "Per window", 800], ["Wall clock", "", 500], ["Photo frame", "", 300], ["Lamp", "", 900]],
  "home.hardware": [["Cement", "Bag", 400], ["Paint", "1 litre", 350], ["Screws", "Packet", 40], ["PVC pipe", "Per length", 250]],
  "home.cleaning": [["Home deep cleaning", "1 BHK", 2500], ["Bathroom cleaning", "", 500], ["Sofa cleaning", "Per seat", 250], ["Kitchen cleaning", "", 1200]],
  "home.pestcontrol": [["Cockroach control", "1 BHK", 900], ["Termite treatment", "Per square foot", 8], ["Mosquito control", "", 700]],
  "home.movers": [["House shifting", "1 BHK, in city", 5000], ["Tempo with helpers", "Per trip", 1500], ["Packing material", "", 800]],
  "home.gardening": [["Garden visit", "2 hours", 400], ["Monthly maintenance", "", 1500], ["Plants", "Per plant", 150]],
  "home.cook": [["Cook, monthly", "Two meals a day", 6000], ["Maid, monthly", "", 3000], ["Party cooking", "Per day", 1500]],
  "home.rent": [["Room for rent", "Per month", 6000], ["1 BHK flat", "Per month", 12000], ["Visit and brokerage", "", 1000]],
  "education.tuition": [["Maths, class 10", "Mon · Wed · Fri", 1500], ["Science, class 10", "Tue · Thu · Sat", 1500], ["All subjects, class 1–5", "Monthly", 1200], ["Trial class", "1 hour", 100]],
  "education.coaching": [["Monthly fee", "", 3000], ["Test series", "", 1500], ["Doubt class", "1 hour", 300], ["Study material", "", 800]],
  "education.music": [["Guitar class", "Monthly, 8 classes", 2000], ["Singing class", "Monthly, 8 classes", 2000], ["Trial class", "", 200]],
  "education.dance": [["Dance class", "Monthly, 8 classes", 1500], ["Wedding choreography", "Per song", 3000], ["Trial class", "", 150]],
  "education.books": [["School textbook", "", 250], ["Notebook", "", 50], ["Novel", "", 300], ["Guide book", "", 350]],
  "education.stationery": [["Pen", "", 10], ["Notebook", "", 50], ["Geometry box", "", 120], ["Chart paper", "", 10]],
  "education.language": [["Spoken English", "Monthly", 1500], ["Hindi class", "Monthly", 1200], ["Trial class", "", 100]],
  "education.computerclass": [["Basic computer course", "3 months", 3000], ["Tally", "2 months", 4000], ["Typing", "Monthly", 600]],
  "education.sports": [["Cricket coaching", "Monthly", 2000], ["Badminton coaching", "Monthly", 1800], ["Trial session", "", 200]],
  "education.preschool": [["Play group", "Monthly fee", 2500], ["Nursery", "Monthly fee", 3000], ["Day care", "Monthly", 4000]],
  "education.driving": [["Car driving course", "15 days", 5000], ["Two-wheeler course", "7 days", 2000], ["Licence help", "", 1500]],
  "travel.taxi": [["Airport drop", "Sedan, up to 4", 900], ["Local, 8 hours", "80 km", 2000], ["Outstation", "Per km", 14]],
  "travel.auto": [["Local ride", "Per km", 15], ["Station drop", "", 100], ["School trip, monthly", "", 1200]],
  "travel.tours": [["Day tour", "8 hours", 2500], ["Weekend package", "2 days, per person", 6000], ["Pilgrimage trip", "Per person", 3500]],
  "travel.hotel": [["Standard room", "Per night", 1200], ["Deluxe room", "Per night", 2000], ["Extra bed", "", 400]],
  "travel.tickets": [["Train ticket booking", "Service charge", 50], ["Bus ticket booking", "Service charge", 30], ["Flight ticket booking", "Service charge", 200]],
  "travel.bikerental": [["Scooter", "Per day", 400], ["Bike", "Per day", 600], ["Helmet", "Per day", 50]],
  "travel.courier": [["Local delivery", "Up to 5 km", 60], ["Parcel, up to 1 kg", "Within the city", 80], ["Document delivery", "", 50]],
  "travel.guide": [["City walk", "3 hours", 800], ["Full-day guide", "", 2000], ["Heritage tour", "Per person", 500]],
  "travel.tempo": [["Tempo, local trip", "", 800], ["Truck, per day", "", 4000], ["Loading helper", "Per person", 400]],
  "art.handmade": [["Handmade candle", "", 250], ["Crochet toy", "", 400], ["Rakhi", "", 60], ["Gift hamper", "", 900]],
  "art.pottery": [["Clay cup", "", 80], ["Flower pot", "", 200], ["Diya", "Set of 12", 120], ["Decorative vase", "", 600]],
  "art.painting": [["Canvas painting", "12 × 16 inches", 3000], ["Portrait sketch", "A4", 800], ["Wall painting", "Per square foot", 200]],
  "art.gifts": [["Gift box", "", 500], ["Photo mug", "", 300], ["Greeting card", "", 60], ["Photo frame", "", 350]],
  "art.photography": [["Portrait shoot", "1 hour", 2000], ["Passport photos", "Set of 8", 60], ["Event shoot", "Per day", 8000]],
  "art.design": [["Logo design", "", 2500], ["Invitation card design", "", 800], ["Poster design", "", 600]],
  "art.framing": [["Photo framing", "8 × 10 inches", 300], ["Canvas stretching", "", 500], ["Certificate frame", "", 250]],
  "events.wedding": [["Wedding planning", "Ask for a date", 50000], ["Venue decoration", "", 25000], ["Bridal entry", "", 8000]],
  "events.decoration": [["Birthday decoration", "", 2500], ["Balloon arch", "", 1200], ["Stage decoration", "", 8000], ["Flower decoration", "", 5000]],
  "events.catering": [["Veg plate", "Per person", 250], ["Non-veg plate", "Per person", 400], ["Snacks and tea", "Per person", 80]],
  "events.dj": [["DJ, 4 hours", "", 6000], ["Sound system", "Per day", 3000], ["Lights", "Per day", 2500]],
  "events.tent": [["Tent", "Per day", 5000], ["Chairs", "Per chair", 10], ["Tables", "Per table", 80], ["Stage", "", 4000]],
  "events.flowers": [["Garland", "", 150], ["Bouquet", "", 400], ["Car decoration", "", 2500], ["Loose flowers", "Per kg", 200]],
  "events.photovideo": [["Wedding shoot", "Per day", 25000], ["Pre-wedding shoot", "", 15000], ["Birthday shoot", "3 hours", 5000], ["Album", "", 6000]],
  "events.pandit": [["Griha pravesh puja", "", 3100], ["Satyanarayan katha", "", 2100], ["Wedding ceremony", "", 11000]],
  "events.band": [["Band baja", "2 hours", 8000], ["Dhol", "Per hour", 1500], ["Ghodi", "", 5000]],
  "events.anchor": [["Wedding anchoring", "", 8000], ["Birthday hosting", "", 3000], ["Corporate event", "", 12000]],
  "creator.youtuber": [["Buy me a chai", "Support my channel", 50], ["Shout-out", "In a video", 500], ["Brand collaboration", "Ask for details", 10000]],
  "creator.musician": [["Live show", "2 hours", 15000], ["Custom song", "", 5000], ["Support my music", "", 100]],
  "creator.writer": [["Article", "Up to 1,000 words", 1500], ["Signed book", "", 400], ["Support my writing", "", 100]],
  "creator.artist": [["Commissioned artwork", "A3", 4000], ["Art print", "A4", 500], ["Support my art", "", 100]],
  "creator.photographer": [["Portrait shoot", "1 hour", 2500], ["Product shoot", "Per product", 500], ["Wedding album", "200 edited photos", 15000]],
  "creator.videomaker": [["Reel edit", "Up to 60 seconds", 800], ["Wedding film", "", 20000], ["YouTube video edit", "Up to 10 min", 2000]],
  "creator.designer": [["Logo design", "", 3000], ["Social media post", "", 400], ["Brand kit", "", 8000]],
  "creator.developer": [["Website", "5 pages", 15000], ["Bug fix", "Per hour", 800], ["App consultation", "1 hour", 1500]],
  "creator.influencer": [["Story mention", "", 1000], ["Reel collaboration", "", 5000], ["Product review", "", 3000]],
  "creator.podcaster": [["Support the show", "", 100], ["Guest slot", "", 2000], ["Ad read", "Per episode", 3000]],
  "creator.freelancer": [["Hourly work", "Per hour", 500], ["Day rate", "", 3500], ["Project advance", "", 5000]],
  "creator.consultant": [["Consultation", "1 hour", 1500], ["Document review", "", 1000], ["Monthly retainer", "", 10000]],
  "creator.astrology": [["Kundli reading", "30 min", 500], ["Match making", "", 700], ["Tarot reading", "", 400]],
  "community.ngo": [["Feed a child", "One meal", 50], ["School kit", "For one child", 500], ["Monthly support", "", 1000]],
  "community.worship": [["Daily offering", "", 51], ["Annadaan", "Feeds 10 people", 501], ["Building fund", "Any amount helps", 1100]],
  "community.club": [["Monthly membership", "", 300], ["Annual membership", "", 3000], ["Event entry", "", 200]],
  "community.fundraiser": [["Small help", "", 100], ["Medical support", "", 1000], ["Sponsor a day", "", 5000]],
  "community.society": [["Monthly maintenance", "", 1500], ["Festival contribution", "", 500], ["Parking charge", "Monthly", 300]],
  "community.sportsclub": [["Monthly fee", "", 500], ["Tournament entry", "Per team", 2000], ["Ground booking", "Per hour", 800]],
  "food.eggcart": [["Boiled egg", "2 pieces", 20], ["Omelette", "2 eggs, with bread", 40], ["Egg bhurji", "With pav", 50]],
  "food.biryani": [["Veg biryani", "Half", 80], ["Chicken biryani", "Half", 120], ["Raita", "", 20]],
  "food.chinese": [["Veg chowmein", "Half plate", 40], ["Veg momos", "8 pieces", 50], ["Manchurian", "", 60], ["Fried rice", "", 60]],
  "food.southindian": [["Masala dosa", "", 60], ["Idli", "2 pieces, with sambar", 40], ["Vada", "2 pieces", 40], ["Uttapam", "", 60]],
  "grocery.flourmill": [["Wheat grinding", "Per kg", 3], ["Fresh atta", "1 kg", 38], ["Besan", "1 kg", 90]],
  "grocery.milkman": [["Milk, daily", "1 litre", 60], ["Milk, monthly", "1 litre a day", 1800], ["Curd", "500 g", 40]],
  "grocery.spices": [["Haldi powder", "250 g", 70], ["Red chilli powder", "250 g", 90], ["Garam masala", "100 g", 70]],
  "grocery.pickles": [["Mango pickle", "500 g", 150], ["Papad", "250 g", 90], ["Lemon pickle", "500 g", 140]],
  "grocery.coconut": [["Tender coconut", "", 50], ["Coconut, with malai", "", 60], ["Dry coconut", "", 40]],
  "sweets.homebaker": [["Chocolate cake", "500 g", 450], ["Cupcakes", "Box of 6", 300], ["Cookies", "250 g", 180]],
  "fashion.cobbler": [["Shoe polish", "", 20], ["Sole repair", "", 80], ["Stitching", "", 30], ["Chappal repair", "", 30]],
  "fashion.embroidery": [["Blouse embroidery", "", 600], ["Saree border work", "", 1500], ["Zari work", "Per piece", 800]],
  "fashion.bangles": [["Glass bangles", "Dozen", 60], ["Bindi packet", "", 10], ["Lipstick", "", 120], ["Mehendi cone", "", 20]],
  "fashion.handloom": [["Cotton saree", "Handloom", 1200], ["Khadi kurta", "", 800], ["Dupatta", "", 400]],
  "fashion.bags": [["School bag", "", 600], ["Ladies purse", "", 400], ["Travel bag", "", 1200]],
  "beauty.homebeauty": [["Threading at home", "Eyebrows", 80], ["Facial at home", "45 min", 600], ["Waxing at home", "Full arms", 350]],
  "beauty.massage": [["Head massage", "15 min", 100], ["Full body massage", "60 min", 800], ["Baby massage", "", 200]],
  "health.nurse": [["Injection at home", "", 150], ["Day care", "12 hours", 800], ["Night care", "12 hours", 1000], ["Dressing", "", 200]],
  "health.ambulance": [["Local trip", "Within the city", 1000], ["Outstation", "Per km", 25], ["Oxygen support", "", 500]],
  "electronics.cyber": [["Online form filling", "", 50], ["Print out", "Per page", 5], ["Aadhaar or PAN help", "", 100], ["Ticket booking", "Service charge", 50]],
  "electronics.tvrepair": [["Visit charge", "", 200], ["TV repair", "", 600], ["Mixer repair", "", 250], ["Cooler repair", "", 300]],
  "repair.cycle": [["Puncture", "", 30], ["Full service", "", 150], ["Brake setting", "", 40], ["Tube change", "", 150]],
  "repair.keymaker": [["Duplicate key", "", 50], ["Lock repair", "", 150], ["Bike key", "", 150], ["Door lock opening", "", 300]],
  "repair.watch": [["Battery change", "", 80], ["Strap change", "", 150], ["Watch service", "", 300]],
  "repair.stove": [["Gas stove service", "", 200], ["Burner change", "", 250], ["Cooker repair", "", 100], ["Pipe change", "", 200]],
  "repair.knife": [["Knife sharpening", "Per knife", 20], ["Scissors sharpening", "", 30], ["Axe sharpening", "", 50]],
  "repair.mason": [["Day's work", "Per day", 900], ["Plaster", "Per square foot", 25], ["Brick work", "Per square foot", 30]],
  "repair.tiles": [["Tile fitting", "Per square foot", 35], ["Marble polish", "Per square foot", 25], ["Bathroom tiling", "", 6000]],
  "repair.borewell": [["Motor repair", "", 600], ["Pump fitting", "", 1000], ["Boring", "Per foot", 120]],
  "home.scrap": [["Old newspaper", "Rate per kg", 14], ["Iron", "Rate per kg", 28], ["Plastic", "Rate per kg", 10], ["Cardboard", "Rate per kg", 8]],
  "home.mattress": [["Cotton mattress", "Single", 1500], ["Razai filling", "", 400], ["Pillow", "", 200]],
  "home.utensils": [["Steel plate", "", 150], ["Pressure cooker", "3 litres", 1200], ["Kadhai", "", 500], ["Steel glass", "Set of 6", 300]],
  "education.library": [["Monthly seat", "", 600], ["Day pass", "", 40], ["Locker", "Monthly", 100]],
  "education.craftclass": [["Tailoring course", "3 months", 3000], ["Embroidery class", "Monthly", 800], ["Mehendi class", "Monthly", 1000]],
  "travel.erickshaw": [["Local ride", "Per seat", 10], ["Full booking", "Local", 80], ["School trip, monthly", "", 800]],
  "travel.rickshaw": [["Local ride", "", 30], ["Market trip", "", 50], ["Hourly", "", 100]],
  "travel.driver": [["Driver, 8 hours", "", 800], ["Outstation, per day", "", 1200], ["Monthly driver", "", 15000]],
  "travel.schoolvan": [["Monthly, up to 3 km", "Per child", 1000], ["Monthly, up to 6 km", "Per child", 1500], ["One-way monthly", "Per child", 700]],
  "art.idol": [["Ganesh idol", "1 foot", 600], ["Clay idol", "Small", 150], ["Custom idol", "Per foot", 1200]],
  "art.bamboo": [["Bamboo basket", "", 150], ["Cane chair", "", 1200], ["Winnowing tray (soop)", "", 120]],
  "art.toys": [["Balloon", "", 10], ["Toy car", "", 80], ["Soft toy", "", 250], ["Balloon bunch", "", 100]],
  "events.lights": [["Light decoration", "Per day", 3000], ["Generator", "Per day", 2500], ["LED wall", "Per day", 8000]],
  "building.cement": [["OPC 53 cement", "50 kg bag", 380], ["PPC cement", "50 kg bag", 360], ["White cement", "1 kg", 40]],
  "building.steel": [["TMT bar 8 mm", "Per kg", 65], ["TMT bar 12 mm", "Per kg", 63], ["Binding wire", "Per kg", 90]],
  "building.sand": [["River sand", "Per cubic foot", 60], ["Gravel 20 mm (gitti)", "Per cubic foot", 55], ["M-sand", "Per cubic foot", 45]],
  "building.bricks": [["Red bricks", "Per 1,000", 7500], ["Fly ash bricks", "Per 1,000", 6000], ["Concrete block", "Per block", 45]],
  "building.tiles": [["Floor tiles", "Per sq ft", 45], ["Wall tiles", "Per sq ft", 40], ["Marble", "Per sq ft", 120]],
  "building.paint": [["Exterior emulsion", "20 litres", 4800], ["Interior emulsion", "20 litres", 3200], ["Primer", "20 litres", 2200]],
  "building.plumbing": [["PVC pipe 1 inch", "3 m length", 180], ["Water tank", "1,000 litres", 7000], ["Tap", "", 250]],
  "building.electrical": [["House wire 1.5 mm", "90 m coil", 1400], ["Switch board", "", 300], ["LED bulb 9 W", "", 90]],
  "building.wood": [["Plywood 18 mm", "8 × 4 ft sheet", 2600], ["Door frame", "", 3500], ["Teak wood", "Per cubic foot", 4500]],
  "building.glass": [["Window glass 5 mm", "Per sq ft", 60], ["Aluminium window", "Per sq ft", 450], ["Mirror", "Per sq ft", 90]],
  "building.roofing": [["Tin sheet", "Per sheet", 900], ["Cement sheet", "Per sheet", 650], ["Roof tiles (khaprail)", "Per 100", 1500]],
  "building.solar": [["Solar panel 330 W", "", 9000], ["Inverter battery 150 Ah", "", 14000], ["Solar street light", "", 6500]],
  "building.machinery": [["JCB", "Per hour", 1200], ["Concrete mixer", "Per day", 1500], ["Tractor trolley", "Per trip", 800]],
  "community.shg": [["Monthly saving", "", 100], ["Membership", "", 50], ["Group product", "", 200]],
  "community.gaushala": [["Feed a cow", "One day", 101], ["Monthly seva", "", 1100], ["Medical care", "", 501]],
  "community.school": [["Monthly fee", "", 1500], ["Admission fee", "", 2000], ["Exam fee", "", 300]],
  "farm.farmer": [["Wheat", "Per quintal", 2400], ["Rice", "Per quintal", 2800], ["Fresh vegetables", "Per kg", 30]],
  "farm.dairyfarm": [["Cow milk", "1 litre", 55], ["Buffalo milk", "1 litre", 70], ["Ghee", "1 kg", 700], ["Paneer", "1 kg", 380]],
  "farm.poultry": [["Eggs", "Tray of 30", 190], ["Desi eggs", "Dozen", 140], ["Live chicken", "Per kg", 160]],
  "farm.fishery": [["Rohu", "Per kg", 200], ["Catla", "Per kg", 220], ["Fish seed", "Per 1,000", 400]],
  "farm.nursery": [["Flower plant", "", 60], ["Fruit sapling", "", 150], ["Indoor plant", "", 200], ["Pot", "", 80]],
  "farm.seeds": [["Wheat seed", "Per kg", 45], ["Urea", "Bag", 270], ["DAP", "Bag", 1350], ["Pesticide", "", 350]],
  "farm.cattlefeed": [["Cattle feed", "50 kg bag", 1300], ["Khal", "Per kg", 40], ["Chara", "Per quintal", 600]],
  "farm.honey": [["Honey, small jar", "500 g", 300], ["Honey, large jar", "1 kg", 550], ["Bee wax", "250 g", 200]],
  "farm.flowergrower": [["Marigold", "Per kg", 80], ["Rose", "Per kg", 200], ["Garland flowers", "Per kg", 120]],
  "farm.mandi": [["Wheat", "Per quintal", 2450], ["Paddy", "Per quintal", 2300], ["Mustard", "Per quintal", 5600]],
  "farm.tractor": [["Tractor ploughing", "Per hour", 800], ["JCB", "Per hour", 1200], ["Trolley trip", "", 600], ["Harvester", "Per acre", 2000]],
  "work.labour": [["Day's work", "Per day", 500], ["Half day", "", 300], ["Overtime", "Per hour", 80]],
  "work.helper": [["Loading, per trip", "", 300], ["Day's work", "Per day", 500], ["Shifting help", "", 600]],
  "work.porter": [["Per bag", "", 50], ["Trolley load", "", 150], ["Station to taxi", "", 100]],
  "work.guard": [["Day shift", "12 hours", 700], ["Night shift", "12 hours", 800], ["Monthly", "", 15000]],
  "work.sweeper": [["Daily sweeping", "Monthly", 800], ["One-time cleaning", "", 400], ["Drain cleaning", "", 500]],
  "work.maid": [["Jhadu pocha", "Monthly", 1200], ["Utensils", "Monthly", 1000], ["Clothes washing", "Monthly", 1200], ["All work", "Monthly", 3500]],
  "work.babysitter": [["Day care at home", "Monthly", 6000], ["Per day", "8 hours", 400], ["Per hour", "", 80]],
  "work.eldercare": [["Day care", "12 hours", 700], ["Night care", "12 hours", 800], ["Monthly, live-in", "", 15000]],
  "work.homecook": [["One meal a day", "Monthly", 3000], ["Two meals a day", "Monthly", 5000], ["Party cooking", "Per day", 1500]],
  "work.gardener": [["Garden visit", "2 hours", 300], ["Monthly care", "", 1200], ["Tree trimming", "", 500]],
  "work.rider": [["Local delivery", "Up to 5 km", 60], ["Per km", "", 12], ["Day hire", "8 hours", 700]],
  "work.waiter": [["Event service", "Per day", 700], ["Half day", "", 400], ["Head waiter", "Per day", 1000]]
};

// The starter rows for a kind; a page type's own two samples when the
// kind has none (or none was picked).
function shopKindStarters(category, sub, pageType) {
  const own = SHOP_KIND_STARTERS[`${category}.${sub}`];
  if (own && own.length) return own;
  const t = SHOP_PAGE_TYPES[pageType];
  return t ? t.sample : [];
}

// The page type a kind belongs to: the first that lists it, in the order
// the picker shows them. This is what lets a search for "hair" set the
// type and the kind in one tap.
function shopPageTypeForKind(category, sub) {
  for (const key of SHOP_PAGE_TYPE_KEYS) {
    for (const [cat, keys] of SHOP_PAGE_TYPE_KINDS[key] || []) {
      if (cat === category && (keys === "*" || keys.indexOf(sub) >= 0)) return key;
    }
  }
  return "";
}

// The word on each item's button. "add" is the plain + the page always
// had; the rest are that same button wearing a word.
var SHOP_ITEM_BUTTONS = {
  add: { name: "Add", word: "" }, order: { name: "Order", word: "Order" }, book: { name: "Book", word: "Book" },
  join: { name: "Join", word: "Join" }, enquire: { name: "Enquire", word: "Enquire" },
  support: { name: "Support", word: "Support" }, donate: { name: "Donate", word: "Donate" }
};
var SHOP_ITEM_BUTTON_KEYS = ["add", "order", "book", "join", "enquire", "support", "donate"];

// What the list is called: the heading a customer reads, and the line on
// the owner's own "add one" button. "" is what the page said before.
var SHOP_LIST_NAMES = {
  "": { name: "What they sell", add: "Add something you sell" },
  menu: { name: "Menu", add: "Add a dish to your menu" },
  products: { name: "Products", add: "Add a product" },
  services: { name: "Services", add: "Add a service" },
  classes: { name: "Classes", add: "Add a class" },
  work: { name: "My work", add: "Add a piece of your work" },
  packages: { name: "Packages", add: "Add a package" },
  causes: { name: "Causes", add: "Add a cause" }
};
var SHOP_LIST_NAME_KEYS = ["menu", "products", "services", "classes", "work", "packages", "causes"];

// The parts of a page an owner can switch off. Everything is on unless it
// was switched off, so a shop saved before this existed shows all of it.
var SHOP_PAGE_PARTS = [
  { key: "list", field: "hideList", name: "Your list", note: "Items with their prices" },
  { key: "where", field: "hideWhere", name: "Timings and address", note: "Open or closed, with Directions" },
  { key: "contacts", field: "hideContacts", name: "WhatsApp, Call and Instagram", note: "The buttons under your name" },
  { key: "reviews", field: "hideReviews", name: "Reviews", note: "Stars and what people wrote" }
];

// Everything picking a page type writes: its words, its layout, and its
// parts (the ones it hides off, every other one back on).
function shopPageTypeDials(key) {
  const t = SHOP_PAGE_TYPES[key];
  if (!t) return {};
  const out = Object.assign({ pageType: key }, t.set);
  for (const part of SHOP_PAGE_PARTS) out[part.field] = t.hide.indexOf(part.key) >= 0;
  return out;
}

var SHOP_BUTTON_STYLES = { filled: { name: "Filled" }, outline: { name: "Outline" }, soft: { name: "Soft" } };
var SHOP_HERO_STYLES = { gradient: { name: "Gradient" }, solid: { name: "Solid" }, glass: { name: "Glass" }, minimal: { name: "Minimal" } };
var SHOP_COVER_STYLES = { photo: { name: "Photo" }, gradient: { name: "Colour" }, pattern: { name: "Pattern" } };
var SHOP_PATTERNS = { dots: { name: "Dots" }, stripes: { name: "Stripes" }, rangoli: { name: "Rangoli" }, grid: { name: "Grid" } };

function shopStyleKey(table, value, fallback) {
  return table[value] ? value : (table[fallback] ? fallback : Object.keys(table)[0]);
}

// A cover drawn in the shop's colour, for shops with no photo or that
// chose one. SVG as a data URL, so it costs no request and the CSP's
// img-src data: already allows it.
function shopPatternCss(pattern, color, dark) {
  const ink = encodeURIComponent(dark ? shopHexMix(color, "#FFFFFF", 0.25) : color);
  const tiles = {
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='11' cy='11' r='2.4' fill='${ink}' fill-opacity='.35'/></svg>`,
    stripes: `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'><path d='M-4 22L22 -4M5 23L23 5' stroke='${ink}' stroke-opacity='.22' stroke-width='3'/></svg>`,
    grid: `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><path d='M26 0H0V26' fill='none' stroke='${ink}' stroke-opacity='.25' stroke-width='1.4'/><path d='M13 9v8M9 13h8' stroke='${ink}' stroke-opacity='.3' stroke-width='1.6'/></svg>`,
    rangoli: `<svg xmlns='http://www.w3.org/2000/svg' width='52' height='52'><g transform='translate(26 26)' fill='${ink}' fill-opacity='.3'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse rx='3.2' ry='9' transform='rotate(${a}) translate(0 -10)'/>`).join("")}<circle r='3.6'/></g><circle cx='0' cy='0' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='52' cy='0' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='0' cy='52' r='3' fill='${ink}' fill-opacity='.25'/><circle cx='52' cy='52' r='3' fill='${ink}' fill-opacity='.25'/></svg>`
  };
  const tile = tiles[pattern] || tiles.dots;
  const ground = dark ? shopHexMix("#120E0C", color, 0.3) : shopHexMix("#FFFFFF", color, 0.16);
  return `url("data:image/svg+xml,${tile.replace(/#/g, "%23").replace(/"/g, "'")}") ${ground}`;
}

// The Add button and the badge in the shop's chosen style. The PRICE is
// never styled by this — see SHOP_THEME_FORBIDDEN.
function shopButtonStyle(theme) {
  const ink = theme.dark ? theme.color : theme.hero.from;
  if (theme.buttons === "outline") return { background: "transparent", color: ink, boxShadow: `inset 0 0 0 1.5px ${ink}` };
  if (theme.buttons === "soft") return { background: theme.soft, color: ink, boxShadow: "none" };
  return { background: theme.hero.from, color: "#fff", boxShadow: "none" };
}

// The twelve a shop may pick from.
//
// A fixed palette rather than a colour wheel, and that is deliberate: every
// one of these has been checked to carry white text at the weights this app
// sets, so no owner can accidentally choose a yellow that makes their own
// Add button unreadable. The freedom worth having is "which of these", not
// "any of sixteen million, including the broken ones".
var SHOP_COLORS = [
  "#C2663A", "#B2473F", "#9A6A2F", "#4F7A46",
  "#2F7A74", "#2E5E9E", "#4A4BA8", "#7C3AED",
  "#A3327E", "#5A4636", "#36414E", "#1F6B4B"
];

var SHOP_FONTS = {
  grotesk: { name: "Space Grotesk", note: "The app's own", stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif", weight: 800, family: null },
  fraunces: { name: "Fraunces", note: "Warm, editorial", stack: "'Fraunces', Georgia, serif", weight: 800, family: "Fraunces:wght@800" },
  inter: { name: "Inter", note: "Plain and clear", stack: "Inter, ui-sans-serif, system-ui, sans-serif", weight: 800, family: null },
  mono: { name: "DM Mono", note: "Technical", stack: "'DM Mono', ui-monospace, monospace", weight: 500, family: "DM+Mono:wght@500" },
  // ── FONTS THAT CARRY BOTH SCRIPTS ──────────────────────────────────────
  //
  // The four above are Latin-only: a name like रसोई Ghar set in them drew
  // its Hindi half in whatever the phone had, so the two halves of one
  // name came out in two different typefaces. Every font below draws
  // Devanagari AND Latin from one design, which is what the founder's
  // "Clean / Classic / Bold" suggestions are picked from.
  mukta: { name: "Mukta", note: "Clean", stack: "'Mukta', ui-sans-serif, system-ui, sans-serif", weight: 800, family: "Mukta:wght@800" },
  tiro: { name: "Tiro Devanagari", note: "Classic", stack: "'Tiro Devanagari Hindi', Georgia, serif", weight: 400, family: "Tiro+Devanagari+Hindi" },
  baloo: { name: "Baloo 2", note: "Bold", stack: "'Baloo 2', ui-sans-serif, system-ui, sans-serif", weight: 800, family: "Baloo+2:wght@800" },
  poppins: { name: "Poppins", note: "Round and modern", stack: "'Poppins', ui-sans-serif, system-ui, sans-serif", weight: 700, family: "Poppins:wght@700" },
  hind: { name: "Hind", note: "Plain, newsprint", stack: "'Hind', ui-sans-serif, system-ui, sans-serif", weight: 700, family: "Hind:wght@700" },
  rozha: { name: "Rozha One", note: "Signboard serif", stack: "'Rozha One', Georgia, serif", weight: 400, family: "Rozha+One" },
  yatra: { name: "Yatra One", note: "Festive", stack: "'Yatra One', ui-sans-serif, system-ui, sans-serif", weight: 400, family: "Yatra+One" },
  kalam: { name: "Kalam", note: "Handwritten", stack: "'Kalam', cursive", weight: 700, family: "Kalam:wght@700" },
  teko: { name: "Teko", note: "Tall and tight", stack: "'Teko', ui-sans-serif, system-ui, sans-serif", weight: 600, family: "Teko:wght@600" }
};

// The three suggestions shown under the name while it is being typed, in
// the order the founder named them. Everything else is behind "More fonts".
var SHOP_FONT_QUICK = [
  { key: "mukta", label: "Clean" },
  { key: "tiro", label: "Classic" },
  { key: "baloo", label: "Bold" }
];

// Loads a shop font the first time something draws with it.
//
// index.html loads only the app's own two faces. Fraunces and DM Mono were
// offered by the Look screen from the start and never loaded, so picking
// them changed nothing visible on most phones. One <link> per family, added
// once, with display=swap so a slow connection shows the name in the
// fallback rather than not at all.
function ensureShopFont(key) {
  const f = SHOP_FONTS[key];
  if (!f || !f.family || typeof document === "undefined") return;
  const id = `shop-font-${key}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.family}&display=swap`;
  document.head.appendChild(link);
}

// Corner radii, in px. "leaf" is the one asymmetric option — three rounded
// corners and one square — which reads as a deliberate mark rather than as a
// rounding mistake, and costs nothing to support because it is still one
// borderRadius string.
var SHOP_CORNERS = {
  sharp: { name: "Sharp", card: "2px", pill: "4px", mark: "4px", photo: "2px" },
  soft: { name: "Soft", card: "9px", pill: "9px", mark: "10px", photo: "8px" },
  round: { name: "Round", card: "18px", pill: "12px", mark: "20px", photo: "15px" },
  leaf: { name: "Leaf", card: "20px 20px 20px 4px", pill: "12px", mark: "22px 22px 22px 5px", photo: "16px 16px 16px 4px" }
};

var SHOP_DENSITY = {
  compact: { name: "Compact", rowPad: "7px 10px", gap: 6, thumb: 46, sectionGap: 13 },
  cosy: { name: "Cosy", rowPad: "10px 12px", gap: 9, thumb: 54, sectionGap: 18 },
  roomy: { name: "Roomy", rowPad: "15px 16px", gap: 13, thumb: 60, sectionGap: 24 }
};

// How the things a shop sells are laid out. The owner picks under Look:
// a list reads like a price board, a grid like a shop window. List is the
// default because it is what every shop already had.
var SHOP_LAYOUTS = {
  list: { name: "List" },
  grid: { name: "Grid" }
};

var SHOP_PHOTO_SHAPES = {
  rounded: { name: "Rounded", ratio: 1, radius: null },
  circle: { name: "Circle", ratio: 1, radius: "50%" },
  wide: { name: "Wide", ratio: 1.45, radius: null },
  tall: { name: "Tall", ratio: 0.74, radius: null }
};

// ── THE GUARD ───────────────────────────────────────────────────────────
//
// The names of every surface a theme is allowed to touch. Anything a shop
// can restyle must appear here; anything to do with money must not. It
// exists so the rule at the top of this file is a list a test can read
// rather than a sentence somebody has to remember.
var SHOP_THEME_SURFACES = [
  "cover", "mark", "name", "tagline", "chip", "sectionHeading",
  "card", "cardEdge", "thumb", "addButton", "badge", "announce"
];

// And the ones it must never reach, for the same reason.
var SHOP_THEME_FORBIDDEN = ["price", "geuPair", "cartTotal", "payButton"];

// ── THE SHOP'S COLOUR, AS A PAGE ────────────────────────────────────────
//
// "Shop's own colour": the page takes the colour the owner picked rather
// than the app's lavender, so two shops side by side feel like two places.
// Three small pieces of arithmetic, all on #RRGGBB strings that have
// already been through the palette check above.

function shopHexMix(hex, toward, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (shift) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

function shopLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// The card behind the shop's name carries WHITE text, so its colour is
// darkened until white reads on it at 4.5:1. Every palette colour already
// passes; the Night preset's gold does not, and without this its name sat
// white-on-mustard.
function shopHeroInk(color) {
  let from = color;
  for (let i = 0; i < 12 && (1.05 / (shopLuminance(from) + 0.05)) < 4.5; i++) {
    from = shopHexMix(from, "#000000", 0.08);
  }
  return { from, to: shopHexMix(from, "#000000", 0.3), glow: `${from}55` };
}

// A theme's starting dials. A retired theme keeps its own (font, corners,
// dark and the rest) under its new look's colour, so a shop saved as
// "Chai Stall" still has Chai Stall's round photos and Baloo type.
function shopThemeBase(key) {
  const look = SHOP_THEMES[shopThemeKey(key)];
  const old = SHOP_THEMES_RETIRED_DIALS[key];
  return old && !SHOP_THEMES[key] ? Object.assign({}, old, { name: look.name, note: look.note, color: look.color, look: look.look }) : look;
}

// A stored colour is only honoured if it is one of ours.
//
// Not fussiness: this string is interpolated into a style attribute, and the
// palette is the whole validation. An arbitrary value out of the database
// would be a place for something that is not a colour to end up in CSS.
function shopThemeColor(value, fallback) {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  for (const c of SHOP_COLORS) if (c.toUpperCase() === raw) return c;
  // …or the colour of one of the twenty looks, which is what a theme sets.
  for (const k of SHOP_THEME_KEYS) if (SHOP_THEMES[k].color === raw) return raw;
  return fallback;
}

// Everything a shop stored, resolved into values a component can use.
//
// Each field falls back to its preset, and the preset falls back to Gloobal,
// so a half-written settings object from an older version of the app renders
// as the app's own look rather than as a hole.
function resolveShopTheme(shop) {
  const s = shop && typeof shop === "object" ? shop : {};
  const key = shopThemeKey(s.theme);
  const base = shopThemeBase(s.theme);
  // The look's own palette, for the page: its paper, ink and lines.
  const pal = gloobalLookPalette(key, key.split(".")[1]);

  const color = shopThemeColor(s.color, base.color);
  const fontKey = SHOP_FONTS[s.font] ? s.font : base.font;
  const font = SHOP_FONTS[fontKey];
  const corners = SHOP_CORNERS[s.corners] || SHOP_CORNERS[base.corners];
  const cards = ["raised", "flat", "outline", "plain"].indexOf(s.cards) >= 0 ? s.cards : base.cards;
  const density = SHOP_DENSITY[s.density] || SHOP_DENSITY[base.density];
  const photo = SHOP_PHOTO_SHAPES[s.photoShape] || SHOP_PHOTO_SHAPES[base.photoShape];
  const dark = typeof s.dark === "boolean" ? s.dark : base.dark;
  const layout = SHOP_LAYOUTS[s.layout] ? s.layout : (SHOP_LAYOUTS[base.layout] ? base.layout : "list");
  const buttons = shopStyleKey(SHOP_BUTTON_STYLES, s.buttons, base.buttons);
  const heroStyle = shopStyleKey(SHOP_HERO_STYLES, s.heroStyle, base.heroStyle);
  const coverStyle = shopStyleKey(SHOP_COVER_STYLES, s.coverStyle, base.coverStyle);
  const pattern = shopStyleKey(SHOP_PATTERNS, s.pattern, base.pattern);

  // A soft wash of the shop's colour, for chip and badge backgrounds. Mixed
  // against the page rather than stored, so one stored colour is enough and a
  // dark shop gets a dark wash rather than a pale one that would glare.
  const soft = dark ? `${color}2E` : `${color}1A`;

  return {
    key,
    name: base.name,
    note: base.note,
    color,
    soft,
    dark,
    font,
    fontKey,
    corners,
    cards,
    density,
    photo,
    layout,
    buttons,
    heroStyle,
    coverStyle,
    pattern,
    hero: shopHeroInk(color),
    // The page's own surfaces under this theme, washed with the shop's
    // colour: a light shop gets a pale tint of it instead of the app's
    // lavender, a dark shop a near-black leaning toward it. Cards stay
    // white on a light page so prices sit on the same ground everywhere.
    //
    // Under the theme's own colour the page IS the look — the same paper,
    // ink and lines that look has in the app. An owner's own colour tints
    // the paper and lines toward itself instead, as it always did.
    // The kind of page, its words and its parts (SHOP_PAGE_TYPES).
    pageType: SHOP_PAGE_TYPES[s.pageType] ? s.pageType : "",
    itemButton: SHOP_ITEM_BUTTONS[s.itemButton] ? s.itemButton : "add",
    itemWord: (SHOP_ITEM_BUTTONS[s.itemButton] || SHOP_ITEM_BUTTONS.add).word,
    listName: (SHOP_LIST_NAMES[s.listName] || SHOP_LIST_NAMES[""]).name,
    listAdd: (SHOP_LIST_NAMES[s.listName] || SHOP_LIST_NAMES[""]).add,
    hideList: s.hideList === true,
    hideWhere: s.hideWhere === true,
    hideContacts: s.hideContacts === true,
    hideReviews: s.hideReviews === true,
    look: key,
    page: dark ? shopHexMix("#120E0C", color, 0.09) : color === base.color ? pal.bg : shopHexMix("#FFFFFF", color, 0.07),
    surface: dark ? shopHexMix("#221B17", color, 0.08) : pal.surface,
    ink: dark ? "#F3EBE1" : pal.ink,
    inkSoft: dark ? "#C3B5A5" : pal.inkSoft,
    inkFaint: dark ? "#9A8B7B" : pal.inkFaint,
    line: dark ? shopHexMix("#2E2620", color, 0.16) : color === base.color ? pal.line : shopHexMix(pal.line, color, 0.18)
  };
}

// The edge treatment, as a style fragment. Four looks from one switch, so a
// card cannot end up raised AND outlined by two settings disagreeing.
function shopCardStyle(theme) {
  const base = { borderRadius: theme.corners.card, background: theme.surface };
  if (theme.cards === "raised") return { ...base, boxShadow: theme.dark ? "0 2px 10px rgba(0,0,0,.35)" : T.shadowCard };
  if (theme.cards === "outline") return { ...base, background: "none", border: `1.5px solid ${theme.line}` };
  if (theme.cards === "flat") return { ...base, background: theme.dark ? "#2C241E" : T.surfaceAlt };
  // plain: no fill, no edge — just the row, separated by space
  return { borderRadius: theme.corners.card, background: "none" };
}

// The thumbnail's box for a given photo shape. Width is the density's thumb
// size; height follows the shape's ratio, so "wide" is wider than it is tall
// and the row's height follows rather than the photo being squashed into a
// square it was not framed for.
function shopThumbBox(theme) {
  const w = theme.density.thumb;
  const h = Math.round(w / (theme.photo.ratio || 1));
  return {
    width: theme.photo.ratio >= 1 ? Math.round(h * theme.photo.ratio) : w,
    height: theme.photo.ratio >= 1 ? h : Math.round(w / theme.photo.ratio),
    borderRadius: theme.photo.radius || theme.corners.photo
  };
}

// Is this announcement worth drawing? Blank text means the owner cleared it,
// which is the same as switching it off and must not leave a coloured band
// with nothing in it.
function shopAnnouncement(shop) {
  const s = shop && typeof shop === "object" ? shop : {};
  const text = typeof s.announceText === "string" ? s.announceText.trim() : "";
  if (!text || s.announceOn === false) return null;
  return { text, color: shopThemeColor(s.announceColor, resolveShopTheme(s).color) };
}
