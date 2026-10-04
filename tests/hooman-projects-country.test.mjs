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

  test("the count is stated in the singular or plural, never as a bare figure", () => {
    // This used to assert the count line read "Projects in {country.name}",
    // on a card above the list. The card is gone — it repeated the category
    // name and the country that the header already carried, and pushed the
    // list below the fold — and the count now sits directly on the rows it
    // describes.
    //
    // The country is NOT repeated on that line any more, and the rule it was
    // protecting has not been dropped: it has moved to the test below, which
    // requires the country in the overlay header. One statement of which
    // country this is, in the one place that is always on screen.
    const src = code(SCREEN);
    assert.match(src, /\? "1 project" :/, "the count has no singular form");
    assert.match(src, /projects`/, "the count has no plural form");
  });

  test("a count the server did not give is ∆, never 0", () => {
    // The one distinction this screen's whole data story rests on: a real
    // zero and an unanswered request are different facts, and showing the
    // second as the first is the quiet fabrication the ∆ convention exists
    // to prevent.
    // Anchored on the code, not on a comment — code() strips comments, so a
    // comment anchor would assert nothing and pass forever.
    const src = code(SCREEN);
    const at = src.indexOf('"1 project"');
    assert.ok(at > -1, "the count line is gone — did the count move again?");
    const block = src.slice(at - 400, at + 600);
    assert.match(block, /projectsData \?/, "the count does not branch on whether the server answered");
    assert.match(block, /∆/, "the unanswered case does not render ∆");
    assert.match(block, /aria-label="No data"/, "∆ is not announced to a screen reader");
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

    // The name is no longer PRINTED here — the flag carries the country on
    // its own, and the spelled-out name beside it was the same fact twice
    // and the half that truncated on a narrow screen. It is still CARRIED,
    // as the accessible name on the flag, because a flag with no accessible
    // name is a country that anyone who cannot see it cannot identify.
    assert.match(header, /\$\{country\.name\}/, "the flag has no accessible name");
    assert.match(header, /title=\{country\.name\}/, "the flag has no long-press label");
    assert.ok(
      !/>\{country\.name\}</.test(header),
      "the country name is printed beside its own flag again"
    );
  });

  test("the flag is the way out, and says so to a screen reader", () => {
    // The plan was to drop the back arrow and leave it to the phone. A real
    // render says that does not work: one hardware back from this overlay
    // lands on the DASHBOARD, not on the Coverage screen underneath, and on
    // iOS a standalone PWA has no system back at all. So the flag sits where
    // the arrow sat and does the arrow's job.
    //
    // The aria-label is the load-bearing part. A flag does not look like a
    // way out, and the person who most needs telling is the one who cannot
    // see it.
    const src = code(SCREEN);
    const at = src.indexOf("{showHoomanProjects && <div style={{ position: \"fixed\"");
    const header = src.slice(at, at + 1400);
    assert.match(header, /onClick=\{\(\) => setShowHoomanProjects\(false\)\}/, "the flag does not close the screen");
    assert.match(header, /Back to Gloobal Coverage/, "the exit is not announced");
  });

  test("the screen has no title, because the search field carries the name", () => {
    const src = code(SCREEN);
    const at = src.indexOf("{showHoomanProjects && <div style={{ position: \"fixed\"");
    const header = src.slice(at, at + 1400);
    // "Hooman Projects" moved into the placeholder, where it says what the
    // box searches instead of restating the screen you just opened.
    assert.ok(!/man Projects\n/.test(header), "the screen title came back");
    assert.match(src, /placeholder="Hooman Projects"/);
  });

  test("the foot of the screen carries Our spending, scoped to projects", () => {
    // Placed here rather than only on the Coverage panel because this screen
    // already knows which country it is showing — so the day a project is
    // funded, the figure has a place to land and a country to land under.
    const src = code(SCREEN);
    const at = src.indexOf("Add a project to {selectedHoomanCategory}");
    assert.ok(at > 0, "the add-project button moved");
    const foot = src.slice(at, at + 2200);

    assert.match(foot, /Our spending/, "Our spending is not at the foot of the screen");
    // Narrower than the Coverage row on purpose: what Gloobal puts into
    // projects, not everything it spends on people.
    assert.match(foot, /man Projects in \{country\.name\}/);
    assert.match(foot, /aria-label="No data">∆/, "the figure is not ∆");
  });

  test("and it is not a button, because there is nothing behind it yet", () => {
    // Spending by country opens because 194 rows of real figures sit behind
    // it. The equivalent here would be 194 rows of ∆ — a screen that teaches
    // people the app is broken. The breakdown ships with the data.
    const src = code(SCREEN);
    const at = src.indexOf("Our spending", src.indexOf("Add a project to {selectedHoomanCategory}"));
    assert.ok(at > 0, "the Our spending row at the foot moved");
    const row = src.slice(at - 900, at + 1500);
    assert.ok(!/<button/.test(row), "the row became a button with no breakdown behind it");
    assert.match(row, /Breaks down country by country once projects are funded/);
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
    // The expression moved out of the card and down onto the list, and is
    // now keyed by selectedHoomanCategory rather than by the card's local
    // `cat` — same count, same three states, no card.
    assert.match(src, /projectsData \? [^\n]*projectsData\.counts\[selectedHoomanCategory\] \?\? 0/);
    assert.match(src, /: <><span[^\n]*∆<\/span><\/>/, "the unanswered count is no longer ∆");
    assert.match(src, /Couldn't reach the server, so we don't know what's here\./);
  });
});
