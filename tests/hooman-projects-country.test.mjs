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

  test("the screen states which country, and the hero is where", () => {
    // The overlay covers the country panel it was opened from, so without
    // this the one fact that decides what is in the list is the one fact the
    // list does not state.
    //
    // It used to be a flag in the header. The header is now the search bar
    // and nothing else, and the hero directly beneath carries the flag AND
    // the country spelled out — which says more, in the place the eye lands
    // first.
    const src = code(SCREEN);
    const at = src.indexOf('{showHoomanProjects && <div style={{ position: "fixed"');
    assert.ok(at > 0, "the Hooman Projects overlay moved");
    const top = src.slice(at, at + 4200);
    assert.match(top, /<FlagEmoji flag=\{country\.flag\}/, "nothing shows the country's flag");
    assert.match(top, /\{country\.name\}/, "nothing names the country");
  });

  test("there is exactly one way off this screen, and it says so", () => {
    // The header's flag was doing two jobs and both moved: the hero names the
    // country, and the hero's chip is now the exit.
    //
    // Measured, not assumed: hardware back from this overlay lands on the
    // DASHBOARD rather than the Coverage screen underneath, and an iOS PWA
    // has no system back at all. A screen with no control is a screen with no
    // exit on one of the two platforms, so one has to exist and be named.
    const src = code(SCREEN);
    const at = src.indexOf('{showHoomanProjects && <div style={{ position: "fixed"');
    const top = src.slice(at, at + 4200);
    const exits = (top.match(/setShowHoomanProjects\(false\)/g) || []).length;
    assert.equal(exits, 1, `the projects screen has ${exits} exits; expected exactly one`);
    assert.match(top, /Back to Gloobal Coverage/, "the exit is not announced to a screen reader");
  });

  test("the country chip filters location, it does not navigate", () => {
    // The hero's chip used to be the exit. Back has its own arrow now, in the
    // position every other screen in this app puts one, so the chip is free to
    // do the job its position implies: every figure on the card it sits in is
    // scoped to one country, and this is what changes the country.
    //
    // It opens the existing All countries picker — a real list of 194 with a
    // search box — rather than a second country UI built for this screen.
    const src = code(SCREEN);
    assert.match(src, /aria-label=\{`Showing \$\{country\.name\}\. Change country`\}/);
    assert.match(src, /onClick=\{\(\) => setShowAllCountries\(true\)\}/);
  });

  test("the country picker opens ABOVE the projects screen", () => {
    // It was z-index 270 and this overlay is 340, so opening it from here
    // would have rendered the picker underneath the screen that asked for it
    // — a tap that appears to do nothing.
    const src = code(SCREEN);
    assert.match(src, /\{showAllCountries && <div style=\{\{ position: "fixed", inset: 0, zIndex: 360/);
  });

  test("add-project is reachable without scrolling the list", () => {
    // A dashed button at the END of the list is a control nobody reaches on a
    // country with forty projects. Absolute within the overlay, not fixed, so
    // it is bounded by this screen and cannot outlive it on another.
    const src = code(SCREEN);
    assert.match(src, /aria-label=\{`Add a project to \$\{selectedHoomanCategory\}`\}/);
    assert.match(src, /position: "absolute", right: 18, bottom: "calc\(20px \+ env\(safe-area-inset-bottom, 0px\)\)"/);
    // The list has to leave room, or the last card sits under the button.
    assert.match(src, /padding: "0 18px 96px"/);
  });

  test("the top of the screen is the search bar alone", () => {
    const src = code(SCREEN);
    const at = src.indexOf('{showHoomanProjects && <div style={{ position: "fixed"');
    // Everything before the scrolling area: the header, and nothing else.
    const header = src.slice(at, src.indexOf('overflowY: "auto"', at));
    assert.match(header, /placeholder="Hooman Projects"/, "the search bar is not in the header");
    assert.ok(
      !/setShowHoomanCategoryPicker\(true\)/.test(header),
      "the category chip is back on the search bar — the tile grid and All 8 already do that"
    );
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

  test("the hero carries the country's raised total, and nothing duplicates it", () => {
    // Our spending had a pinned block at the foot of this screen. The hero
    // now states the same thing — money into projects in this country — at
    // the top, where it is read first, so the footer was the same figure
    // twice on one screen.
    //
    // The Our spending ROW on the Coverage panel is untouched: that one means
    // everything Gloobal pays Hoomans, which is a wider figure than projects.
    const src = code(SCREEN);
    assert.match(src, />Raised</, "the hero does not state what the figure is");
    assert.match(src, /fmtMoney\(hoomanRaisedTotal, displayCurrency\)/);

    // Only one place inside the projects overlay talks about Our spending now
    // — none. The Coverage panel's row lives outside it.
    const overlayStart = src.indexOf('{showHoomanProjects && <div style={{ position: "fixed"');
    const overlayEnd = src.indexOf('{showProjectForm &&', overlayStart);
    const overlay = src.slice(overlayStart, overlayEnd);
    assert.ok(!overlay.includes('Our spending'), 'the projects screen still carries an Our spending block');
  });

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
    // The count no longer reads projectsData.counts[category] from the
    // server. It counts the rows the screen is ACTUALLY RENDERING, which is
    // strictly stronger: the server's per-category count is unaware of the
    // filter chips, so a filtered list under an unfiltered count would be a
    // header disagreeing with the rows beneath it — the exact defect the
    // card version of this was fixed for.
    assert.match(src, /hoomanVisibleProjects\.length/, "the count is no longer derived from the rows");
    assert.ok(
      !/projectsData\.counts\[selectedHoomanCategory\]/.test(src),
      "the count went back to the server's figure, which cannot see the filter"
    );
    assert.match(src, /∆/, "the unanswered count is no longer ∆");
    assert.match(src, /Couldn't reach the server, so we don't know what's here\./);
  });

  test("the filter narrows the rows, not the query", () => {
    // Filtering the page the server already returned is what keeps the count
    // honest. A chip that re-queried would need its own count and its own
    // round trip, and the two could disagree mid-flight.
    const src = code(SCREEN);
    assert.match(src, /hoomanProjectFilter === "draft"\) return project\.status === "draft"/);
    assert.match(src, /hoomanProjectFilter === "live"\) return project\.status !== "draft"/);
  });

  test("the project page shows only the contact rows that exist", () => {
    // A Details card listing three labels with nothing beside them describes
    // a project nobody filled in, which is a different thing from a project
    // with no website.
    const src = code(SCREEN);
    assert.match(src, /\]\.filter\(Boolean\)/, "the detail rows are not filtered to the ones present");
    assert.match(src, /details\.length > 0 && </, "the Details card is drawn even when empty");
  });

  test("a goal on the project page says it cannot be given to", () => {
    // Without this line the figure reads as something you can contribute
    // towards. It is the one sentence that stops a stated target being
    // mistaken for an open collection.
    const src = code(SCREEN);
    assert.match(src, /cannot take contributions towards it/);
  });

  test("every funding figure is derived, never a literal zero", () => {
    // The rule changed: the founder wants the full funding UI, reading zero.
    // That is honest — nothing can take a contribution, so nobody has given
    // — but ONLY while the zero comes from the data. A hardcoded 0 would
    // still read zero the day contributions start arriving, and would then
    // be a lie that nobody notices because it never changes.
    const src = code(SCREEN);
    assert.match(src, /const projectRaised = \(project\) => Number\(project\?\.raised\) \|\| 0;/);
    assert.match(src, /const projectBackers = \(project\) => Number\(project\?\.backers\) \|\| 0;/);
    assert.match(src, /hoomanVisibleProjects\.reduce\(\(sum, p\) => sum \+ projectRaised\(p\), 0\)/);
    // The figures on screen go through those helpers, not through a constant.
    assert.match(src, /projectRaised\(hoomanProject\)/);
    assert.match(src, /projectBackers\(hoomanProject\)/);
  });

  test("a progress bar never divides by a goal of zero", () => {
    // A bar at 100% because it was divided by nothing is worse than no bar:
    // it reports a project as fully funded.
    const src = code(SCREEN);
    const guards = src.match(/goalMajor > 0 \? Math\.min\(100, Math\.round\(\(raised \/ goalMajor\) \* 100\)\) : 0/g) || [];
    assert.equal(guards.length, 2, "a progress percentage is computed without the zero-goal guard");
  });

  test("the zero is explained wherever it is shown", () => {
    // Three figures all reading zero look like a project nobody wants. The
    // sentence is what makes them read as a flow that is not open yet, and
    // it appears on the hero, the project page and the form.
    const src = code(SCREEN);
    const says = (src.match(/cannot take contributions/g) || []).length;
    assert.ok(says >= 3, `the zero is explained in ${says} place(s); expected the hero, the project page and the form`);
  });

  test("every outbound link on the project page is safe", () => {
    // rel="noopener noreferrer" on all of them: the target learns nothing
    // about where it was opened from. The server already refuses anything
    // that is not http(s), so neither href can be a javascript: URL.
    const src = code(SCREEN);
    const hrefs = src.match(/target="_blank"/g) || [];
    const rels = src.match(/rel="noopener noreferrer"/g) || [];
    assert.equal(hrefs.length, rels.length, "a _blank link is missing its rel");
  });

});
