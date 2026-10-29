// tests/creator-identity.test.mjs
//
//   node --test tests/creator-identity.test.mjs
//
// The Creator side's own name, mark and address.
//
// ── WHAT THIS IS FOR ────────────────────────────────────────────────────
//
// One account, two sides. The Personal side is paid at a Gloobal ID —
// twelve symbols from the dial alphabet, unforgeable and unsayable. The
// Creator side is paid at a name somebody can say across a counter:
// rasoi.ghar, chacha.tea, mama.pasta.
//
// That makes the handle a PAYMENT ADDRESS, and most of what follows is
// about the consequences of that one fact: it has to be unique, it has to
// normalise the same way every time it is read or written, and the three
// answers to "is this name free" have to stay three rather than becoming
// two.
//
// ── THE DECISIONS THAT ARE THE FOUNDER'S, NOT MINE ──────────────────────
//
// Two of these were chosen against my recommendation, and both are tested
// here as requirements rather than argued with:
//
//   * the setup screen is SKIPPABLE, so a creator with no handle is a
//     real and supported state that every reader has to handle;
//   * the address is the creator's to publish, defaulting to private.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SERVER = "server/server.js";
const MODEL = "server/models/User.js";
const LOGO = "server/models/CreatorLogo.js";
const API = "backend/services/api/gloobalApi.js";
const SETUP = "frontend/features/creator/CreatorSetupScreen.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const server = readSource(SERVER);
const setup = readSource(SETUP);
const dash = strip(readSource(DASH));

// The handle's own arithmetic, lifted out of the server so it can be run
// against real input rather than described in a comment. This is the part
// that decides whether two creators are the same creator.
const PURE = server.slice(
  server.indexOf("const CREATOR_HANDLE_PART_MAX"),
  server.indexOf("async function creatorHandleTaken")
);
const { buildCreatorHandle, normaliseHandlePart, creatorScriptsIn, creatorScriptsAgree } = new Function(`${PURE}
  return { buildCreatorHandle, normaliseHandlePart, creatorScriptsIn, creatorScriptsAgree };`)();

describe("a name in any language", () => {
  test("Latin, Devanagari, Arabic and Han all make handles", () => {
    // The founder's requirement, in his words: saved "in any language".
    // Each of these is a real name somebody could trade under.
    for (const [a, b] of [["rasoi", "ghar"], ["रसोई", "घर"], ["مطبخ", "بيت"], ["家", "廚"]]) {
      const built = buildCreatorHandle(a, b);
      assert.equal(built.ok, true, `${a}.${b} was refused: ${built.message}`);
      assert.ok(built.handle.includes("."), `${a}.${b} produced ${built.handle}`);
    }
  });

  test("the length limit counts characters, not UTF-16 units", () => {
    // A script outside the Basic Multilingual Plane is two UTF-16 units
    // per character. Counting `.length` would charge those names double
    // for letters a person counts as one — a 24-character limit that is
    // really 12 for some languages and not others.
    const astral = "\u{1F600}".repeat(20);
    assert.equal(buildCreatorHandle(astral, "ghar").ok, true,
      "20 astral characters were counted as 40");
    assert.equal(buildCreatorHandle("\u{1F600}".repeat(25), "ghar").ok, false,
      "25 characters got past a 24-character limit");
  });
});

describe("what a handle may not contain", () => {
  test("not the dot, because the dot is the separator", () => {
    assert.equal(buildCreatorHandle("ras.oi", "ghar").ok, false);
    assert.equal(buildCreatorHandle("rasoi", "gh.ar").ok, false);
  });

  test("not whitespace, because a handle is said as one word", () => {
    // INSIDE the name only. Whitespace around it is trimmed rather than
    // refused — somebody whose keyboard added a trailing space has not
    // made a mistake worth stopping them for, and the trim happens
    // before this check for exactly that reason.
    for (const bad of ["ras oi", "ras\toi", "ras\noi", "ras oi"]) {
      assert.equal(buildCreatorHandle(bad, "ghar").ok, false, `${JSON.stringify(bad)} was accepted`);
    }
    assert.equal(buildCreatorHandle("rasoi\t", " ghar ").ok, true,
      "whitespace around a name is being refused instead of trimmed");
  });

  test("not the direction overrides", () => {
    // U+202E and friends reorder what is DRAWN without changing what is
    // stored, so a handle can render as one name and be another. On a
    // payment address that is not a cosmetic problem.
    for (const bad of ["ras‮oi", "ras‎oi", "ras⁦oi"]) {
      assert.equal(buildCreatorHandle(bad, "ghar").ok, false, `${JSON.stringify(bad)} was accepted`);
    }
  });

  test("not a name with no first part", () => {
    // This used to assert that ONE half was refused. A single word is a
    // name now — see "one word is a name too" below — so what is left to
    // refuse is a name with nothing in the first box, which is somebody
    // typing into the wrong one.
    assert.equal(buildCreatorHandle("rasoi", "").ok, true, "a one-word name is being refused");
    assert.equal(buildCreatorHandle("", "ghar").ok, false);
    assert.equal(buildCreatorHandle("   ", "ghar").ok, false, "whitespace stood in for a name");
  });

  test("and the length floor is not written for Latin only", () => {
    // Two characters stops somebody taking `a`. Applied everywhere it
    // also refuses \u5bb6 and \u5c4b, which are whole words \u2014 so the floor is one
    // for Han, kana and Hangul.
    assert.equal(buildCreatorHandle("a", "").ok, false, "a single Latin letter was allowed");
    assert.equal(buildCreatorHandle("\u5BB6", "").ok, true, "a one-character Han name was refused");
    assert.equal(buildCreatorHandle("\u5C4B", "").ok, true);
  });

  test("and nothing that is not a string", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(buildCreatorHandle(bad, "ghar").ok, false, `${JSON.stringify(bad)} was accepted`);
    }
  });
});

describe("one alphabet per half", () => {
  // ── THE HOLE THE FOUNDER'S RULE LEFT OPEN ──────────────────────────
  //
  // His rule — a name is taken once in exactly its own form, and
  // rasoi.ghar and रसोई.घर are two different names — is right, and it
  // worked. What also worked, and should not have:
  //
  //     rasoi.ghar      Latin
  //     rаsoi.ghar      the same with ONE Cyrillic а
  //
  // Two different strings, both registerable, visually identical. On an
  // address people type to send money, that is how impersonation is
  // done. One alphabet per half closes it without touching his rule.
  const refused = (a, b) => {
    const built = buildCreatorHandle(a, b);
    assert.equal(built.ok, false, `${a}.${b} was accepted`);
    assert.equal(built.code, "mixed_scripts", `${a}.${b} was refused for the wrong reason: ${built.message}`);
  };
  const allowed = (a, b, why) => {
    const built = buildCreatorHandle(a, b);
    assert.equal(built.ok, true, `${why} (${a}.${b}) was refused: ${built.message}`);
  };

  test("a Latin name with one Cyrillic letter hidden in it is refused", () => {
    refused("r\u0430soi", "ghar");
    refused("ras\u043Ei", "ghar");
    refused("rasoi", "gh\u0430r");
  });

  test("and one Greek letter is no different", () => {
    refused("\u03C1asoi", "ghar");
    refused("rasoi", "gh\u03B1r");
  });

  test("but the founder's own example still gives two names", () => {
    // The whole point: this rule must not collapse his example into one.
    const latin = buildCreatorHandle("rasoi", "ghar");
    const deva = buildCreatorHandle("\u0930\u0938\u094B\u0908", "\u0918\u0930");
    assert.equal(latin.ok, true);
    assert.equal(deva.ok, true);
    assert.notEqual(latin.handle, deva.handle, "two scripts collapsed into one name");
  });

  test("digits and accents are not a second alphabet", () => {
    allowed("chacha2", "tea", "a digit");
    allowed("caf\u00E9", "bar", "an accented Latin letter");
    allowed("cafe\u0301", "bar", "a combining accent");
  });

  test("Japanese and Korean keep the scripts they really use", () => {
    // Japanese mixes Han with Hiragana and Katakana; Korean mixes
    // Hangul with Han. Refusing those would be refusing ordinary names
    // rather than attacks, so they are listed as sets.
    allowed("\u30E9\u30FC\u30E1\u30F3", "\u5C4B", "katakana with han");
    allowed("\u3053\u3053\u308D", "\u5C4B", "hiragana with han");
    allowed("\uC9D1\uBC25", "\uC9D1", "hangul");
  });

  test("the two halves may differ from each other", () => {
    // `rasoi.घर` is two alphabets but it is not a lookalike of
    // anything, so refusing it would be refusing a name rather than an
    // attack. The rule is per half, deliberately.
    allowed("rasoi", "\u0918\u0930", "Latin first, Devanagari last");
  });

  test("an unrecognised character counts as its own alphabet", () => {
    // Fails closed: a script this build cannot name must not be read as
    // "agrees with everything".
    assert.equal(creatorScriptsAgree(new Set(["Latin", "Unknown:\u2603"])), false);
    assert.equal(creatorScriptsAgree(new Set(["Latin"])), true);
    assert.equal(creatorScriptsAgree(new Set()), true);
  });

  test("neutral characters are not counted at all", () => {
    assert.equal(creatorScriptsIn("1234").size, 0, "digits were counted as an alphabet");
    assert.equal(creatorScriptsIn("rasoi2").size, 1);
  });

  test("a name written ENTIRELY in a confusable script still passes, and that is known", () => {
    // раѕоі is all Cyrillic, so it agrees with itself and is allowed —
    // and it looks like `rasoi`. Closing this needs the Unicode
    // confusables table and a second index on the skeleton, and it has
    // a real cost: a Russian shop could not then use a name whose
    // letters happen to look Latin.
    //
    // Asserted as the CURRENT behaviour rather than wished away, so the
    // day somebody closes it this test is what tells them it was a
    // decision and not an accident.
    const built = buildCreatorHandle("\u0440\u0430\u0455\u043E\u0456", "\u0433\u04BB\u0430\u0433");
    assert.equal(built.ok, true,
      "the all-one-script lookalike is now refused — if that was deliberate, rewrite this test");
  });

  test("the box says \"not a usable name\", not \"taken\"", () => {
    // "That name is taken" sent to somebody who typed one Cyrillic
    // letter by accident is an answer they can do nothing with.
    const setup = readSource(SETUP);
    assert.match(setup, /answer\.available \? "free" : \(answer\.code \? "invalid" : "taken"\)/);
    assert.match(setup, /const refused = availability\.status === "taken" \|\| availability\.status === "invalid";/);
    assert.match(readSource(API), /code: typeof result\.code === "string" \? result\.code : "",/,
      "the refusal code is dropped on the way back, so the box cannot tell the two apart");
  });
});

describe("two creators cannot hold the same name", () => {
  test("case does not make a second handle", () => {
    assert.equal(buildCreatorHandle("Rasoi", "Ghar").handle, buildCreatorHandle("rasoi", "ghar").handle);
    assert.equal(buildCreatorHandle("RASOI", "GHAR").handle, "rasoi.ghar");
  });

  test("nor does the way an accent is composed", () => {
    // "é" is one code point or two, and the two are visually identical.
    // Without NFC a second creator could register a handle nobody could
    // tell apart from the first — which, on an address people pay, is
    // the whole problem.
    const precomposed = "café";
    const decomposed = "café";
    assert.notEqual(precomposed, decomposed, "the fixture is not testing what it claims");
    assert.equal(
      buildCreatorHandle(precomposed, "bar").handle,
      buildCreatorHandle(decomposed, "bar").handle
    );
  });

  test("surrounding space is not part of the name", () => {
    assert.equal(buildCreatorHandle("  rasoi  ", " ghar ").handle, "rasoi.ghar");
  });

  test("the display form keeps what the handle throws away", () => {
    // Case is folded for the handle and kept for the name, because
    // recovering "Rasoi" from "rasoi" is not possible and somebody who
    // typed a capital meant it.
    const built = buildCreatorHandle("Rasoi", "Ghar");
    assert.equal(built.first, "Rasoi");
    assert.equal(built.last, "Ghar");
    assert.equal(built.handle, "rasoi.ghar");
  });

  test("the uniqueness is an index, not a check", () => {
    // The availability route cannot reserve anything: two creators
    // typing the same name at the same moment are both told it is free.
    // The index is what decides, and the save has to turn ITS refusal
    // into the same message rather than a 500.
    assert.match(readSource(MODEL), /handle: \{\s*\n\s*type: String,\s*\n\s*trim: true,\s*\n\s*default: null,\s*\n\s*index: \{ unique: true, sparse: true \}/,
      "the handle has no unique index, so uniqueness is only ever advisory");
    assert.match(server, /if \(writeError\?\.code === 11000\) \{\s*\n\s*return res\.status\(409\)\.json\(\{\s*\n\s*success: false, code: 'handle_taken'/,
      "a duplicate-key refusal from the index is not turned into an answer");
  });

  test("sparse, or every account without one collides with every other", () => {
    assert.match(readSource(MODEL), /sparse: true/);
  });
});

describe("one word is a name too", () => {
  // Asked for in these words: "allow user to pick one name if available
  // ... someone just pick amazon walmart netflix even our gloobal".
  //
  // The first box is the required one and the second is optional, so a
  // one-word name is a name with nothing in its second half \u2014 and the
  // handle is just that word, with no dot to be typed or remembered.
  test("a single word makes a handle with no dot", () => {
    for (const word of ["amazon", "netflix", "chacha", "\u0930\u0938\u094B\u0908"]) {
      const built = buildCreatorHandle(word, "");
      assert.equal(built.ok, true, `${word} was refused: ${built.message}`);
      assert.equal(built.handle, word.toLowerCase(), `${word} produced ${built.handle}`);
      assert.equal(built.single, true);
      assert.doesNotMatch(built.handle, /\./);
    }
  });

  test("the FIRST box is the required one", () => {
    // Typing only into the second box is somebody using the wrong box,
    // not a one-word name. Reordering it for them would hand them a name
    // they did not type.
    assert.equal(buildCreatorHandle("", "tea").ok, false);
    assert.equal(buildCreatorHandle("   ", "tea").ok, false);
  });

  test("two words still make two words", () => {
    const built = buildCreatorHandle("chacha", "tea");
    assert.equal(built.handle, "chacha.tea");
    assert.equal(built.single, false);
  });

  test("one character is not a name", () => {
    // It is not a thing anybody says; it is a thing somebody takes
    // because it is short.
    assert.equal(buildCreatorHandle("a", "").ok, false);
    assert.equal(buildCreatorHandle("ab", "").ok, true);
    assert.equal(buildCreatorHandle("chacha", "t").ok, false);
  });

  test("and a one-word name is still one alphabet", () => {
    assert.equal(buildCreatorHandle("r\u0430soi", "").code, "mixed_scripts");
  });
});

describe("names nobody gets", () => {
  // A one-word namespace is where brand squatting happens. This list is
  // not an answer to that in general \u2014 it is the subset where the damage
  // happens INSIDE Gloobal's own app.
  const reserved = (a, b) => {
    const built = buildCreatorHandle(a, b);
    assert.equal(built.ok, false, `${a}${b ? "." + b : ""} was allowed`);
    assert.equal(built.code, "reserved_name", `${a} was refused for the wrong reason: ${built.message}`);
  };

  test("GLOOBAL's own name, in any casing", () => {
    reserved("gloobal", "");
    reserved("GLOOBAL", "");
    reserved("GLOOBAL", "");
  });

  test("and as the head of a two-part name", () => {
    // `gloobal.cafe` reads as Gloobal first. A caf\u00e9 really called
    // Gloobal is a problem worth having rather than the one this stops.
    reserved("gloobal", "cafe");
    reserved("support", "chacha");
  });

  test("but not when the reserved word is the tail", () => {
    // Refusing every name that contains one of these would take
    // `tea.help` off a real tea shop.
    assert.equal(buildCreatorHandle("chacha", "support").ok, true);
    assert.equal(buildCreatorHandle("tea", "help").ok, true);
  });

  test("the words a refund scam would want", () => {
    for (const word of ["support", "security", "official", "refund", "admin", "verified"]) {
      reserved(word, "");
    }
  });

  test("an ordinary name is not caught by it", () => {
    for (const word of ["chacha", "rasoi", "amazon", "netflix", "walmart"]) {
      assert.equal(buildCreatorHandle(word, "").ok, true, `${word} was refused`);
    }
  });

  test("brand squatting in general is NOT solved, and says so", () => {
    // Somebody can still take `netflix`. Asserted as the current state so
    // that whoever adds a dispute process later knows this was a known
    // gap and not an oversight.
    assert.equal(buildCreatorHandle("netflix", "").ok, true);
    assert.match(server, /Brand squatting in general is NOT solved by this\./);
  });
});

describe("the second box is optional on the screen too", () => {
  test("the dot fades rather than disappearing", () => {
    // Removing it would resize both boxes under somebody's thumb the
    // moment they start typing the second half.
    // 0.25 since the joined field (it sits on the field, not the page).
    assert.match(strip(setup), /opacity: twoParts \? 1 : 0\.25/);
  });

  test("saving needs only the first part", () => {
    assert.match(strip(setup), /const canSave = enough && !saving && !refused;/);
    assert.match(strip(setup), /const enough = Boolean\(first\.trim\(\)\);/);
  });

  test("and the resolve route takes a dotless name", () => {
    assert.match(server, /const built = at < 0\s*\n\s*\? buildCreatorHandle\(raw, ''\)/,
      "a one-word name cannot be resolved, so it cannot be paid");
  });
});

describe("the address belongs to whoever typed it", () => {
  test("private by default", () => {
    assert.match(readSource(MODEL), /addressPublic: \{ type: Boolean, default: false \}/,
      "the address defaults to public");
  });

  test("and the server decides, not the client", () => {
    // publicCreator is the one place that branch lives. A screen that
    // chose for itself whether to draw an address would be a second
    // copy of a privacy rule.
    const at = server.indexOf("function publicCreator");
    const fn = server.slice(at, server.indexOf("\n}", at));
    assert.match(fn, /address: profile\.addressPublic \? \(profile\.address \|\| ''\) : ''/,
      "publicCreator hands out the address without checking whether it is public");
  });

  test("the owner still sees their own", () => {
    assert.match(server, /if \(isOwner\) \{\s*\n\s*const profile = user\.creatorProfile \|\| \{\};\s*\n\s*out\.address = profile\.address \|\| '';/,
      "a creator cannot read back their own private address");
  });

  test("the switch says who sees it, not what it is called", () => {
    // "Address visibility: off" tells somebody what the app calls the
    // setting. This tells them what happens.
    // Now also says the map pin goes with it, since Directions does.
    assert.match(setup, /Anybody who opens your creator page sees this address and gets Directions to your pin\./);
    assert.match(setup, /Only you can see this\. Nobody paying you will\./);
  });
});

describe("the three answers stay three", () => {
  test("a reply without a real boolean is \"don't know\", not \"taken\"", () => {
    // ── THE BUG A RENDER FOUND ────────────────────────────────────────
    //
    // This read Boolean(result && result.available), which turns every
    // reply that does not carry the field — an old server, a proxy's own
    // 200, a route not deployed yet — into `false`, which the setup
    // screen paints as "That name is taken."
    //
    // Telling somebody their name is taken when the truth is that nobody
    // answered is the worst of the three states to guess at: it is the
    // one that stops them finishing, and it is unarguable.
    const api = readSource(API);
    const at = api.indexOf("async creatorHandleAvailable");
    const fn = api.slice(at, api.indexOf("\n  },", at));
    assert.match(fn, /typeof result\.available !== "boolean"/,
      "an answer that is not an answer is being read as a refusal");
    assert.doesNotMatch(fn, /available: Boolean\(/,
      "the availability flag is being coerced again");
  });

  test("a network failure is not a refusal either", () => {
    const api = readSource(API);
    const at = api.indexOf("async creatorHandleAvailable");
    const fn = api.slice(at, api.indexOf("\n  },", at));
    assert.match(fn, /catch \(err\) \{\s*\n\s*return \{ known: false/,
      "a dead connection turns the name box red");
  });

  test("and only a refusal turns the box red", () => {
    // "Checking" and "unknown" leave it neutral, because neither is a
    // fault of the name. Both refusals — taken, and not a usable name —
    // turn it red and block the save.
    assert.match(strip(setup), /const tone = refused \? "bad" : availability\.status === "free" \? "good" : null;/);
    assert.match(strip(setup), /const canSave = enough && !saving && !refused;/,
      "the save button is disabled by states that are not a refusal");
  });

  test("the check is debounced and the stale answer discarded", () => {
    // Without the sequence guard, a slow reply about "ras" lands on top
    // of a fast one about "rasoi" and the box contradicts itself.
    assert.match(strip(setup), /var CREATOR_HANDLE_DEBOUNCE_MS = 400;/);
    assert.match(strip(setup), /if \(seq\.current !== mine\) return;/,
      "an out-of-date answer can overwrite a newer one");
  });
});

describe("a creator who skipped is a real creator", () => {
  test("the screen can be skipped at all", () => {
    // The founder's choice, against my recommendation. Tested as a
    // requirement so that nobody later 'fixes' it into a wall.
    assert.match(strip(setup), /Set this up later/);
    assert.match(dash, /onSkip=\{skipCreatorSetup\}/);
  });

  test("closing it is the same as skipping it", () => {
    // Two ways out of one screen that mean different things is a
    // distinction nobody would guess and nobody should have to.
    assert.match(dash, /onClose=\{skipCreatorSetup\}/,
      "dismissing the screen means something different from skipping it");
  });

  test("a skip is recorded, so the offer stops being a wall", () => {
    assert.match(dash, /GloobalApi\.saveCreatorProfile\(myGloobalId, \{ skipped: true \}\)/);
    assert.match(server, /if \(body\.skipped === true && !wantsHandle\) \{/,
      "a save that carries a handle could also mark the setup as skipped");
    assert.match(server, /set\['creatorProfile\.setupSkippedAt'\] = null;/,
      "finishing the setup does not clear the skip mark");
  });

  test("the first flip asks, and only the first", () => {
    assert.match(dash, /if \(creatorSetupDone\(loaded\) \|\| loaded\.setupSkippedAt\) return;/,
      "the setup screen reopens for somebody who finished or declined it");
  });

  test("and the offer survives the skip somewhere findable", () => {
    assert.match(dash, /shareRole === "merchant" && creatorProfile && !creatorSetupDone\(creatorProfile\) && <button/,
      "a creator who skipped has no way back to the setup from the dashboard");
    assert.match(dash, /Pick your creator name/);
  });

  test("nothing confuses \"not loaded\" with \"no handle\"", () => {
    // These are different states and the difference matters: a creator
    // shown as having no handle because the network failed would be
    // offered a setup screen they have already done.
    assert.match(dash, /creatorLoadedRef\.current = false;/,
      "a failed load is remembered as a load, so it never retries");
    const at = strip(setup).indexOf("function creatorSetupDone");
    const fn = strip(setup).slice(at, strip(setup).indexOf("\n}", at));
    assert.match(fn, /typeof creator\.handle === "string" && creator\.handle\.trim\(\)/,
      "creatorSetupDone takes a boolean, so it cannot tell a missing profile from an empty one");
  });

  test("and a creator with no name is still payable, honestly", () => {
    const at = strip(setup).indexOf("function creatorHandleLabel");
    const fn = strip(setup).slice(at, strip(setup).indexOf("\n}", at));
    assert.match(fn, /return fallbackGloobalId \|\| "";/,
      "a creator with no handle falls back to a blank or an invented label");
    assert.match(setup, /people can still pay your creator side at your <GloobalWordmark \/> ID\./);
  });
});

describe("the mark is a picture of a different thing", () => {
  test("it is its own collection, not a flag on the profile photo", () => {
    // ProfilePhoto has a unique index on userId, so a second row per
    // account would not fit it — and a creator changing their face
    // should not change their shop's sign.
    const logo = readSource(LOGO);
    assert.match(logo, /unique: true/);
    assert.match(logo, /mongoose\.model\('CreatorLogo'/);
    assert.match(server, /const CreatorLogo = require\('\.\/models\/CreatorLogo'\);/);
  });

  test("and it goes through the same validator, so SVG is still refused", () => {
    // SVG can carry script, which matters more for a creator's mark than
    // for a profile photo: it is shown to everybody who looks them up.
    assert.match(server, /const validated = validateProfilePhoto\(body\.logo\);/,
      "the creator logo has its own validator, which will drift from the photo's");
  });

  test("square, because a round frame is a face", () => {
    assert.match(strip(setup), /borderRadius: 26,/);
    assert.doesNotMatch(strip(setup).slice(strip(setup).indexOf("Add your creator logo")), /borderRadius: "50%",\s*\n\s*background: logo/);
  });
});

describe("it is one account, not two", () => {
  test("the handle resolves to the same GLOOBAL ID", () => {
    // The whole design rests on this. A handle that produced its own
    // account would be a second balance, a second ledger and a second
    // thing to keep in step.
    const at = server.indexOf("app.get('/api/creator/resolve/:handle'");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /User\.findOne\(\{ 'creatorProfile\.handle': built\.handle \}\)/);
    assert.match(server, /symbolId: user\.symbolId,/);
  });

  test("and resolving normalises the same way storing did", () => {
    // Somebody typing RASOI.GHAR has to land on rasoi.ghar, or the
    // handle is only an address when it is typed exactly right.
    const at = server.indexOf("app.get('/api/creator/resolve/:handle'");
    const route = server.slice(at, server.indexOf("\n});", at));
    assert.match(route, /buildCreatorHandle\(raw\.slice\(0, at\), raw\.slice\(at \+ 1\)\)/,
      "the resolve route parses handles its own way");
  });

  test("the module is in the bundle, ahead of the screen that hosts it", () => {
    const build = readSource("build_app.mjs");
    const at = build.indexOf("const FRONTEND_MODULES");
    const modules = build.slice(at, build.indexOf("\n];", at));
    assert.match(modules, /"features\/creator\/CreatorSetupScreen\.jsx"/);
    assert.ok(
      modules.indexOf("CreatorSetupScreen.jsx") < modules.indexOf("screens/Dashboard/Dashboard.jsx"),
      "the screen is emitted after the Dashboard that renders it"
    );
  });
});

test("the creator row is on both sides of the profile", () => {
  // ── WHY THIS WAS BACKWARDS ───────────────────────────────────────────
  //
  // The row only appeared when shareRole was "merchant". But the row is
  // where a creator name gets SET UP — so hiding it from everybody who
  // has not got one meant the only way to find it was to flip to a side
  // you would only flip to if you already knew it was there.
  //
  // It now shows for both, in the same place, and the panel's two states
  // do the rest: "No creator name yet" with "Set up my creator name" for
  // a person, the name and the shop for a creator.
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(
    dash,
    /\}\{PROFILE_ROWS\.slice\(0, 1\)\s*\n?\s*\.concat\(\["Creator Profile"\], PROFILE_ROWS\.slice\(1\)\)\.map/,
    "the row must not be gated on shareRole"
  );
  assert.ok(
    !/shareRole === "merchant"\s*\n?\s*\? PROFILE_ROWS\.slice/.test(dash),
    "the old merchant-only branch is gone"
  );
});

test("the shop button waits until there is a shop", () => {
  // "Your page & what you sell" on an account with no creator name would
  // open a page with nothing to put on it. The setup button is the only
  // thing that row offers until a name exists.
  const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  // The door is the digital address row now — see "the address is a
  // door, not a label" below. What this test is still about is that it
  // does not exist at all until there is a name behind it.
  assert.match(src, /\{done \? <button\s*\n?\s*onClick=\{onOpenPage\}/);
  assert.match(src, /<\/button> : null\}/);
  // And the panel offers setup instead when there is none — the same
  // branch, the other side of it.
  assert.match(src, /Set up my creator name<\/button>\}/);
});

// ── THE IDENTITY STOPPED LOOKING LIKE A SETTINGS PAGE ───────────────────
//
// It was a white card: a mark, the handle under it, and three
// label/value rows. Correct, legible, and indistinguishable from the
// eight other rows in the profile list — for the thing a creator's
// customers type to pay them.
//
// The founder had another tool redraw it and sent the result back: the
// name on a violet field with its mark beside it, the things you DO with
// a name as buttons, and the facts below as icon rows.
describe("the creator's name is presented as a name", () => {
  const panel = () => {
    const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
    // From the note ABOVE the function, which is where the three things
    // in the mockup that were deliberately not built are written down.
    return src.slice(src.indexOf("THE CREATOR'S OWN IDENTITY"));
  };

  test("the mark and the name sit side by side on their own field", () => {
    const src = panel();
    assert.match(src, /background: T\.gradButton/, "the name is back on a plain white card");
    assert.match(src, /\{done \? creatorDisplayName\(creator\) : "No creator name yet"\}/);
    assert.match(src, /People pay you at your digital address below/,
      "the line that points at the address row");
  });

  test("the three things you do with a name are on it", () => {
    const src = panel();
    for (const [what, label] of [
      ["show the code", "Show your code"],
      ["send it to somebody", "Share your name"],
      ["copy it", "Copy your name"]
    ]) {
      assert.ok(src.includes(label), `no way to ${what} from the creator profile`);
    }
    // Disabled rather than absent before a name exists: three buttons
    // that vanish would move the card under a thumb mid-setup.
    assert.match(src, /disabled=\{!done\}/);
  });

  test("share falls back to the clipboard and never throws", () => {
    // navigator.share is absent on desktop and refused outright in some
    // embedded browsers. A share sheet the browser will not open is not
    // worth taking the screen down over.
    const src = panel();
    const fn = src.slice(src.indexOf("const share ="), src.indexOf("const copy ="));
    // Through gloobalShareLink since "share is a text not link" — it sends
    // the shop's link inside the message, and the helper owns the
    // share → clipboard fallback and never throws.
    assert.match(fn, /gloobalShareLink\(/);
    const helper = readSource("frontend/components/common/shareLink.js");
    assert.match(helper, /nav\.share/);
    assert.match(helper, /nav\.clipboard\.writeText\(text\)/);
    assert.match(helper, /catch \(error\)/);
    const cp = src.slice(src.indexOf("const copy ="), src.indexOf("const act ="));
    assert.match(cp, /catch \(e\)/);
  });

  test("the GLOOBAL ID starts covered, like every other figure here", () => {
    // Not a secret, but an identifier somebody can write down over your
    // shoulder — and this is a screen people open in front of customers.
    const src = panel();
    assert.match(src, /const \[idShown, setIdShown\] = useState53\(false\)/);
    assert.match(src, /aria-label=\{idShown \? "Hide your Gloobal ID" : "Show your Gloobal ID"\}/);
    assert.match(src, /aria-pressed=\{idShown\}/);
  });

  test("the live dot is rung in white, not in the card's own violet", () => {
    // A render killed the first attempt: the card is a GRADIENT, so a
    // flat violet ring is the wrong violet everywhere except one line of
    // it, and read as a mismatched purple circle rather than a cut-out.
    // White also works on the corner of an uploaded logo, which is the
    // other half of where that dot sits.
    const src = panel();
    const dot = src.slice(src.indexOf("Live, or not yet"), src.indexOf("Live, or not yet") + 1200);
    assert.match(dot, /border: "3px solid #FFFFFF"/);
    assert.doesNotMatch(dot, /border: "3px solid #7C3AED"/);
    // And it means the one true thing available on this screen.
    assert.match(dot, /background: done \? T\.positive : T\.inkFaint/);
  });

  test("the mockup's dark-mode switch was not built, and says why", () => {
    // A control that does nothing is worse than an absent one: this app
    // has no dark mode for a moon to toggle. The shop page's own `dark`
    // is a property of that shop, not of the app.
    const src = panel();
    assert.match(src, /no dark mode to switch/);
    assert.doesNotMatch(src, /<Moon\d*\b/);
  });
});

describe("scanning a shop shows the shop", () => {
  const app = () => readSource("frontend/App.jsx");

  test("a scanned ID is checked for a creator name", () => {
    // ── WHAT THIS FIXES ──────────────────────────────────────────────
    //
    // A Gloobal QR carries an ID and nothing else, so the card drew
    // whatever the account lookup returned: a profile photo and a
    // person's given name. For an account that is ALSO a creator that is
    // the wrong half of their identity — somebody scanning a sticker on
    // a tea stall got the owner's face, with no sign of the shop they
    // were standing in front of.
    assert.match(app(), /creator = await GloobalApi\.getCreatorProfile\(parsed\.gloobalId\)/);
    // Only an account with a NAME is a shop. A creator row that exists
    // but was never finished is not one.
    assert.match(app(), /const named = creator && typeof creator\.handle === "string" && creator\.handle\.trim\(\)/);
  });

  test("a failed lookup leaves the person's own card, never a blank one", () => {
    const src = app();
    const at = src.indexOf("IS THIS A SHOP OR A PERSON");
    const block = src.slice(at, at + 2600);
    assert.match(block, /catch \(e\) \{\s*\n\s*creator = null;/,
      "the extra lookup must not be able to break the card");
    assert.match(block, /setScanPayee\(named \? \{ \.\.\.result\.payee, creator \} : result\.payee\)/,
      "and the account's own details stay as the floor");
  });

  test("the card leads with the mark and the brand name", () => {
    const src = app();
    // "Gloobal बाजार" now — the brand in bold, the Hindi word for market.
    assert.match(src, /<GloobalWordmark \/><\/b> \{"\\u092C\\u093E\\u091C\\u093E\\u0930"\}/);
    assert.match(src, /src=\{scanPayee\.creator\.logo\}/, "their logo where they have one");
    assert.match(src, /businessMarkInitials\(scanPayee\.creator\.handle \|\| ""\)/,
      "and the generated mark where they do not, so a shop is never a gap");
    assert.match(src, /scanPayee\.creator \? creatorDisplayName\(scanPayee\.creator\) : scanPayee\.name/);
    // 0100 put the handle under the name here and called it "the address
    // under the name they are known by". It was the same word twice —
    // see "a creator's name is drawn once" below — and the card somebody
    // reads in the half-second before paying is the worst place in the
    // app to spend a line on nothing.
    assert.doesNotMatch(src, /\{scanPayee\.creator\.handle\}<\/div>/,
      "the scan card prints the brand name and then prints it again");
  });

  test("Pay names what the card named", () => {
    // Scanning a shop and then being asked to confirm a payment to
    // somebody's given name reads as the wrong recipient, which on a
    // payment screen is the one doubt worth never creating.
    assert.match(app(), /name: \(payee\.creator && creatorDisplayName\(payee\.creator\)\) \|\| payee\.name,/);
  });

  test("the card uses the app's own scan mark, not the word", () => {
    // The header, the shop page and the dashboard tile all draw the mark;
    // this one spelled it out. One thing to learn for "point this at a
    // code".
    //
    // The control then left the card entirely — under the Pay button is
    // the row a thumb is already heading for — and lives in the corner
    // with the other nav controls, at their size rather than its own.
    // See scan-card.test.mjs; what this test still owns is that it is a
    // MARK and not the word "Scan again".
    const src = app();
    assert.match(src, /label="Scan another code"/);
    // Through NavScanButton now, which draws the mark at NAV_GLYPH_SIZE.
    assert.match(src, /<NavScanButton\s+onClick=\{\(\) => setScanPayee\(null\)\}/);
    // Scoped to the confirm card. "Scan again" is still the right words
    // on the RETRY button after a lookup fails — that one is a sentence
    // about what went wrong, not a control sitting beside Pay.
    const card = src.slice(src.indexOf('{scanPayee.creator ? "GLOOBAL Shop" : "GLOOBAL ID"}'));
    assert.doesNotMatch(card.slice(0, card.indexOf("</div>}</div>}</div>;")), /Scan again/,
      "the word is back on the confirm card");
  });
});

// ── THE NAME WAS BEING PRINTED TWICE ────────────────────────────────────
//
// Four surfaces drew the display name with the handle under it in accent:
// the pinned tile, the Pay & Services hit, the supplier finder, and the
// card you get for scanning a shop. The reasoning at each was that a shop
// which can take money should not look like a placeholder brand which
// cannot, and the honest difference is an address people type.
//
// The need was real; the means was not. creatorDisplayName is handleFirst
// plus handleLast, and the handle is those same parts folded and joined
// with a dot — so the two lines are the same characters every time:
//
//     रसोई Ghar
//     रसोई.ghar
//
// A word repeated in a second colour does not prove there is an address.
// It says the word twice, in half the room a 62px tile has.
//
// A guard was tried first — draw the second line only where it differs —
// and deleted, because it could never fire: the no-handleFirst case falls
// through creatorHandleLabel, which returns the handle. These tests pin
// that, so nobody re-derives the guard from the same wrong premise.
describe("a creator's name is drawn once", () => {
  const setup = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  const names = new Function(`${setup.slice(
    setup.indexOf("function creatorHandleLabel"),
    setup.indexOf("function creatorSetupDone")
  )}
    return { creatorDisplayName, creatorHandleLabel };`)();

  test("the display name and the handle are the same word", () => {
    const flat = (s) => String(s).toLowerCase().replace(/[.\s]+/g, "");
    for (const creator of [
      { handleFirst: "रसोई", handleLast: "Ghar", handle: "रसोई.ghar" },
      { handleFirst: "alwar", handleLast: "wali", handle: "alwar.wali" },
      { handleFirst: "Chacha", handle: "chacha" },
      { handleFirst: "AMAZON", handle: "amazon" },
      // The case a guard would have been written for — and it is the same
      // word too, which is exactly why there is no guard.
      { handle: "chacha.tea" }
    ]) {
      assert.equal(
        flat(names.creatorDisplayName(creator)), flat(creator.handle),
        `${JSON.stringify(creator)} would have drawn its name twice`
      );
    }
  });

  test("no surface draws the handle under the name any more", () => {
    for (const [what, file, gone] of [
      ["the pinned tile", "frontend/features/creator/businessMark.jsx", /title=\{b\.handle\}>\{b\.handle\}/],
      ["the Pay & Services hit", "frontend/screens/Dashboard/Dashboard.jsx", /\}\}>\{creatorHit\.handle\}<\/span>/],
      ["the supplier finder", "frontend/features/creator/CreatorFinder.jsx", /\}\}>\{found\.handle\}<\/span>/],
      ["the scan card", "frontend/App.jsx", /\}\}>\{scanPayee\.creator\.handle\}<\/div>/]
    ]) {
      assert.doesNotMatch(readSource(file), gone, `${what} still prints the handle under the name`);
    }
  });

  test("each of them still draws the name itself", () => {
    // Removing a duplicate must not remove the original. This is the
    // failure mode of every de-duplication.
    assert.match(readSource("frontend/features/creator/businessMark.jsx"), /title=\{b\.label\}>\{b\.label\}/);
    assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /\{creatorDisplayName\(creatorHit\)\}/);
    assert.match(readSource("frontend/features/creator/CreatorFinder.jsx"), /\{creatorDisplayName\(found\)\}/);
    assert.match(readSource("frontend/App.jsx"), /creatorDisplayName\(scanPayee\.creator\)/);
  });

  test("the address is still reachable where somebody needs to read it out", () => {
    // Behind the eye on the creator's own page, beside the Gloobal ID —
    // where the founder put it. Deleting a duplicate is not the same as
    // deleting the information, and this is the line between the two.
    const page = readSource("frontend/features/creator/CreatorPage.jsx");
    assert.match(page, /detailsOpen/);
    assert.ok(page.includes("creator.handle") || page.includes("handleLabel"),
      "the creator page no longer shows the address anywhere");
  });
});

// ── THE NAME AND THE ADDRESS ARE TWO DIFFERENT THINGS ───────────────────
//
// The violet card used to carry the handle as its title. A handle is an
// ADDRESS — lower-cased, dotted, unique, the string somebody types to
// send money — and the card is where the shop's NAME belongs.
//
// "Keep रसोई.ghar in below details list as digital adress on tap lead me
// to the inventory page they are selling."
//
// This is not 0102 coming back. 0102 removed a second line that repeated
// the first and did nothing else; the address row is a button that opens
// the page, and it REPLACED the separate "Your page and what you sell"
// row rather than being added beside it. One screen, two forms of one
// name, each doing its own job.
describe("the address is a door, not a label", () => {
  const panel = () => {
    const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
    return src.slice(src.indexOf("THE CREATOR'S OWN IDENTITY"));
  };

  test("the card says the name and the row says the address", () => {
    const src = panel();
    assert.match(src, /\{done \? creatorDisplayName\(creator\) : "No creator name yet"\}/,
      "the card still leads with the dotted address");
    assert.match(src, /\}\}>\{handle\}<\/span>/, "the address is not drawn anywhere");
    assert.match(src, /Your digital address/, "the row never says what it is");
  });

  test("tapping the address opens the page it addresses", () => {
    const src = panel();
    const at = src.indexOf("THE DIGITAL ADDRESS, WHICH IS ALSO THE DOOR");
    assert.ok(at > 0, "the address row is gone");
    const row = src.slice(at, at + 1800);
    assert.match(row, /onClick=\{onOpenPage\}/);
    assert.match(row, /aria-label=\{`Open your page, \$\{handle\}`\}/);
  });

  test("and it is the only door, not a second one", () => {
    // The panel used to carry a "Your page and what you sell" card of its
    // own underneath. An address and the place it addresses are one
    // thing; two rows for them is two doors to one room — the same
    // objection that kept the mockup's second map icon out.
    const src = panel();
    assert.equal(
      (src.match(/onClick=\{onOpenPage\}/g) || []).length, 1,
      "there are two ways into the page from one screen"
    );
    assert.doesNotMatch(src, /Your page and what you sell<\/span>/);
  });
});

// ── BOTH SIDES OF THE BOOK ──────────────────────────────────────────────
describe("sales and purchases", () => {
  const ledger = () => readSource("frontend/features/creator/CreatorLedger.jsx");

  test("the screen is reachable from the creator profile", () => {
    assert.match(panelSource(), /onClick=\{onOpenLedger\}/);
    assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"),
      /onOpenLedger=\{\(\) => setShowCreatorLedger\(true\)\}/);
    assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"),
      /<CreatorLedgerScreen/, "the dashboard never mounts it");
  });

  function panelSource() {
    const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
    return src.slice(src.indexOf("THE CREATOR'S OWN IDENTITY"));
  }

  test("the bought side is itemised, because the server records lines", () => {
    const src = ledger();
    assert.match(src, /GloobalApi\.getCreatorPurchases/);
    // Quantity and the supplier, which is what makes a purchase line
    // worth more than the payment it came from.
    assert.match(src, /row\.quantity/);
    assert.match(src, /row\.supplierHandle/);
  });

  test("the sold side says it is payments, not items", () => {
    // The asymmetry is real and the screen must not paper over it: a
    // customer paying a tea stall gets a plain payment with no order
    // attached — CreatorPurchase's own header says why — so nothing
    // records which samosas were in the bag.
    //
    // It could not be narrower even if we wanted: creatorId === secureId,
    // so the server cannot tell a payment made to the shop from one made
    // to the person. They are the same payment to the same ID.
    const src = ledger();
    assert.match(src, /Money people paid you/);
    assert.match(src, /records the payment, not the basket/);
    assert.match(src, /THE CREATOR SIDE AND THE PERSONAL SIDE ARE ONE ACCOUNT/,
      "the reason the sold side cannot be filtered should stay written down");
  });

  test("a figure here carries both of its names, like every other", () => {
    // A history screen is not an exception to the GEU rule and was never
    // going to be allowed to become one.
    assert.match(ledger(), /<GeuFigure/);
    assert.doesNotMatch(ledger(), /toLocaleString\(\)/,
      "a raw figure would name one of its two units and not the other");
  });

  test("a failed load is not an empty list", () => {
    // "You have never bought anything" and "we could not reach the
    // server" are different sentences, and only one of them is true
    // offline.
    const src = ledger();
    assert.match(src, /Could not load your purchases just now\./);
    assert.match(src, /bought === null/, "there is no third state for not-yet-loaded");
  });

  test("the purchases are fetched when that tab opens, not on mount", () => {
    // Most visits are to check what came in. A request for the other
    // list on every open is a request nobody asked for.
    assert.match(ledger(), /if \(tab !== "bought" \|\| bought !== null\) return undefined;/);
  });

  test("the screen is in the build", () => {
    assert.match(readSource("build_app.mjs"), /"features\/creator\/CreatorLedger\.jsx"/,
      "a source file missing from FRONTEND_MODULES is silently not in the app");
  });
});


// ── THE CODE SAYS WHICH SIDE IT IS ──────────────────────────────────────
//
// "when I scan a qr on personal side and when i scan a qr on creator side
// both show creator name."
//
// Both Receive screens drew the same bytes, because the two sides are one
// Gloobal ID. 0100's "show the shop if the account has a creator name"
// was the only decision available, and it made both codes show the shop.
// The code now carries its side, and the card believes it.
describe("a personal code shows the person", () => {
  test("a personal code is never looked up as a shop", () => {
    // The person's own name and ID are what they chose to show. A lookup
    // that could only overrule that is a lookup not worth making.
    const src = readSource("frontend/App.jsx");
    const at = src.indexOf("THE CODE SAYS WHICH SIDE IT IS, AND THE CARD BELIEVES IT");
    assert.ok(at > 0, "the side rule is gone from the scan");
    assert.match(src.slice(at, at + 1600), /if \(parsed\.side !== "person"\) \{\s*\n\s*try \{\s*\n\s*creator = await GloobalApi\.getCreatorProfile/);
  });

  test("a code with no side keeps the old behaviour", () => {
    // Every sticker ever printed is an unmarked /p/ code. The day this
    // ships, none of them may change what they show.
    const link = readSource("backend/utils/gloobalPayLink.js");
    assert.match(link, /p: "either"/);
    assert.match(link, /GLOOBAL_PAY_LETTER_BY_SIDE\[side\] \|\| "p"/,
      "an unspecified side has to fall back to the unmarked form");
  });

  test("a link opened from a phone's camera carries its side too", () => {
    const src = readSource("frontend/App.jsx");
    const fn = src.slice(src.indexOf("function readPayLinkFromUrl"), src.indexOf("function readPayLinkFromUrl") + 700);
    assert.match(fn, /\/\^\\\/\[pus\]\(\\\/\|\$\)\//, "only /p/ links are recognised on open");
    assert.match(fn, /readGloobalPayFromPath\(path\)/);
  });
});

// ── THE SHOP HANDS OUT THE SHOP'S CODE ──────────────────────────────────
describe("the Creator Profile's code button", () => {
  const dash = () => readSource("frontend/screens/Dashboard/Dashboard.jsx");

  test("opens the shop's own code, big, with a random picture", () => {
    // "when I tap it out of creator side qrs i get one random with big
    // size both share and copy id options". It used to open the personal
    // Receive screen — the wrong side's code, from a profile about the
    // creator side.
    const src = dash();
    assert.match(src, /onShowQr=\{\(\) => setShopCode\(gloobalAnimalQrRandom\(\)\)\}/);
    assert.match(src, /side="shop"\s*\n\s*style=\{shopCode\}/, "the shop code is not drawn as the shop's side");
    assert.doesNotMatch(src, /onShowQr=\{\(\) => setShowReceive\(true\)\}/);
  });

  test("a forced picture hides the picker, and a random one is never saved", () => {
    const card = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
    assert.match(card, /\{forcedStyle \? null : <div\s*\n\s*role="radiogroup"/);
    const anim = readSource("frontend/components/common/gloobalAnimalQr.js");
    const fn = anim.slice(anim.indexOf("function gloobalAnimalQrRandom"), anim.indexOf("function gloobalAnimalQrSaveChoice"));
    assert.doesNotMatch(fn, /localStorage|SaveChoice/, "a random pick is being remembered as a choice");
  });

  test("share falls back to the link before it falls back to a download", () => {
    // canShare({ files }) is false on a lot of Android browsers and in
    // most installed PWAs, and a download inside an installed app looks
    // like nothing happened. The link is the thing that pays.
    const card = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
    const fn = card.slice(card.indexOf("const handleShare"), card.indexOf("return (\n    <section"));
    // The picture → link order now lives in shareLink.js; the card hands
    // it both and keeps the download for when neither can go.
    const helper = readSource("frontend/components/common/shareLink.js");
    const files = helper.indexOf("nav.canShare({ files: [file] })");
    const text = helper.indexOf("await nav.share(title ? { title, text } : { text });");
    assert.ok(files > 0 && text > files, "the helper tries the picture, then the link");
    const call = fn.indexOf("gloobalShareLink(");
    const download = fn.indexOf("link.download = \"gloobal-qr.png\"");
    assert.ok(call > 0 && download > call, "the card downloads only after the share helper");
  });

  test("the map button stands aside on the Creator Profile", () => {
    // Its default resting place is the violet card's pencil.
    const src = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
    const panel = src.slice(src.indexOf("function CreatorProfilePanel"));
    assert.match(panel, /gloobal:blockingOverlay/);
  });

  test("a pasted address splits into both search boxes", () => {
    const src = dash();
    assert.match(src, /onPaste=\{\(e\) => \{[\s\S]{0,400}setMoreQuery\(text\.slice\(0, dot\)\);\s*\n\s*setMoreQueryLast\(text\.slice\(dot \+ 1\)\);/);
    // Plain text with no dot, or with a space, is left to the box.
    assert.match(src, /if \(dot <= 0 \|\| \/\\s\/\.test\(text\)\) return;/);
  });
});
