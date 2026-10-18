// src/features/choices/choicesIcons.js
//
// The icons a category is chosen from: 50 things people actually pay
// for, or are actually paid for.
//
// ── WHY THIS IS SHORT ─────────────────────────────────────────────────
//
// It was 323, assembled by reading "the most icons possible" as "every
// emoji that exists". That is a different and worse thing. A category
// picker is not an emoji keyboard: its job is to put the icon somebody
// wants within one glance, and a list long enough to need scrolling has
// already failed at that for most people. Offering a tortoise, a
// trackball and a synagogue alongside Rent does not add choice, it adds
// search.
//
// So the test each entry has to pass is "is this a thing money regularly
// goes to, or comes from". Rent, fuel, school fees, the dentist, the
// gym. Not a kite.
//
// A category is NOT limited to this set. Any emoji from the keyboard
// works, and a photo works too — see the `photo` field on a category and
// PUT /api/categories/:id/photo. This is the shortcut, not the
// vocabulary, and keeping it short is what makes it a shortcut.
//
// Emoji are written as escapes, as everywhere else in this tree, so the
// file stays greppable and cannot be mangled by an editor that guesses
// at an encoding.

var CHOICES_ICON_GROUPS = [
  { key: "bills", label: "Home & bills" },
  { key: "food", label: "Food" },
  { key: "transport", label: "Getting around" },
  { key: "health", label: "Health" },
  { key: "family", label: "Family" },
  { key: "shopping", label: "Shopping" },
  { key: "leisure", label: "Leisure" },
  { key: "income", label: "Money in" }
];

var CHOICES_ICON_SET = [
  { c: "\u{1F3E0}", n: "rent", g: "bills", k: "home house landlord mortgage flat" },
  { c: "\u{1F4A1}", n: "electricity", g: "bills", k: "power light energy bill" },
  { c: "\u{1F4A7}", n: "water", g: "bills", k: "bill supply utility" },
  { c: "\u{1F525}", n: "gas", g: "bills", k: "heating cooking fuel bill" },
  { c: "\u{1F4E1}", n: "internet", g: "bills", k: "broadband wifi data bill" },
  { c: "\u{1F4F1}", n: "phone", g: "bills", k: "mobile recharge airtime bill" },
  { c: "\u{1F9FE}", n: "bills", g: "bills", k: "utility invoice statement subscription" },
  { c: "\u{1F6CB}\uFE0F", n: "furniture", g: "bills", k: "home sofa household furnishing" },
  { c: "\u{1F9F0}", n: "repairs", g: "bills", k: "maintenance plumber electrician fixing" },
  { c: "\u{1F9FA}", n: "laundry", g: "bills", k: "washing dhobi cleaning ironing" },
  { c: "\u{1F6D2}", n: "groceries", g: "food", k: "supermarket shopping kirana vegetables" },
  { c: "\u{1F354}", n: "eating out", g: "food", k: "restaurant takeaway meal lunch dinner" },
  { c: "\u2615", n: "coffee", g: "food", k: "cafe tea chai drink" },
  { c: "\u{1F37A}", n: "drinks", g: "food", k: "bar pub alcohol nightlife" },
  { c: "\u{1F34E}", n: "snacks", g: "food", k: "fruit treats small" },
  { c: "\u26FD", n: "fuel", g: "transport", k: "petrol diesel gas pump" },
  { c: "\u{1F697}", n: "car", g: "transport", k: "vehicle driving service" },
  { c: "\u{1F68C}", n: "transport", g: "transport", k: "bus metro train commute pass" },
  { c: "\u{1F695}", n: "taxi", g: "transport", k: "cab ride auto rickshaw uber" },
  { c: "\u{1F17F}\uFE0F", n: "parking", g: "transport", k: "car park toll" },
  { c: "\u2708\uFE0F", n: "travel", g: "transport", k: "flight holiday trip abroad" },
  { c: "\u{1F3E8}", n: "hotel", g: "transport", k: "stay accommodation lodging" },
  { c: "\u{1FA7A}", n: "doctor", g: "health", k: "clinic gp consultation checkup medical" },
  { c: "\u{1F48A}", n: "medicine", g: "health", k: "pharmacy chemist prescription tablets" },
  { c: "\u{1F9B7}", n: "dentist", g: "health", k: "dental teeth" },
  { c: "\u{1F453}", n: "eyecare", g: "health", k: "optician glasses spectacles" },
  { c: "\u{1F9D8}", n: "wellness", g: "health", k: "yoga therapy massage spa" },
  { c: "\u{1F476}", n: "baby", g: "family", k: "infant nappy formula childcare" },
  { c: "\u{1F9F8}", n: "kids", g: "family", k: "children toys play" },
  { c: "\u{1F393}", n: "education", g: "family", k: "school college fees tuition university" },
  { c: "\u{1F4DA}", n: "books", g: "family", k: "study stationery reading" },
  { c: "\u{1F436}", n: "pets", g: "family", k: "dog cat vet animal food" },
  { c: "\u{1F46A}", n: "family", g: "family", k: "household parents relatives support" },
  { c: "\u{1F455}", n: "clothes", g: "shopping", k: "clothing apparel shirt dress" },
  { c: "\u{1F45F}", n: "shoes", g: "shopping", k: "footwear trainers sandals" },
  { c: "\u{1F484}", n: "beauty", g: "shopping", k: "cosmetics makeup skincare" },
  { c: "\u{1F487}", n: "haircut", g: "shopping", k: "salon barber grooming parlour" },
  { c: "\u{1F381}", n: "gifts", g: "shopping", k: "present birthday wedding" },
  { c: "\u{1F48E}", n: "jewellery", g: "shopping", k: "gold ornaments luxury" },
  { c: "\u{1F3AC}", n: "entertainment", g: "leisure", k: "cinema movie streaming netflix" },
  { c: "\u{1F3AE}", n: "games", g: "leisure", k: "gaming console play" },
  { c: "\u{1F3CB}\uFE0F", n: "gym", g: "leisure", k: "fitness exercise training membership" },
  { c: "\u26BD", n: "sport", g: "leisure", k: "match club football cricket" },
  { c: "\u{1F389}", n: "celebration", g: "leisure", k: "party festival wedding function" },
  { c: "\u{1FA94}", n: "festival", g: "leisure", k: "diwali eid puja religious offering" },
  { c: "\u{1F4BC}", n: "salary", g: "income", k: "job wage pay employment" },
  { c: "\u{1F4BB}", n: "freelance", g: "income", k: "contract gig client work" },
  { c: "\u{1F4C8}", n: "interest", g: "income", k: "returns dividend investment savings" },
  { c: "\u{1F3E2}", n: "rent received", g: "income", k: "tenant property letting" },
  { c: "\u21A9\uFE0F", n: "refund", g: "income", k: "returned reimbursed cashback" }
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
