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
const { buildCreatorHandle, normaliseHandlePart } = new Function(`${PURE}
  return { buildCreatorHandle, normaliseHandlePart };`)();

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

  test("not half a name", () => {
    assert.equal(buildCreatorHandle("rasoi", "").ok, false);
    assert.equal(buildCreatorHandle("", "ghar").ok, false);
    assert.equal(buildCreatorHandle("   ", "ghar").ok, false, "whitespace stood in for a name");
  });

  test("and nothing that is not a string", () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(buildCreatorHandle(bad, "ghar").ok, false, `${JSON.stringify(bad)} was accepted`);
    }
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
    assert.match(setup, /Anybody who opens your creator page will see this address\./);
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

  test("and only \"taken\" turns the box red", () => {
    assert.match(strip(setup), /const tone = availability\.status === "taken" \? "bad" : availability\.status === "free" \? "good" : null;/);
    assert.match(strip(setup), /availability\.status !== "taken"/,
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
    assert.match(setup, /people can still pay your creator side at your Gloobal ID\./);
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
  test("the handle resolves to the same Gloobal ID", () => {
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
