// src/features/choices/choicesIcons.js
//
// The icon library a category is chosen from.
//
// GENERATED SHAPE, HAND-CURATED CONTENT. Every entry carries a name and a
// few keywords as well as the glyph, and those are what make the set
// usable rather than merely large: 323 icons in a plain grid is a
// worse experience than twenty, because nobody scrolls that far. The
// keywords drive the search box AND choicesSuggestIcon, which proposes an
// icon from the category's own name as it is typed. That suggestion is the
// manual stand-in for generating one later; when that arrives it replaces
// choicesSuggestIcon alone and nothing else here has to move.
//
// Emoji are written as escapes, as everywhere else in this tree, so the
// file stays greppable and diffable and cannot be mangled by an editor
// that guesses at an encoding.
//
// A category is NOT limited to this set — the stored icon is whatever
// character was chosen, so a keyboard emoji works just as well. This is
// the shortcut, not the vocabulary.

var CHOICES_ICON_GROUPS = [
  { key: "money", label: "Money" },
  { key: "food", label: "Food & drink" },
  { key: "home", label: "Home" },
  { key: "transport", label: "Travel" },
  { key: "health", label: "Health" },
  { key: "family", label: "Family" },
  { key: "pets", label: "Pets" },
  { key: "shopping", label: "Shopping" },
  { key: "work", label: "Work" },
  { key: "learning", label: "Learning" },
  { key: "leisure", label: "Leisure" },
  { key: "sport", label: "Sport" },
  { key: "tech", label: "Tech" },
  { key: "beauty", label: "Beauty" },
  { key: "nature", label: "Nature" },
  { key: "celebration", label: "Occasions" },
  { key: "services", label: "Services" },
  { key: "symbols", label: "Marks" }
];

var CHOICES_ICON_SET = [
  { c: "\u{1F4B0}", n: "money bag", g: "money", k: "cash savings fund wealth" },
  { c: "\u{1F4B5}", n: "cash", g: "money", k: "note bill dollar payment" },
  { c: "\u{1F4B4}", n: "yen note", g: "money", k: "cash japan" },
  { c: "\u{1F4B6}", n: "euro note", g: "money", k: "cash europe" },
  { c: "\u{1F4B7}", n: "pound note", g: "money", k: "cash britain" },
  { c: "\u{1FA99}", n: "coin", g: "money", k: "change cash small" },
  { c: "\u{1F4B3}", n: "card", g: "money", k: "credit debit payment bank" },
  { c: "\u{1F3E6}", n: "bank", g: "money", k: "account branch savings" },
  { c: "\u{1F9FE}", n: "bill", g: "money", k: "receipt invoice utility statement" },
  { c: "\u{1F4C8}", n: "rising chart", g: "money", k: "invest growth profit market" },
  { c: "\u{1F4C9}", n: "falling chart", g: "money", k: "loss market decline" },
  { c: "\u{1F4B1}", n: "exchange", g: "money", k: "currency forex convert" },
  { c: "\u{1F3E7}", n: "atm", g: "money", k: "cash withdraw machine" },
  { c: "\u{1F4B8}", n: "money flying", g: "money", k: "spend expense outgoing" },
  { c: "\u{1F9EE}", n: "abacus", g: "money", k: "budget count maths" },
  { c: "\u{1F510}", n: "locked", g: "money", k: "savings secure deposit" },
  { c: "\u{1FAAA}", n: "id card", g: "money", k: "licence identity kyc" },
  { c: "\u{1F4CA}", n: "bar chart", g: "money", k: "report stats figures" },
  { c: "\u{1F354}", n: "burger", g: "food", k: "fast meal lunch dinner eat" },
  { c: "\u{1F355}", n: "pizza", g: "food", k: "takeaway slice dinner" },
  { c: "\u{1F35C}", n: "noodles", g: "food", k: "ramen soup bowl" },
  { c: "\u{1F363}", n: "sushi", g: "food", k: "japanese fish" },
  { c: "\u{1F957}", n: "salad", g: "food", k: "healthy greens veg" },
  { c: "\u{1F34E}", n: "apple", g: "food", k: "fruit healthy snack" },
  { c: "\u{1F34C}", n: "banana", g: "food", k: "fruit snack" },
  { c: "\u{1F966}", n: "broccoli", g: "food", k: "vegetable greens veg" },
  { c: "\u{1F370}", n: "cake", g: "food", k: "dessert sweet birthday" },
  { c: "\u{1F366}", n: "ice cream", g: "food", k: "dessert sweet cold" },
  { c: "\u{1F950}", n: "croissant", g: "food", k: "bakery bread breakfast" },
  { c: "\u{1F35E}", n: "bread", g: "food", k: "bakery loaf staple" },
  { c: "\u{1F95B}", n: "milk", g: "food", k: "dairy drink" },
  { c: "\u2615", n: "coffee", g: "food", k: "cafe drink morning" },
  { c: "\u{1F375}", n: "tea", g: "food", k: "chai drink" },
  { c: "\u{1F9C3}", n: "juice", g: "food", k: "drink carton" },
  { c: "\u{1F964}", n: "soft drink", g: "food", k: "soda cup" },
  { c: "\u{1F37A}", n: "beer", g: "food", k: "drink pub alcohol" },
  { c: "\u{1F377}", n: "wine", g: "food", k: "drink alcohol" },
  { c: "\u{1F95A}", n: "egg", g: "food", k: "breakfast protein" },
  { c: "\u{1F35A}", n: "rice", g: "food", k: "staple grain meal" },
  { c: "\u{1F32E}", n: "taco", g: "food", k: "mexican" },
  { c: "\u{1F36B}", n: "chocolate", g: "food", k: "sweet snack" },
  { c: "\u{1F36A}", n: "biscuit", g: "food", k: "cookie snack sweet" },
  { c: "\u{1F9C2}", n: "salt", g: "food", k: "spice seasoning" },
  { c: "\u{1F958}", n: "pan", g: "food", k: "cooking curry dish" },
  { c: "\u{1F37D}\uFE0F", n: "cutlery", g: "food", k: "restaurant dining eat out" },
  { c: "\u{1F6D2}", n: "groceries", g: "food", k: "shopping supermarket market" },
  { c: "\u{1F969}", n: "meat", g: "food", k: "protein butcher" },
  { c: "\u{1F41F}", n: "fish", g: "food", k: "seafood protein" },
  { c: "\u{1F36F}", n: "honey", g: "food", k: "sweet jar" },
  { c: "\u{1F336}\uFE0F", n: "chilli", g: "food", k: "spice hot" },
  { c: "\u{1F3E0}", n: "house", g: "home", k: "rent living property" },
  { c: "\u{1F3E1}", n: "house garden", g: "home", k: "property living" },
  { c: "\u{1F3E2}", n: "building", g: "home", k: "office flat apartment" },
  { c: "\u{1F6CF}\uFE0F", n: "bed", g: "home", k: "bedroom sleep furniture" },
  { c: "\u{1F6CB}\uFE0F", n: "sofa", g: "home", k: "furniture living room" },
  { c: "\u{1F6BF}", n: "shower", g: "home", k: "bathroom water" },
  { c: "\u{1F6BD}", n: "toilet", g: "home", k: "bathroom plumbing" },
  { c: "\u{1F9F9}", n: "broom", g: "home", k: "cleaning chores" },
  { c: "\u{1F9FD}", n: "sponge", g: "home", k: "cleaning washing" },
  { c: "\u{1F9FA}", n: "laundry", g: "home", k: "washing clothes basket" },
  { c: "\u{1FAA3}", n: "bucket", g: "home", k: "cleaning water" },
  { c: "\u{1F511}", n: "key", g: "home", k: "rent deposit lock access" },
  { c: "\u{1FA91}", n: "chair", g: "home", k: "furniture seat" },
  { c: "\u{1F6AA}", n: "door", g: "home", k: "entry repair" },
  { c: "\u{1FA9F}", n: "window", g: "home", k: "glass repair" },
  { c: "\u{1F4A1}", n: "bulb", g: "home", k: "light electricity power" },
  { c: "\u{1F50C}", n: "plug", g: "home", k: "electricity power socket" },
  { c: "\u{1F525}", n: "flame", g: "home", k: "gas heating fuel" },
  { c: "\u{1F4A7}", n: "water drop", g: "home", k: "water bill supply" },
  { c: "\u{1F321}\uFE0F", n: "thermometer", g: "home", k: "heating temperature" },
  { c: "\u{1F9F0}", n: "toolbox", g: "home", k: "repair maintenance diy" },
  { c: "\u{1F528}", n: "hammer", g: "home", k: "repair diy build" },
  { c: "\u{1FA9C}", n: "ladder", g: "home", k: "repair diy" },
  { c: "\u{1F9EF}", n: "extinguisher", g: "home", k: "safety fire" },
  { c: "\u{1FAB4}", n: "plant", g: "home", k: "garden indoor" },
  { c: "\u{1F697}", n: "car", g: "transport", k: "drive vehicle fuel" },
  { c: "\u{1F695}", n: "taxi", g: "transport", k: "cab ride" },
  { c: "\u{1F68C}", n: "bus", g: "transport", k: "commute public" },
  { c: "\u{1F686}", n: "train", g: "transport", k: "rail commute" },
  { c: "\u{1F687}", n: "metro", g: "transport", k: "subway underground commute" },
  { c: "\u2708\uFE0F", n: "plane", g: "transport", k: "flight travel holiday" },
  { c: "\u{1F6A2}", n: "ship", g: "transport", k: "ferry boat cruise" },
  { c: "\u{1F6F5}", n: "scooter", g: "transport", k: "moped ride delivery" },
  { c: "\u{1F3CD}\uFE0F", n: "motorbike", g: "transport", k: "bike ride" },
  { c: "\u{1F6B2}", n: "bicycle", g: "transport", k: "cycle ride" },
  { c: "\u26FD", n: "fuel", g: "transport", k: "petrol diesel gas station" },
  { c: "\u{1F17F}\uFE0F", n: "parking", g: "transport", k: "car park" },
  { c: "\u{1F6E3}\uFE0F", n: "road", g: "transport", k: "toll motorway highway" },
  { c: "\u{1F9F3}", n: "luggage", g: "transport", k: "travel suitcase trip" },
  { c: "\u{1F5FA}\uFE0F", n: "map", g: "transport", k: "travel trip route" },
  { c: "\u{1F3E8}", n: "hotel", g: "transport", k: "stay accommodation travel" },
  { c: "\u{1F3D5}\uFE0F", n: "camping", g: "transport", k: "tent outdoors holiday" },
  { c: "\u{1F3AB}", n: "ticket", g: "transport", k: "fare entry booking" },
  { c: "\u{1F6C2}", n: "passport control", g: "transport", k: "visa border travel" },
  { c: "\u{1F681}", n: "helicopter", g: "transport", k: "charter flight" },
  { c: "\u{1FA7A}", n: "stethoscope", g: "health", k: "doctor clinic medical checkup" },
  { c: "\u{1F48A}", n: "pills", g: "health", k: "medicine pharmacy prescription" },
  { c: "\u{1F489}", n: "injection", g: "health", k: "vaccine jab medical" },
  { c: "\u{1F3E5}", n: "hospital", g: "health", k: "clinic medical emergency" },
  { c: "\u{1F9B7}", n: "tooth", g: "health", k: "dentist dental" },
  { c: "\u{1F453}", n: "glasses", g: "health", k: "optician eyes vision" },
  { c: "\u{1FA79}", n: "plaster", g: "health", k: "first aid injury" },
  { c: "\u{1F9F4}", n: "lotion", g: "health", k: "care cream bottle" },
  { c: "\u{1F9D8}", n: "yoga", g: "health", k: "wellness meditation calm" },
  { c: "\u{1FAC0}", n: "heart organ", g: "health", k: "cardio medical" },
  { c: "\u{1F9E0}", n: "brain", g: "health", k: "mental therapy mind" },
  { c: "\u{1F9BE}", n: "prosthetic", g: "health", k: "mobility support" },
  { c: "\u267F", n: "accessibility", g: "health", k: "mobility wheelchair support" },
  { c: "\u{1FA7B}", n: "x-ray", g: "health", k: "scan imaging medical" },
  { c: "\u{1F9EC}", n: "dna", g: "health", k: "genetics lab test" },
  { c: "\u{1F321}\uFE0F", n: "temperature", g: "health", k: "fever thermometer" },
  { c: "\u{1F476}", n: "baby", g: "family", k: "child infant nappy care" },
  { c: "\u{1F9D2}", n: "child", g: "family", k: "kid" },
  { c: "\u{1F466}", n: "boy", g: "family", k: "son kid" },
  { c: "\u{1F467}", n: "girl", g: "family", k: "daughter kid" },
  { c: "\u{1F469}", n: "woman", g: "family", k: "mother wife partner" },
  { c: "\u{1F468}", n: "man", g: "family", k: "father husband partner" },
  { c: "\u{1F475}", n: "grandmother", g: "family", k: "elder nani parent" },
  { c: "\u{1F474}", n: "grandfather", g: "family", k: "elder nana parent" },
  { c: "\u{1F46A}", n: "family", g: "family", k: "household relatives" },
  { c: "\u{1F91D}", n: "handshake", g: "family", k: "friend agreement support" },
  { c: "\u{1F48D}", n: "ring", g: "family", k: "wedding marriage engagement" },
  { c: "\u{1F37C}", n: "bottle", g: "family", k: "baby feeding infant" },
  { c: "\u{1F9F8}", n: "teddy", g: "family", k: "toy child kids" },
  { c: "\u{1F6BC}", n: "baby symbol", g: "family", k: "infant child" },
  { c: "\u{1F46B}", n: "couple", g: "family", k: "partner friends" },
  { c: "\u{1FAC2}", n: "hug", g: "family", k: "support care friends" },
  { c: "\u{1F436}", n: "dog", g: "pets", k: "puppy animal vet" },
  { c: "\u{1F431}", n: "cat", g: "pets", k: "kitten animal vet" },
  { c: "\u{1F41F}", n: "fish tank", g: "pets", k: "aquarium animal" },
  { c: "\u{1F426}", n: "bird", g: "pets", k: "animal cage" },
  { c: "\u{1F430}", n: "rabbit", g: "pets", k: "bunny animal" },
  { c: "\u{1F439}", n: "hamster", g: "pets", k: "animal small" },
  { c: "\u{1F422}", n: "tortoise", g: "pets", k: "turtle animal" },
  { c: "\u{1F434}", n: "horse", g: "pets", k: "riding stable animal" },
  { c: "\u{1F9B4}", n: "bone", g: "pets", k: "dog treat food" },
  { c: "\u{1F43E}", n: "paw", g: "pets", k: "animal vet grooming" },
  { c: "\u{1F6CD}\uFE0F", n: "shopping bags", g: "shopping", k: "retail buy purchase" },
  { c: "\u{1F455}", n: "t-shirt", g: "shopping", k: "clothes clothing apparel" },
  { c: "\u{1F457}", n: "dress", g: "shopping", k: "clothes clothing apparel" },
  { c: "\u{1F456}", n: "jeans", g: "shopping", k: "clothes trousers apparel" },
  { c: "\u{1F45F}", n: "trainers", g: "shopping", k: "shoes footwear" },
  { c: "\u{1F460}", n: "heels", g: "shopping", k: "shoes footwear" },
  { c: "\u{1F9E5}", n: "coat", g: "shopping", k: "clothes jacket winter" },
  { c: "\u{1F9E6}", n: "socks", g: "shopping", k: "clothes" },
  { c: "\u{1F45C}", n: "handbag", g: "shopping", k: "bag accessory" },
  { c: "\u{1F576}\uFE0F", n: "sunglasses", g: "shopping", k: "accessory eyewear" },
  { c: "\u231A", n: "watch", g: "shopping", k: "accessory time" },
  { c: "\u{1F48E}", n: "gem", g: "shopping", k: "jewellery luxury" },
  { c: "\u{1F381}", n: "gift", g: "shopping", k: "present celebration" },
  { c: "\u{1F3F7}\uFE0F", n: "tag", g: "shopping", k: "price sale discount" },
  { c: "\u{1F9E2}", n: "cap", g: "shopping", k: "hat clothes" },
  { c: "\u{1F6D2}", n: "trolley", g: "shopping", k: "supermarket groceries" },
  { c: "\u{1F4BC}", n: "briefcase", g: "work", k: "job business office salary" },
  { c: "\u{1F3E2}", n: "office", g: "work", k: "company workplace" },
  { c: "\u{1F5A5}\uFE0F", n: "desktop", g: "work", k: "computer office" },
  { c: "\u{1F4BB}", n: "laptop", g: "work", k: "computer freelance remote" },
  { c: "\u{1F4F1}", n: "phone", g: "work", k: "mobile device contact" },
  { c: "\u{1F4DE}", n: "telephone", g: "work", k: "call contact" },
  { c: "\u{1F4E0}", n: "fax", g: "work", k: "office admin" },
  { c: "\u{1F5A8}\uFE0F", n: "printer", g: "work", k: "office print" },
  { c: "\u{1F4CE}", n: "paperclip", g: "work", k: "admin documents" },
  { c: "\u{1F4C1}", n: "folder", g: "work", k: "files admin records" },
  { c: "\u{1F4DD}", n: "notes", g: "work", k: "writing admin memo" },
  { c: "\u270D\uFE0F", n: "writing", g: "work", k: "sign contract" },
  { c: "\u{1F4CB}", n: "clipboard", g: "work", k: "tasks list admin" },
  { c: "\u23F0", n: "alarm", g: "work", k: "time schedule hours" },
  { c: "\u{1F5D3}\uFE0F", n: "calendar", g: "work", k: "schedule date planning" },
  { c: "\u{1F911}", n: "earnings", g: "work", k: "salary income profit" },
  { c: "\u{1F9D1}\u200D\u{1F527}", n: "engineer", g: "work", k: "trade repair technician" },
  { c: "\u{1F477}", n: "builder", g: "work", k: "construction trade site" },
  { c: "\u{1F9D1}\u200D\u{1F373}", n: "chef", g: "work", k: "cooking catering" },
  { c: "\u{1F69A}", n: "delivery", g: "work", k: "logistics freight courier" },
  { c: "\u{1F4E6}", n: "parcel", g: "work", k: "delivery shipping post" },
  { c: "\u{1F4EE}", n: "postbox", g: "work", k: "post mail" },
  { c: "\u{1F393}", n: "graduation", g: "learning", k: "school university degree education" },
  { c: "\u{1F4DA}", n: "books", g: "learning", k: "study reading education" },
  { c: "\u{1F4D6}", n: "open book", g: "learning", k: "reading study" },
  { c: "\u{1F3EB}", n: "school", g: "learning", k: "education fees class" },
  { c: "\u270F\uFE0F", n: "pencil", g: "learning", k: "stationery writing school" },
  { c: "\u{1F58A}\uFE0F", n: "pen", g: "learning", k: "stationery writing" },
  { c: "\u{1F4D0}", n: "ruler", g: "learning", k: "geometry stationery" },
  { c: "\u{1F52C}", n: "microscope", g: "learning", k: "science lab research" },
  { c: "\u{1F52D}", n: "telescope", g: "learning", k: "science astronomy" },
  { c: "\u{1F9EA}", n: "test tube", g: "learning", k: "science lab chemistry" },
  { c: "\u{1F5C2}\uFE0F", n: "dividers", g: "learning", k: "organise files study" },
  { c: "\u{1F9D1}\u200D\u{1F3EB}", n: "teacher", g: "learning", k: "tuition class lesson" },
  { c: "\u{1F392}", n: "backpack", g: "learning", k: "school bag student" },
  { c: "\u{1F310}", n: "globe", g: "learning", k: "language world internet" },
  { c: "\u{1F3AC}", n: "film", g: "leisure", k: "cinema movie entertainment" },
  { c: "\u{1F3AE}", n: "gaming", g: "leisure", k: "console games entertainment" },
  { c: "\u{1F3B5}", n: "music", g: "leisure", k: "song audio entertainment" },
  { c: "\u{1F3A7}", n: "headphones", g: "leisure", k: "music audio" },
  { c: "\u{1F3A4}", n: "microphone", g: "leisure", k: "singing karaoke" },
  { c: "\u{1F3B8}", n: "guitar", g: "leisure", k: "music instrument" },
  { c: "\u{1F3B9}", n: "piano", g: "leisure", k: "music instrument" },
  { c: "\u{1F3A8}", n: "art", g: "leisure", k: "painting creative hobby" },
  { c: "\u{1F58C}\uFE0F", n: "brush", g: "leisure", k: "painting creative" },
  { c: "\u{1F4F7}", n: "camera", g: "leisure", k: "photography hobby" },
  { c: "\u{1F3AD}", n: "theatre", g: "leisure", k: "drama show entertainment" },
  { c: "\u{1F3AA}", n: "circus", g: "leisure", k: "show entertainment" },
  { c: "\u{1F3B2}", n: "dice", g: "leisure", k: "games board" },
  { c: "\u{1F9E9}", n: "puzzle", g: "leisure", k: "games hobby" },
  { c: "\u{1F4FA}", n: "tv", g: "leisure", k: "streaming subscription" },
  { c: "\u{1F4FB}", n: "radio", g: "leisure", k: "audio" },
  { c: "\u{1FA81}", n: "kite", g: "leisure", k: "outdoors play" },
  { c: "\u{1F3BB}", n: "violin", g: "leisure", k: "music instrument" },
  { c: "\u26BD", n: "football", g: "sport", k: "soccer match club" },
  { c: "\u{1F3C0}", n: "basketball", g: "sport", k: "match club" },
  { c: "\u{1F3CF}", n: "cricket", g: "sport", k: "match club bat" },
  { c: "\u{1F3BE}", n: "tennis", g: "sport", k: "match club" },
  { c: "\u{1F3F8}", n: "badminton", g: "sport", k: "match club" },
  { c: "\u{1F3D0}", n: "volleyball", g: "sport", k: "match club" },
  { c: "\u{1F3C9}", n: "rugby", g: "sport", k: "match club" },
  { c: "\u{1F94A}", n: "boxing", g: "sport", k: "gym fight training" },
  { c: "\u{1F3CA}", n: "swimming", g: "sport", k: "pool exercise" },
  { c: "\u{1F3C3}", n: "running", g: "sport", k: "exercise fitness jog" },
  { c: "\u{1F6B4}", n: "cycling", g: "sport", k: "bike exercise" },
  { c: "\u{1F3CB}\uFE0F", n: "gym", g: "sport", k: "weights fitness training" },
  { c: "\u26F3", n: "golf", g: "sport", k: "club course" },
  { c: "\u{1F9D7}", n: "climbing", g: "sport", k: "exercise outdoors" },
  { c: "\u{1F947}", n: "medal", g: "sport", k: "win prize competition" },
  { c: "\u{1F3C6}", n: "trophy", g: "sport", k: "win prize competition" },
  { c: "\u{1F4F1}", n: "mobile", g: "tech", k: "phone device" },
  { c: "\u{1F4BB}", n: "computer", g: "tech", k: "laptop device" },
  { c: "\u{1F5A5}\uFE0F", n: "monitor", g: "tech", k: "screen device" },
  { c: "\u2328\uFE0F", n: "keyboard", g: "tech", k: "device accessory" },
  { c: "\u{1F5B1}\uFE0F", n: "mouse", g: "tech", k: "device accessory" },
  { c: "\u{1F5B2}\uFE0F", n: "trackball", g: "tech", k: "device accessory" },
  { c: "\u{1F4BE}", n: "disk", g: "tech", k: "storage backup" },
  { c: "\u{1F4BF}", n: "disc", g: "tech", k: "media storage" },
  { c: "\u{1F50B}", n: "battery", g: "tech", k: "power charge" },
  { c: "\u{1F50C}", n: "charger", g: "tech", k: "power cable" },
  { c: "\u{1F4E1}", n: "satellite", g: "tech", k: "internet signal broadband" },
  { c: "\u{1F6F0}\uFE0F", n: "satellite orbit", g: "tech", k: "signal gps" },
  { c: "\u{1F5A7}", n: "network", g: "tech", k: "internet router broadband" },
  { c: "\u2601\uFE0F", n: "cloud", g: "tech", k: "storage subscription hosting" },
  { c: "\u{1F512}", n: "secure", g: "tech", k: "password security vpn" },
  { c: "\u{1F916}", n: "robot", g: "tech", k: "ai automation" },
  { c: "\u{1F39B}\uFE0F", n: "controls", g: "tech", k: "settings device" },
  { c: "\u{1F4A1}", n: "idea", g: "tech", k: "invention concept" },
  { c: "\u{1F484}", n: "lipstick", g: "beauty", k: "makeup cosmetics" },
  { c: "\u{1F485}", n: "nails", g: "beauty", k: "manicure salon" },
  { c: "\u{1F487}", n: "haircut", g: "beauty", k: "salon barber hair" },
  { c: "\u{1F486}", n: "massage", g: "beauty", k: "spa wellness relax" },
  { c: "\u{1F9FC}", n: "soap", g: "beauty", k: "wash hygiene" },
  { c: "\u{1FA92}", n: "razor", g: "beauty", k: "shave grooming" },
  { c: "\u{1F9F4}", n: "cream", g: "beauty", k: "skincare lotion" },
  { c: "\u{1FAA5}", n: "toothbrush", g: "beauty", k: "hygiene dental" },
  { c: "\u{1F9FB}", n: "tissue", g: "beauty", k: "hygiene paper" },
  { c: "\u{1F6C1}", n: "bath", g: "beauty", k: "spa relax wash" },
  { c: "\u{1F488}", n: "barber", g: "beauty", k: "salon haircut" },
  { c: "\u{1F338}", n: "blossom", g: "beauty", k: "fragrance flower" },
  { c: "\u{1F333}", n: "tree", g: "nature", k: "garden park outdoors" },
  { c: "\u{1F332}", n: "pine", g: "nature", k: "forest outdoors" },
  { c: "\u{1F337}", n: "tulip", g: "nature", k: "flower garden" },
  { c: "\u{1F33B}", n: "sunflower", g: "nature", k: "flower garden" },
  { c: "\u{1F331}", n: "seedling", g: "nature", k: "garden grow plant" },
  { c: "\u{1F340}", n: "clover", g: "nature", k: "luck garden" },
  { c: "\u{1F30A}", n: "wave", g: "nature", k: "sea water beach" },
  { c: "\u{1F3D6}\uFE0F", n: "beach", g: "nature", k: "holiday sea sand" },
  { c: "\u26F0\uFE0F", n: "mountain", g: "nature", k: "hiking outdoors" },
  { c: "\u{1F31E}", n: "sun", g: "nature", k: "solar weather summer" },
  { c: "\u{1F327}\uFE0F", n: "rain", g: "nature", k: "weather monsoon" },
  { c: "\u2744\uFE0F", n: "snow", g: "nature", k: "winter cold weather" },
  { c: "\u{1F319}", n: "moon", g: "nature", k: "night" },
  { c: "\u2B50", n: "star", g: "nature", k: "favourite night" },
  { c: "\u{1F506}", n: "solar", g: "nature", k: "energy power sun" },
  { c: "\u267B\uFE0F", n: "recycle", g: "nature", k: "waste green environment" },
  { c: "\u{1F5D1}\uFE0F", n: "bin", g: "nature", k: "waste rubbish refuse" },
  { c: "\u{1F389}", n: "party", g: "celebration", k: "celebrate event fun" },
  { c: "\u{1F38A}", n: "confetti", g: "celebration", k: "celebrate event" },
  { c: "\u{1F382}", n: "birthday", g: "celebration", k: "cake party" },
  { c: "\u{1F388}", n: "balloon", g: "celebration", k: "party event" },
  { c: "\u{1F56F}\uFE0F", n: "candle", g: "celebration", k: "ritual light" },
  { c: "\u{1FA94}", n: "diya", g: "celebration", k: "diwali festival lamp" },
  { c: "\u{1F386}", n: "fireworks", g: "celebration", k: "festival new year" },
  { c: "\u{1F9E7}", n: "red envelope", g: "celebration", k: "gift money festival" },
  { c: "\u{1F490}", n: "bouquet", g: "celebration", k: "flowers gift" },
  { c: "\u{1F3F5}\uFE0F", n: "rosette", g: "celebration", k: "award honour" },
  { c: "\u{1F54C}", n: "mosque", g: "celebration", k: "worship religion" },
  { c: "\u26EA", n: "church", g: "celebration", k: "worship religion" },
  { c: "\u{1F6D5}", n: "temple", g: "celebration", k: "worship religion mandir" },
  { c: "\u{1F54D}", n: "synagogue", g: "celebration", k: "worship religion" },
  { c: "\u{1F64F}", n: "pray", g: "celebration", k: "worship donation thanks" },
  { c: "\u{1FAAF}", n: "faith", g: "celebration", k: "worship religion" },
  { c: "\u{1F9D1}\u200D\u2696\uFE0F", n: "legal", g: "services", k: "lawyer court solicitor" },
  { c: "\u2696\uFE0F", n: "justice", g: "services", k: "legal court balance" },
  { c: "\u{1F6E1}\uFE0F", n: "insurance", g: "services", k: "cover protection policy" },
  { c: "\u{1F691}", n: "ambulance", g: "services", k: "emergency medical" },
  { c: "\u{1F692}", n: "fire engine", g: "services", k: "emergency" },
  { c: "\u{1F693}", n: "police", g: "services", k: "emergency law" },
  { c: "\u{1F9D1}\u200D\u{1F680}", n: "space", g: "services", k: "mission other" },
  { c: "\u{1F3DB}\uFE0F", n: "government", g: "services", k: "tax council official" },
  { c: "\u{1F4D1}", n: "documents", g: "services", k: "admin paperwork forms" },
  { c: "\u{1F5F3}\uFE0F", n: "ballot", g: "services", k: "vote civic" },
  { c: "\u{1F516}", n: "bookmark", g: "services", k: "saved reference" },
  { c: "\u{1F9FE}", n: "invoice", g: "services", k: "bill statement account" },
  { c: "\u{1F4EC}", n: "mailbox", g: "services", k: "post letters" },
  { c: "\u{1FAA7}", n: "sign", g: "services", k: "notice protest" },
  { c: "\u{1F9D1}\u200D\u{1F4BC}", n: "adviser", g: "services", k: "consultant agent" },
  { c: "\u{1F932}", n: "charity", g: "services", k: "donation giving zakat" },
  { c: "\u{1F397}\uFE0F", n: "ribbon", g: "services", k: "cause charity awareness" },
  { c: "\u2B50", n: "star", g: "symbols", k: "favourite mark" },
  { c: "\u2764\uFE0F", n: "heart", g: "symbols", k: "love favourite" },
  { c: "\u{1F535}", n: "blue circle", g: "symbols", k: "mark dot" },
  { c: "\u{1F7E2}", n: "green circle", g: "symbols", k: "mark dot" },
  { c: "\u{1F7E1}", n: "yellow circle", g: "symbols", k: "mark dot" },
  { c: "\u{1F534}", n: "red circle", g: "symbols", k: "mark dot" },
  { c: "\u{1F7E3}", n: "purple circle", g: "symbols", k: "mark dot" },
  { c: "\u{1F7E0}", n: "orange circle", g: "symbols", k: "mark dot" },
  { c: "\u2B1B", n: "black square", g: "symbols", k: "mark block" },
  { c: "\u{1F536}", n: "orange diamond", g: "symbols", k: "mark shape" },
  { c: "\u{1F537}", n: "blue diamond", g: "symbols", k: "mark shape" },
  { c: "\u2705", n: "tick", g: "symbols", k: "done complete yes" },
  { c: "\u274C", n: "cross", g: "symbols", k: "no cancel" },
  { c: "\u2795", n: "plus", g: "symbols", k: "add more" },
  { c: "\u2796", n: "minus", g: "symbols", k: "less remove" },
  { c: "\u2753", n: "question", g: "symbols", k: "unknown other misc" },
  { c: "\u2757", n: "exclamation", g: "symbols", k: "important urgent" },
  { c: "\u{1F501}", n: "repeat", g: "symbols", k: "recurring subscription monthly" },
  { c: "\u267E\uFE0F", n: "infinity", g: "symbols", k: "unlimited forever" },
  { c: "\u{1F9FF}", n: "evil eye", g: "symbols", k: "protection charm" }
];

// Index built once, at load. CHOICES_ICON_SET is a `var` initialiser and
// so is this, and this one reads it — which is exactly the ordering that
// has bitten this bundle before. It is safe only because the two live in
// the same file, in this order; moving either out would break it silently
// at load rather than loudly at build.
var CHOICES_ICON_HAYSTACK = CHOICES_ICON_SET.map(function (icon) {
  return { icon: icon, text: `${icon.n} ${icon.k} ${icon.g}`.toLowerCase() };
});

// Everything in a group, or everything matching what was typed. Search
// beats group: somebody who has typed something is looking for it
// anywhere, not inside whichever tab happens to be open.
//
// RANKED, not merely filtered. A plain substring filter put "card",
// "carton" and "care" above the actual car when somebody typed "car" —
// technically matches, uselessly ordered. A whole-word hit on the icon's
// own name outranks one in its keywords, which outranks a substring
// anywhere; within a rank the catalogue's own order is kept so results
// do not reshuffle as a word is finished.
//
// Also deduplicated by glyph. A few icons are deliberately filed under
// two groups (a receipt is both money and admin), which is right in a
// group listing and reads as a bug in a flat list of results.
function choicesIconSearch(query, group) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    const want = String(group || "").trim();
    if (!want || want === "all") return CHOICES_ICON_SET;
    return CHOICES_ICON_SET.filter(function (icon) { return icon.g === want; });
  }

  // Each word must appear somewhere, so "red car" narrows rather than
  // widening the way an OR would.
  const words = needle.split(/\s+/).filter(Boolean);
  const scored = [];
  const seen = new Set();

  CHOICES_ICON_HAYSTACK.forEach(function (row, at) {
    if (!words.every(function (word) { return row.text.indexOf(word) >= 0; })) return;
    if (seen.has(row.icon.c)) return;
    seen.add(row.icon.c);

    const nameWords = row.icon.n.toLowerCase().split(/\s+/);
    const keywords = row.icon.k.toLowerCase().split(/\s+/);
    let rank = 3;
    for (const word of words) {
      if (nameWords.indexOf(word) >= 0) { rank = Math.min(rank, 0); continue; }
      if (nameWords.some(function (n) { return n.indexOf(word) === 0; })) { rank = Math.min(rank, 1); continue; }
      if (keywords.indexOf(word) >= 0) { rank = Math.min(rank, 2); continue; }
      // The group's own name counts as a keyword hit. Without this,
      // typing "food" put a dog bone (whose keywords say "food") above
      // every item in the Food group, whose membership is the stronger
      // signal and was only being matched as loose text.
      if (row.icon.g === word) rank = Math.min(rank, 2);
    }
    scored.push({ icon: row.icon, rank: rank, at: at });
  });

  return scored
    .sort(function (a, b) { return a.rank !== b.rank ? a.rank - b.rank : a.at - b.at; })
    .map(function (row) { return row.icon; });
}

// An icon for a name somebody has typed.
//
// Deliberately conservative: it returns null rather than a weak guess,
// because an icon that is nearly right is worse than the one the person
// would have picked in two taps. A name is scored against each icon's own
// name first and its keywords second, and a whole-word hit always beats a
// substring one — otherwise "car" matches "card" and every travel category
// comes out as a bank card.
function choicesSuggestIcon(name) {
  const needle = String(name || "").trim().toLowerCase();
  if (needle.length < 2) return null;
  const words = needle.split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; });
  if (words.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const row of CHOICES_ICON_HAYSTACK) {
    const icon = row.icon;
    const iconName = icon.n.toLowerCase();
    const keywords = icon.k.toLowerCase().split(/\s+/);
    let score = 0;
    for (const word of words) {
      if (iconName === word) score += 100;
      else if (iconName.split(/\s+/).indexOf(word) >= 0) score += 60;
      else if (keywords.indexOf(word) >= 0) score += 40;
      else if (iconName.indexOf(word) >= 0 && word.length > 3) score += 15;
      else if (row.text.indexOf(word) >= 0 && word.length > 4) score += 8;
    }
    if (score > bestScore) { bestScore = score; best = icon; }
  }
  // 40 is one keyword hit. Below that it is a coincidence, not a match.
  return bestScore >= 40 ? best : null;
}

// The catalogue entry for a stored glyph, or null for one that came from
// the keyboard. Used only to label a chosen icon; nothing depends on a
// category's icon being in the set.
function choicesIconMeta(char) {
  const want = String(char || "");
  if (!want) return null;
  return CHOICES_ICON_SET.find(function (icon) { return icon.c === want; }) || null;
}
