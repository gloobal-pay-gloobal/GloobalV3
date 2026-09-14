// tests/hooman-projects-country.test.mjs
//
// Hooman Projects belong to a country, and the Coverage screen is about one
// country at a time.
//
// ── The defect ───────────────────────────────────────────────────────────
//
// Everything on the Coverage screen is scoped to `selected`: the spending,
// the lock state, the transactions-per-day, the flag on the hero. The button
// that opens Hooman Projects sits INSIDE that country's panel. But the
// listing asked for `{ category, q }` and nothing else, so it returned every
// published project on the platform — opening the overlay from Pakistan and
// from India produced byte-identical lists, and a card could carry a flag for
// a country other than the one being looked at.
//
// What makes this worth a test file rather than a one-line fix is where the
// bug was NOT. The model has had an indexed `countryIso` since it was
// written, resolved from the creator's own account rather than asked for.
// The route has parsed and validated `?country=` since it was written. So
// has GloobalApi.listProjects. Every layer supported it; the screen simply
// never sent one. Nothing looked broken because the wrong answer was a
// perfectly valid answer to a different question — which is the reason this
// suite asserts the SCREEN sends it, not merely that the route accepts it.
//
// ── The two things fixing it broke ───────────────────────────────────────
//
// Both are pinned below, because both are the kind that reappear:
//
//   1. The per-category counts on the card were computed over a different
//      filter from the list beneath them. Dropping `country` and `q` was
//      invisible while the client sent neither; the moment it sent a country
//      the card read "12" over a list of two. The route's own comment
//      promises those two can never disagree.
//   2. A project is filed where its CREATOR is, not where the reader is
//      looking. Once the list became per-country, adding a project while
//      reading about another country saved it somewhere the person could not
//      see — no error, no row, it just did not appear.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SCREEN = "frontend/screens/Coverage/GloobalCoverageScreen.jsx";
const SERVER = "server/server.js";
const MODEL = "server/models/Project.js";
const API = "backend/services/api/gloobalApi.js";

const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const code = (p) => strip(readSource(p));

// The body of the listing effect, so assertions about it cannot be satisfied
// by a country appearing anywhere else in a 900-line screen.
function listingEffect() {
  const src = code(SCREEN);
  const at = src.indexOf("GloobalApi.listProjects({");
  assert.ok(at > 0, "the screen no longer lists projects");
  const end = src.indexOf("}, [showHoomanProjects", at);
  assert.ok(end > at, "the listing effect's dependency array moved");
  return src.slice(at, end + 200);
}

describe("the list is the selected country's", () => {
  test("the screen sends the country it is showing", () => {
    assert.match(listingEffect(), /country: country\.code/);
  });

  test("and refetches when that country changes", () => {
    // Without the dependency the first country's list would stay on screen
    // under a second country's flag — a worse failure than not filtering at
    // all, because it would look filtered.
    assert.match(listingEffect(), /\}, \[showHoomanProjects, selectedHoomanCategory, country\.code, projectQuery, projectsToken\]\)/);
  });

  test("`country` is the SELECTED country, not the account's", () => {
    // dialCountry is the viewer's own dialling country and is used for their
    // currency. The list is about the country being read about, which is a
    // different thing and is what every other figure on this screen uses.
    const src = code(SCREEN);
    assert.match(src, /const country = COVERAGE_ALL_COUNTRIES\.find\(\(c\) => c\.code === selected\)/);
    assert.ok(!/country: dialCountry/.test(listingEffect()), "the list follows the viewer instead of the screen");
  });

  test("the route has always accepted it", () => {
    // The fix is one argument precisely because none of this needed writing.
    const src = code(SERVER);
    assert.match(src, /const country = String\(req\.query\.country \|\| ''\)\.trim\(\)\.toUpperCase\(\);/);
    assert.match(src, /filter\.countryIso = country;/);
    assert.match(src, /country must be a two-letter ISO code\./);
  });

  test("and so has the API client", () => {
    assert.match(code(API), /if \(opts\.country\) params\.set\("country", opts\.country\);/);
  });
});

describe("the number on the card counts what the list shows", () => {
  test("the count filter carries the country", () => {
    const src = code(SERVER);
    assert.match(src, /if \(filter\.countryIso\) countFilter\.countryIso = filter\.countryIso;/);
  });

  test("and the search", () => {
    // `q` becomes filter.$or over title and summary. Dropping it made the
    // card contradict the list on every search, which was true before this
    // change too — it was just never visible, because a global count over a
    // global list happened to agree.
    assert.match(code(SERVER), /if \(filter\.\$or\) countFilter\.\$or = filter\.\$or;/);
  });

  test("but NOT the category, which is the thing being broken down", () => {
    // Keeping it would return the selected category's number and zero for the
    // other seven — a breakdown of one.
    const src = code(SERVER);
    const at = src.indexOf("const countFilter =");
    const body = src.slice(at, src.indexOf("Project.aggregate", at));
    assert.ok(!/countFilter\.category/.test(body), "the per-category count is filtered to one category");
  });

  test("and NOT the paging cursor", () => {
    // filter._id is the keyset cursor. Carrying it would shrink the count as
    // the reader paged down — a count of the rows below this point.
    const src = code(SERVER);
    const at = src.indexOf("const countFilter =");
    const body = src.slice(at, src.indexOf("Project.aggregate", at));
    assert.ok(!/countFilter\._id/.test(body), "the count follows the paging cursor");
  });

  test("the card says which country it is counting", () => {
    // "Projects in this category" was true of a platform-wide list. Over a
    // per-country one it is a label that drops the more surprising half of
    // what it counts.
    assert.match(code(SCREEN), /Projects in \{country\.name\}/);
  });

  test("the empty states name the country too", () => {
    const src = code(SCREEN);
    assert.match(src, /No \$\{selectedHoomanCategory\} projects in \$\{country\.name\} yet/);
    assert.match(src, /Nothing in \$\{country\.name\} matches/);
  });

  test("the overlay header carries the country's flag and name", () => {
    // The overlay covers the country panel it was opened from, so without
    // this the one fact that decides the list's contents is the one fact the
    // list does not state.
    // Anchored on the OVERLAY, not on the wordmark: the entry tile in the
    // country panel renders the same "H◦◦man Projects" text, and matching
    // that one would pass while the overlay said nothing.
    const src = code(SCREEN);
    const at = src.indexOf("{showHoomanProjects && <div style={{ position: \"fixed\"");
    assert.ok(at > 0, "the Hooman Projects overlay moved");
    const header = src.slice(at, at + 1200);
    assert.match(header, /<FlagEmoji flag=\{country\.flag\}/);
    assert.match(header, /\{country\.name\}/);
  });
});

describe("a project you create is a project you can find", () => {
  test("the country is still the server's to decide", () => {
    // Not asked for on the form, and this must stay that way: a project and
    // its creator cannot be allowed to disagree about where they are.
    const src = readSource(MODEL);
    assert.match(src, /countryIso: \{/);
    assert.match(src, /taken from the creator's own resolved account\s*\n\s*\/\/\s*country/);
    const form = code(SCREEN);
    const at = form.indexOf("GloobalApi.createProject({");
    const call = form.slice(at, form.indexOf("})", at));
    assert.ok(!/country/i.test(call), "the form now claims to choose a project's country");
  });

  test("the screen follows the project to wherever it was filed", () => {
    const src = code(SCREEN);
    assert.match(src, /if \(created && created\.countryIso && created\.countryIso !== country\.code\) \{/);
    assert.match(src, /setSelected\(created\.countryIso\);/);
  });

  test("using the server's answer rather than guessing from dialCountry", () => {
    // dialCountry is the dialling country on the account, which is not
    // necessarily the country lib/accountCountry.js resolves it to.
    const src = code(SCREEN);
    const at = src.indexOf("const created = await GloobalApi.createProject");
    const body = src.slice(at, src.indexOf("} catch (err)", at));
    assert.ok(!/dialCountry/.test(body), "the create path guesses the country instead of reading it");
  });

  test("and says why the country changed under them", () => {
    // Moving someone to another country silently is worse than leaving them
    // where they were — they would have no way to tell what happened.
    const src = code(SCREEN);
    assert.match(src, /setProjectFiledIn\(created\.countryIso\);/);
    assert.match(src, /projectFiledIn === country\.code &&/);
    assert.match(src, /projects are filed where your account is registered/);
  });

  test("the API returns the country, so there is something to follow", () => {
    assert.match(code(SERVER), /countryIso: project\.countryIso \|\| null,/);
  });
});

describe("the notice does not outlive its explanation", () => {
  test("picking a country by hand clears it", () => {
    const src = code(SCREEN);
    const at = src.indexOf("function selectCountry(code)");
    assert.ok(at > 0);
    const body = src.slice(at, src.indexOf("}", src.indexOf("heroRef.current", at)));
    assert.match(body, /setProjectFiledIn\(null\);/);
  });

  test("the create path deliberately does not go through selectCountry", () => {
    // It would clear the notice it just raised, and it would overwrite the
    // stored country — following a save is not the same as choosing where to
    // look.
    const src = code(SCREEN);
    const at = src.indexOf("const created = await GloobalApi.createProject");
    const body = src.slice(at, src.indexOf("} catch (err)", at));
    assert.ok(!/selectCountry\(/.test(body), "creating a project now overwrites the stored country");
    assert.ok(!/saveStoredCoverageCountry/.test(body));
  });

  test("it is tied to the country it names, not to a bare flag", () => {
    // Holding the ISO rather than a boolean is what stops the notice
    // appearing over a different country's list.
    assert.match(code(SCREEN), /const \[projectFiledIn, setProjectFiledIn\] = useState16\(null\);/);
  });
});

describe("the stale scaffolding comment is gone", () => {
  test("the screen no longer claims projects do not exist", () => {
    // It said the categories were "all honestly ∆ right now since there's no
    // real project concept anywhere in this app's data model yet" — written
    // before models/Project.js, and left standing beside a working list.
    const src = readSource(SCREEN);
    assert.ok(
      !/no real "project" concept anywhere/.test(src),
      "the screen still says the feature it implements does not exist"
    );
  });

  test("but the delta still means what it always meant", () => {
    // ∆ is "the server did not answer", which is a different fact from zero.
    // Removing it along with the comment would have collapsed the two.
    const src = code(SCREEN);
    assert.match(src, /projectsData \? projectsData\.counts\[cat\.name\] \?\? 0 : "∆"/);
    assert.match(src, /Couldn't reach the server, so we don't know what's here\./);
  });
});
