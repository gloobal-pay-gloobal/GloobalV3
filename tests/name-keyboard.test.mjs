// tests/name-keyboard.test.mjs
//
// A KEYBOARD THAT CANNOT TYPE A NAME THE SERVER WOULD ACCEPT IS NOT A
// KEYBOARD, IT IS A TRAP.
//
// The board exists so somebody with a Latin-keyboard phone can type रसोई.
// That only helps if every character it can produce is one buildCreatorHandle
// would then take. Two ways it could fail quietly:
//
//   * A character typed into the wrong block — a Devanagari board carrying a
//     Bengali letter, say, which looks plausible at 18px and makes the whole
//     part "two alphabets" the moment it is used. The person sees a refusal
//     with no idea which key caused it.
//   * A space or a dot on a key. CREATOR_HANDLE_FORBIDDEN refuses both, so
//     the key would exist only to produce an error.
//
// Neither is visible by looking at the board. Both are one regex here.
//
// The suite also pins the thing a render caught and reading did not: a
// nameScriptsAgree that was asked about ["Devanagari","Devanagari"] and said
// they disagreed, because it compared an array the server compares as a Set.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const kbSrc = () => readSource("frontend/features/creator/nameKeyboard.jsx");
const serverSrc = () => readSource("server/server.js");

// ── LIFTING THE BOARD DATA ──────────────────────────────────────────────
//
// The layouts are a `var` in a file with one import line and no exports, so
// they are evaluated rather than imported — the same trick the rest of this
// suite uses on the concatenation build. Only the data is lifted; nothing
// here touches React.
function layouts() {
  const src = kbSrc();
  const start = src.indexOf("var NAME_KEYBOARD_LAYOUTS = [");
  assert.ok(start >= 0, "NAME_KEYBOARD_LAYOUTS should be a top-level var");
  const end = src.indexOf("\n];", start);
  assert.ok(end > start, "the layouts array should close at the start of a line");
  const body = src.slice(start, end + 3);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return NAME_KEYBOARD_LAYOUTS;`)();
}

function countryMap() {
  const src = kbSrc();
  const start = src.indexOf("var NAME_KEYBOARD_BY_COUNTRY = {");
  const end = src.indexOf("\n};", start);
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(start, end + 3)}; return NAME_KEYBOARD_BY_COUNTRY;`)();
}

// Every key a board can produce, in one flat list, whether the group is laid
// out as rows (Latin, Cyrillic, Greek) or as a flat set.
function keysOf(layout) {
  const out = [];
  for (const group of layout.groups) {
    const lines = group.rows || [group.keys];
    for (const row of lines) for (const ch of row) out.push(ch);
  }
  return out;
}

test("every board names a script the server already allows", () => {
  const names = serverSrc();
  const start = names.indexOf("const CREATOR_SCRIPT_NAMES = [");
  const allowed = new Function(
    `${names.slice(start, names.indexOf("\n];", start) + 3)}; return CREATOR_SCRIPT_NAMES;`
  )();
  for (const layout of layouts()) {
    assert.ok(
      allowed.includes(layout.script),
      `the ${layout.id} board is in ${layout.script}, which creatorScriptsIn does not know — ` +
      "every name typed on it would read as an unknown alphabet and be refused"
    );
  }
});

test("every key belongs to its own board's alphabet", () => {
  const neutral = /[\p{Script=Common}\p{Script=Inherited}]/u;
  for (const layout of layouts()) {
    const mine = new RegExp(`^\\p{Script=${layout.script}}$`, "u");
    for (const ch of keysOf(layout)) {
      for (const cp of ch) {
        if (neutral.test(cp)) continue;
        assert.ok(
          mine.test(cp),
          `the ${layout.id} board carries ${JSON.stringify(cp)} (U+${cp.codePointAt(0).toString(16).toUpperCase()}), ` +
          `which is not ${layout.script}. Typing it would make the part two alphabets and the server would refuse the name.`
        );
      }
    }
  }
});

test("no key produces a character a creator name cannot contain", () => {
  // The server's own expression, not a paraphrase of it.
  const src = serverSrc();
  const line = src.split("\n").find((l) => l.includes("const CREATOR_HANDLE_FORBIDDEN ="));
  assert.ok(line, "CREATOR_HANDLE_FORBIDDEN should still be a single-line const");
  const forbidden = new Function(`${line} return CREATOR_HANDLE_FORBIDDEN;`)();
  for (const layout of layouts()) {
    for (const ch of keysOf(layout)) {
      assert.ok(
        !forbidden.test(ch),
        `the ${layout.id} board has a key for ${JSON.stringify(ch)}, which buildCreatorHandle refuses — ` +
        "a key whose only outcome is an error is worse than no key"
      );
    }
  }
});

test("no board is empty and no key is empty", () => {
  for (const layout of layouts()) {
    assert.ok(keysOf(layout).length > 0, `the ${layout.id} board has no keys`);
    for (const ch of keysOf(layout)) {
      assert.equal(typeof ch, "string");
      assert.ok(ch.length > 0, `the ${layout.id} board has a blank key`);
    }
  }
});

test("a board has no duplicate keys", () => {
  for (const layout of layouts()) {
    const seen = new Set();
    for (const ch of keysOf(layout)) {
      assert.ok(
        !seen.has(ch),
        `the ${layout.id} board draws ${JSON.stringify(ch)} twice — two keys that do the same thing`
      );
      seen.add(ch);
    }
  }
});

test("every country opens a board that exists", () => {
  const ids = new Set(layouts().map((l) => l.id));
  for (const [iso, id] of Object.entries(countryMap())) {
    assert.ok(ids.has(id), `${iso} opens "${id}", which is not a board — it would silently fall back to Latin`);
    assert.match(iso, /^[A-Z]{2}$/, `${iso} is not an ISO country code, so no account will ever match it`);
  }
});

test("an unknown country opens Latin rather than nothing", () => {
  const src = kbSrc();
  const body = src.slice(src.indexOf("function nameKeyboardDefaultId"));
  const fn = new Function(
    `${src.slice(src.indexOf("var NAME_KEYBOARD_BY_COUNTRY = {"), src.indexOf("\n};", src.indexOf("var NAME_KEYBOARD_BY_COUNTRY = {")) + 3)}
     ${body.slice(0, body.indexOf("\n}\n") + 3)}
     return nameKeyboardDefaultId;`
  )();
  assert.equal(fn("ZZ"), "latin");
  assert.equal(fn(""), "latin");
  assert.equal(fn(null), "latin");
  assert.equal(fn(undefined), "latin");
  // Case and whitespace are what a country field actually arrives as.
  assert.equal(fn("in"), "devanagari");
  assert.equal(fn(" IN "), "devanagari");
});

// ── THE BUG A RENDER FOUND ──────────────────────────────────────────────
//
// nameScriptsAgree took an array where the server takes a Set. Asked about
// ["Devanagari","Devanagari"] — which is exactly what the conflict banner
// asks when somebody types रसोई on the Devanagari board — it went past the
// length check and reported a conflict. The board greyed out its own keys
// and told the person their alphabet was the wrong one for their name.
test("one alphabet named twice is still one alphabet", () => {
  const src = kbSrc();
  const sets = src.slice(src.indexOf("var NAME_SCRIPT_SETS"));
  const fn = new Function(
    `${sets.slice(0, sets.indexOf("\n}\n") + 3)}; return nameScriptsAgree;`
  )();
  assert.equal(fn(["Devanagari", "Devanagari"]), true);
  assert.equal(fn(["Latin"]), true);
  assert.equal(fn([]), true);
  assert.equal(fn(["Latin", "Devanagari"]), false);
  // Japanese and Korean write two or three scripts together, same as the
  // server's CREATOR_SCRIPT_SETS says.
  assert.equal(fn(["Han", "Hiragana"]), true);
  assert.equal(fn(["Han", "Hangul"]), true);
  assert.equal(fn(["Hiragana", "Hangul"]), false);
});

// ── THE RULE THE BOARD ENFORCES IS THE SERVER'S RULE ────────────────────
test("the client's script sets are the server's script sets", () => {
  const client = kbSrc();
  const server = serverSrc();
  // Evaluated, not string-compared: the two files are written in different
  // quote styles and a test that fails over an apostrophe teaches nobody
  // anything.
  const lift = (src, decl, name) => {
    const start = src.indexOf(decl);
    const end = src.indexOf("];", start);
    return new Function(`${src.slice(start, end + 2)}; return ${name};`)();
  };
  assert.deepEqual(
    lift(client, "var NAME_SCRIPT_SETS = [", "NAME_SCRIPT_SETS"),
    lift(server, "const CREATOR_SCRIPT_SETS = [", "CREATOR_SCRIPT_SETS"),
    "the board and the server disagree about which alphabets may be written together, " +
    "so one of them will accept a name the other refuses"
  );
});

// ── WHAT THE BOARD DELIBERATELY DOES NOT HAVE ───────────────────────────
test("there is no space key and no dot key", () => {
  const src = kbSrc();
  // The dot between the two halves is DRAWN, never typed — same decision as
  // the setup screen's. A dot key would put a second dot in a handle.
  for (const layout of layouts()) {
    assert.ok(!keysOf(layout).includes("."), `${layout.id} has a dot key`);
    assert.ok(!keysOf(layout).includes(" "), `${layout.id} has a space key`);
  }
  assert.ok(
    !/aria-label="Space"/.test(src),
    "a space bar would only ever produce a name the server refuses"
  );
});

test("Han, Hangul and Ethiopic are left to the phone rather than faked", () => {
  const ids = layouts().map((l) => l.script);
  for (const script of ["Han", "Hangul", "Ethiopic"]) {
    assert.ok(
      !ids.includes(script),
      `${script} cannot be a flat grid — Han needs a dictionary, Hangul needs jamo composition ` +
      "and Ethiopic is several hundred syllables. A board that half-works writes names that " +
      "compare wrong, which is worse than no board."
    );
  }
  assert.match(kbSrc(), /Han, Hangul and Ethiopic are MISSING ON PURPOSE/,
    "the omission should stay documented where somebody adding a board will read it");
});

// ── ABUGIDA BOARDS PUT THE EVERYDAY KEYS ABOVE THE FOLD ─────────────────
//
// The key area is capped at a third of the screen, so about two groups are
// visible. Writing रसोई needs letters and a matra; independent vowels are
// word-initial and rare. A first render had Vowels first, which put the
// matras below the fold on the board most likely to open in India.
test("letters and signs come before independent vowels", () => {
  for (const layout of layouts()) {
    // The raw labels, blanks included: Latin's main block is unlabelled —
    // "Letters" over a qwerty is a label nobody needed — and dropping the
    // blank would make its Accents group look like the first thing.
    const labels = layout.groups.map((g) => g.label || "");
    assert.ok(
      labels[0] === "" || labels[0] === "Letters",
      `the ${layout.id} board opens on "${labels[0]}" rather than on its letters`
    );
    const independent = labels.indexOf("Independent");
    if (independent < 0) continue;
    assert.equal(
      independent, labels.length - 1,
      `on the ${layout.id} board the standalone vowels are not last, which pushes the matras — ` +
      "used on nearly every character — below a fold set at a third of the screen"
    );
  }
});

// The two senses of "vowel" on an Indic board are not the same key and must
// not share a label: अ stands alone at the start of a word and is rare; ा
// hangs off a consonant and is constant. Thai, Lao and Khmer have no such
// split, so their "Vowels" group is the everyday one and stays second.
test("no board calls two different things vowels", () => {
  for (const layout of layouts()) {
    const labels = layout.groups.map((g) => g.label).filter(Boolean);
    assert.ok(
      !(labels.includes("Vowels") && labels.includes("Independent")),
      `the ${layout.id} board has both a Vowels group and an Independent one`
    );
  }
});

// ── THE BOARD IS MOUNTED EVERYWHERE A CREATOR NAME IS TYPED ─────────────
//
// Three screens take a creator name. A keyboard on two of them is the same
// dead end as a keyboard on none, for whoever lands on the third.
for (const [what, file] of [
  ["the Pay & Services search", "frontend/screens/Dashboard/Dashboard.jsx"],
  ["the creator finder", "frontend/features/creator/CreatorFinder.jsx"],
  ["the creator setup screen", "frontend/features/creator/CreatorSetupScreen.jsx"]
]) {
  test(`${what} can open the Gloobal keyboard`, () => {
    const src = readSource(file);
    assert.match(src, /<CreatorNameKeyboard/, `${what} never mounts the board`);
    assert.match(src, /<NameKeyboardButton/, `${what} has no way to open the board`);
    assert.match(src, /inputMode=\{[^}]*\? "none" : undefined\}/,
      `${what} lets the phone's keyboard open underneath Gloobal's own, which leaves about an inch of screen`);
  });
}

test("the board is in the build, before the screens that mount it", () => {
  const build = readSource("build_app.mjs");
  const at = (p) => build.indexOf(`"${p}"`);
  const kb = at("features/creator/nameKeyboard.jsx");
  assert.ok(kb > 0, "a source file missing from FRONTEND_MODULES is silently not in the app at all");
  for (const after of [
    "features/creator/CreatorSetupScreen.jsx",
    "features/creator/CreatorFinder.jsx"
  ]) {
    assert.ok(kb < at(after), `${after} is emitted before the keyboard it mounts`);
  }
});

test("the board moves the floating map button out of its own way", () => {
  // AppMapButton is fixed at z-index 10000 at 62% down the right edge —
  // squarely on the keys. Fired from inside the board rather than from each
  // screen that mounts it, so a fourth screen cannot forget.
  const src = kbSrc();
  assert.match(src, /gloobal:blockingOverlay/);
  assert.match(src, /fire\(Boolean\(open\)\)/);
  assert.match(src, /return \(\) => fire\(false\)/,
    "the map button has to come back when the board closes");
});


// ── THE ROW SAYS WHAT EACH ALPHABET IS FOR ──────────────────────────────
//
// Every chip used to be a single letter — অ, અ, ଅ, அ — which is legible
// only to somebody who already reads that one, on a board whose whole
// purpose is to reach an alphabet their phone cannot write. The founder:
// "i need language name under language sign".
//
// Names mean LANGUAGES, not alphabets: almost nobody knows what their own
// alphabet is called. So the chip says Hindi, not Devanagari, and the
// search has to find the Latin board from the word "Spanish".
function kbFn(names) {
  const src = kbSrc();
  const start = src.indexOf("var NAME_KEYBOARD_LAYOUTS = [");
  // Stops at the first component: everything below it is JSX, which a
  // plain Function() cannot parse.
  const end = src.indexOf("function NameKey(");
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(start, end)}; return { ${names.join(", ")} };`)();
}

test("every alphabet says which language it is for", () => {
  for (const layout of layouts()) {
    assert.ok(layout.name, `${layout.id} has no language name for its chip`);
    assert.ok(layout.nativeName, `${layout.id} has no name in its own letters`);
    assert.ok(Array.isArray(layout.also), `${layout.id} has no list of other languages`);
    assert.equal(typeof layout.speakers, "number",
      `${layout.id} has no speaker count, so the default row cannot order it`);
    assert.ok(layout.speakers > 0, `${layout.id} claims nobody writes it`);
  }
});

test("no two chips carry the same word", () => {
  // Two chips both reading "Japanese" is a row with a coin-flip on it.
  const seen = new Map();
  for (const layout of layouts()) {
    assert.ok(!seen.has(layout.name),
      `${layout.id} and ${seen.get(layout.name)} both label their chip "${layout.name}"`);
    seen.set(layout.name, layout.id);
  }
});

test("the row is seven, and the first is the account's own country", () => {
  const { nameKeyboardRow, NAME_KEYBOARD_ROW } = kbFn(["nameKeyboardRow", "NAME_KEYBOARD_ROW"]);
  assert.equal(NAME_KEYBOARD_ROW, 7);
  // A Lao account opening a row of Hindi and Russian is seven wrong
  // answers, with Lao thirty million people deep in a search.
  assert.equal(nameKeyboardRow("LA", "latin")[0].id, "lao");
  assert.equal(nameKeyboardRow("IN", "latin")[0].id, "devanagari");
  assert.equal(nameKeyboardRow("TH", "latin")[0].id, "thai");
  // An unknown country still gets a full row, led by the most written.
  const anon = nameKeyboardRow("ZZ", "latin");
  assert.equal(anon.length, 7);
  assert.equal(anon[0].id, "latin");
});

test("a board chosen from search is appended, not sorted in", () => {
  // The row would otherwise reshuffle under a thumb the moment something
  // was picked — and the chip just tapped would move.
  const { nameKeyboardRow } = kbFn(["nameKeyboardRow"]);
  const row = nameKeyboardRow("IN", "malayalam");
  assert.equal(row[row.length - 1].id, "malayalam", "the chosen board is not on the row at all");
  assert.equal(row[0].id, "devanagari", "picking from search reordered the row");
  // And picking one that is already on the row does not duplicate it.
  const again = nameKeyboardRow("IN", "latin");
  assert.equal(again.filter((l) => l.id === "latin").length, 1);
  assert.equal(again.length, 7);
});

test("the search finds a board by any language it writes", () => {
  const { nameKeyboardMatches, nameKeyboardLayout } = kbFn(["nameKeyboardMatches", "nameKeyboardLayout"]);
  const finds = (query) => layouts().filter((l) => nameKeyboardMatches(l, query)).map((l) => l.id);
  // The whole point: a Spanish speaker does not know to look for "Latin".
  assert.deepEqual(finds("spanish"), ["latin"]);
  assert.deepEqual(finds("urdu"), ["arabic"]);
  assert.deepEqual(finds("persian"), ["arabic"]);
  assert.deepEqual(finds("punjabi"), ["gurmukhi"]);
  assert.deepEqual(finds("nepali"), ["devanagari"]);
  // By the alphabet's name too, for anybody who does know it.
  assert.ok(finds("devanagari").includes("devanagari"));
  // And in its own letters.
  assert.ok(finds("हिन्दी").includes("devanagari"));
  assert.ok(finds("বাংলা").includes("bengali"));
  // Case and padding are what a search box actually receives.
  assert.deepEqual(finds("  URDU "), ["arabic"]);
  // Empty shows everything rather than nothing.
  assert.equal(finds("").length, layouts().length);
});

test("the line under a language never just repeats it", () => {
  // A render had twelve rows reading "Tamil / Tamil" and one reading
  // "Gurmukhi · also Gurmukhi" — a second line that repeats the first
  // teaches nothing and doubles the list's height to skim.
  const { nameKeyboardSubline } = kbFn(["nameKeyboardSubline"]);
  for (const layout of layouts()) {
    const sub = nameKeyboardSubline(layout);
    if (!sub) continue;
    const words = sub.toLowerCase().replace(/^also /, "").split(/[,·]\s*/).map((w) => w.trim());
    assert.ok(!words.includes(layout.name.toLowerCase()),
      `the ${layout.id} row says "${layout.name}" and then "${sub}"`);
    const bits = sub.split(" · ");
    assert.equal(new Set(bits).size, bits.length, `the ${layout.id} row repeats itself: "${sub}"`);
  }
  assert.equal(nameKeyboardSubline(nameKeyboardLayoutById("greek")), "",
    "Greek written in the Greek alphabet needs no second line");
  assert.equal(nameKeyboardSubline(nameKeyboardLayoutById("gurmukhi")), "Gurmukhi");
  assert.match(nameKeyboardSubline(nameKeyboardLayoutById("latin")), /^Latin · also Spanish, French, Portuguese$/);
});

function nameKeyboardLayoutById(id) {
  for (const l of layouts()) if (l.id === id) return l;
  throw new Error(`no board ${id}`);
}

test("the two missing on purpose are told apart from the unknown", () => {
  // Telling somebody who searched for Tibetan about Chinese input methods
  // is a non-sequitur dressed as help.
  const { NAME_KEYBOARD_SOON } = kbFn(["NAME_KEYBOARD_SOON"]);
  for (const q of ["chinese", "Mandarin", "hanzi", "korean", "Hangul", "hanja"]) {
    assert.ok(NAME_KEYBOARD_SOON.test(q), `"${q}" should get the reason, not the shrug`);
  }
  for (const q of ["tibetan", "cherokee", "klingon", "amharic"]) {
    assert.ok(!NAME_KEYBOARD_SOON.test(q), `"${q}" should not be told about Chinese input`);
  }
});

test("the finder is a screen, not a panel inside the board", () => {
  // It is the one place in this feature that WANTS the phone's keyboard —
  // you type "Spanish" in Latin letters to reach a board that is not
  // Latin. Opening that over a panel pinned to the bottom of the screen
  // leaves about an inch to show results in.
  const src = kbSrc();
  assert.match(src, /function NameKeyboardLanguages/);
  const fn = src.slice(src.indexOf("function NameKeyboardLanguages"));
  assert.match(fn, /position: "fixed", inset: 0/);
  assert.doesNotMatch(fn, /inputMode=\{[^}]*"none"/,
    "the language search suppresses the keyboard it needs");
  assert.match(fn, /id="name-keyboard-language-search"/,
    "the search box needs a stable id, since a republish carries form values by it");
});
