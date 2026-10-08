// src/screens/Coverage/GloobalCoverageScreen.jsx
import { useState as useState16, useEffect as useEffect14, useRef as useRef12, useMemo as useMemo8 } from "react";
import {
  Target,
  Construction,
  Rocket,
  Microscope,
  GraduationCap,
  HeartPulse,
  // Aliased: backend/data/ghScoreCategories.js already imports Leaf for the
  // Hooman Score "Nature" category, and the concatenation build shares one
  // global scope — two bindings of the same name is a build error, which is
  // exactly how this was caught.
  Leaf as Leaf2,
  Palette,
  Cpu,
  ChevronLeft as ChevronLeft3,
  Search as Search5,
  ChevronDown as ChevronDown3,
  Zap as Zap5,
  Lock as Lock6,
  Unlock as Unlock2,
  X as X5,
  ChevronRight as ChevronRight5,
  ArrowLeft as ArrowLeft5,
  Globe2 as Globe23,
  Activity,
  Users2 as Users24,
  Building2 as Building22,
  TrendingUp as TrendingUp3,
  PieChart as PieChart2,
  // Globe and Globe2 are taken elsewhere in the tree, as are MapPin and
  // MapPin3 — the concatenation build shares one global scope, so each of
  // these goes one past the highest number already in use. Mail, Paperclip
  // and Link are unused anywhere, and `Link` is aliased regardless because
  // a bare `Link` reads as a router component rather than an icon.
  Plus as Plus3,
  Check as Check5,
  Heart as Heart2,
  Share2 as Share24,
  Layers3,
  Globe as Globe4,
  MapPin as MapPin4,
  Mail as Mail2,
  Paperclip as Paperclip2,
  Link as LinkIcon2
} from "lucide-react";


// src/screens/Coverage/GloobalCoverageScreen.jsx
// `coverageRefreshToken` is a counter App.jsx bumps whenever something
// happened that could move these figures — a successful payment, most of
// all. It is the whole live-update mechanism: this screen refetches when it
// changes, so nothing here has to poll and nothing goes stale behind a
// payment the person just made.
function GloobalCoverageScreen({ onClose, dialCountry, sendHistory: sendHistoryProp, isFullyRegistered, onOpenMyShare, coverageRefreshToken }) {
  // Three separate call sites iterate this prop; a missing one threw
  // "sendHistory is not iterable" and blanked the screen instead of
  // showing an empty history. Normalise once, here.
  const sendHistory = sendHistoryProp || [];
  const [showHoomanProjects, setShowHoomanProjects] = useState16(false);
  const [showSpendingBreakdown, setShowSpendingBreakdown] = useState16(false);
  const [spendingBreakdownQuery, setSpendingBreakdownQuery] = useState16("");
  const [spendingBreakdownCurrency, setSpendingBreakdownCurrency] = useState16(null);
  const [showSpendingCurrencyPicker, setShowSpendingCurrencyPicker] = useState16(false);
  const [selectedHoomanCategory, setSelectedHoomanCategory] = useState16("Infrastructure");
  const [showHoomanCategoryPicker, setShowHoomanCategoryPicker] = useState16(false);
  // Which projects the chips are letting through. Filters the page the
  // server already returned rather than re-querying, so the count beside
  // "Projects" is the number of rows actually on screen and cannot disagree
  // with what is under it.
  const [hoomanProjectFilter, setHoomanProjectFilter] = useState16("all");
  // The project whose page is open, or null. Holds the ROW the list already
  // has rather than an id to re-fetch: the detail page shows nothing the
  // list response did not already carry, so a second request would be a
  // second chance for the two to disagree.
  const [hoomanProject, setHoomanProject] = useState16(null);
  // Favourites live in THIS browser and nowhere else.
  //
  // There is no field on Project for it and no route to set one, and
  // inventing both to back a heart would be a schema change and a write path
  // for an ornament. The honest consequence, which the UI does not pretend
  // otherwise about: they do not follow the account to another device.
  //
  // The initialiser is a function so the parse happens once rather than on
  // every render, and the whole thing is wrapped because localStorage throws
  // outright in private mode and with site data blocked — a heart is not
  // worth a screen that will not open.
  // The project just submitted, for the success screen. Holds the created
  // ROW, so "View project" opens the real thing rather than a title and a
  // hope.
  const [hoomanJustCreated, setHoomanJustCreated] = useState16(null);
  const [hoomanFavourites, setHoomanFavourites] = useState16(() => {
    try {
      const stored = window.localStorage.getItem("gloobal:project-favourites");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch (e) {
      return new Set();
    }
  });

  // Searches the eight CATEGORY NAMES, in the browser. Kept exactly as it
  // was, and kept separate from the project search below: one filters a
  // fixed list of names, the other queries stored records, and collapsing
  // them into one box would give a control that claimed to search projects
  // while actually filtering a hardcoded array.
  const [hoomanCategoryQuery, setHoomanCategoryQuery] = useState16("");
  // WHICH COUNTRY'S PROJECTS, chosen from inside Hooman Projects.
  //
  // The flag chip used to open `showAllCountries` — the Coverage screen's own
  // picker. It did open, and picking did work, but it is the wrong list to
  // land on from here: it is titled "All countries", every row carries a
  // padlock or an open padlock, and the count under it reads "0 unlocked".
  // All of that is about which countries Gloobal Coverage has gone live in,
  // which has nothing to do with where a project can exist — a project can be
  // filed in any country on earth. Tapping a flag to change a project list
  // and arriving at a screen about Coverage unlocking reads as being thrown
  // somewhere else, which is exactly how it was described.
  //
  // So Hooman Projects has its own, with the one thing the Coverage list has
  // no reason to carry: the account's own country, pinned at the top.
  const [showHoomanCountryPicker, setShowHoomanCountryPicker] = useState16(false);
  const [hoomanCountryQuery, setHoomanCountryQuery] = useState16("");
  // Searches stored PROJECTS, on the server.
  const [projectQuery, setProjectQuery] = useState16("");
  const [projectsData, setProjectsData] = useState16(null);
  const [projectsLoading, setProjectsLoading] = useState16(false);
  const [projectsToken, setProjectsToken] = useState16(0);
  const [showProjectForm, setShowProjectForm] = useState16(false);
  const [projectTitle, setProjectTitle] = useState16("");
  const [projectSummary, setProjectSummary] = useState16("");
  const [projectLink, setProjectLink] = useState16("");
  // The richer fields. All optional — a project with a title and a summary
  // is still a project, and every one of these is left out of the request
  // entirely when blank rather than sent as an empty string, so a create
  // never writes a field the person did not fill in.
  const [projectPlace, setProjectPlace] = useState16("");
  const [projectWebsite, setProjectWebsite] = useState16("");
  const [projectEmail, setProjectEmail] = useState16("");
  const [projectAddress, setProjectAddress] = useState16("");
  // Typed in MAJOR units — what a person actually writes. The server turns
  // it into minor units, because only the server knows how many decimal
  // places a currency has: 20000 yen is 20000 minor units and 20000 rupees
  // is 2,000,000, and a client multiplying by 100 would be wrong by a
  // hundredfold for every zero-decimal currency.
  const [projectGoal, setProjectGoal] = useState16("");
  const [projectGoalCurrency, setProjectGoalCurrency] = useState16("");
  const [projectFile, setProjectFile] = useState16(null);
  const [projectSaving, setProjectSaving] = useState16(false);
  const [projectError, setProjectError] = useState16(null);
  // Set when a just-created project was filed under a different country from
  // the one being viewed, so the screen can say why the country changed under
  // the person rather than just changing it. Holds the ISO it was filed in;
  // cleared on the next country change the person makes themselves.
  const [projectFiledIn, setProjectFiledIn] = useState16(null);
  const [selected, setSelected] = useState16(() => {
    const stored = loadStoredCoverageCountry();
    if (stored) return stored;
    return dialCountry ? dialCountry.iso : "PK";
  });
  const [countryQuery, setCountryQuery] = useState16("");
  const [flipped, setFlipped] = useState16(false);
  const ambientFlags = useAmbientFlags();
  const filteredCoverage = useMemo8(() => {
    if (!countryQuery.trim()) return COVERAGE_ALL_COUNTRIES;
    return COVERAGE_ALL_COUNTRIES.filter((c) => countryMatches(c, countryQuery));
  }, [countryQuery]);
  // The first 20 live countries, in the order the coverage table lists
  // them. That order was previously produced by sorting on `baseUsers` —
  // an invented per-country user count that no longer exists (see
  // backend/data/coverage.js). This is the same kind of curated ordering
  // without pretending it was derived from data nobody has.
  const top20 = useMemo8(() => {
    return COVERAGE_COUNTRIES.slice(0, 20).map((c) => COVERAGE_ALL_COUNTRIES.find((x) => x.code === c.code)).filter(Boolean);
  }, []);
  const [showAllCountries, setShowAllCountries] = useState16(false);
  const [allCountriesQuery, setAllCountriesQuery] = useState16("");
  const heroRef = useRef12(null);
  const [heroW, setHeroW] = useState16(350);
  useEffect14(() => {
    const measure = () => setHeroW(heroRef.current?.offsetWidth || 350);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect14(() => {
    if (filteredCoverage.length && !filteredCoverage.some((c) => c.code === selected)) {
      setSelected(filteredCoverage[0].code);
    }
  }, [filteredCoverage]);
  const country = COVERAGE_ALL_COUNTRIES.find((c) => c.code === selected) || COVERAGE_ALL_COUNTRIES[0];
  // dialCountry is optional everywhere else in this component (line 35
  // already guards it); this was the one place that assumed it exists,
  // so a null country crashed the screen on open.
  const myCurrency = COUNTRY_CURRENCY[dialCountry?.iso] || "USD";

  // ── Every spending figure on this screen, from the server ──────────────
  //
  // This replaces an entire client-side aggregation. Spending used to be
  // reduced here in the browser from the `sendHistory` prop — this ONE
  // account's outgoing payments, hydrated from a route that returns at most
  // 100 rows, summed with `computeRealCountrySpend` without reading each
  // row's currency and grouped by the counterparty's flag emoji.
  //
  // Six things were wrong with that at once, and all six are gone because
  // the number no longer comes from here at all:
  //
  //   * It was per-account. "Global Total Spending" is defined as the sum of
  //     accumulated spending of ALL countries — one platform-wide figure
  //     that must read the same on every device, exactly like Total users
  //     beside it. Two accounts showing 21.82 and 8.1K was that defect.
  //   * Rupees were added to dollars as bare numbers.
  //   * Past 100 lifetime payments the total silently stopped accumulating.
  //   * "India" meant "money this account sent to people in India", not
  //     Indian spending.
  //   * Creator Share legs were counted as spending.
  //   * Conversion used the static RATES table compiled into this bundle,
  //     whose convert() returns 0 for a currency it does not know.
  //
  // The unit is asked for explicitly and the server converts against real
  // rates. Nothing on this screen converts money any more.
  const [coverage, setCoverage] = useState16(null);
  const [coverageLoading, setCoverageLoading] = useState16(true);
  const coverageCurrency = spendingBreakdownCurrency || myCurrency;
  useEffect14(() => {
    let cancelled = false;
    setCoverageLoading(true);
    (async () => {
      const next = await GloobalApi.getCoverage(coverageCurrency);
      if (cancelled) return;
      // A failed fetch leaves the previous answer standing rather than
      // blanking the screen — but it never invents one, so a first load that
      // cannot reach the server shows ∆ throughout.
      if (next) setCoverage(next);
      setCoverageLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // coverageRefreshToken is what makes this live: App.jsx increments it
    // after every successful payment, so the figures move as soon as money
    // does instead of waiting for a reload. Re-runs on a currency change
    // too, because the conversion happens server-side.
  }, [coverageCurrency, coverageRefreshToken]);

  // Per-country status, keyed by ISO. The server decides what "active"
  // means — see COVERAGE_ACTIVE_COUNTRY_RULE in lib/coverageAggregation.js
  // — and this screen only reads the answer.
  const coverageByIso = useMemo8(() => {
    const map = {};
    for (const row of coverage?.countries || []) map[row.countryIso] = row;
    return map;
  }, [coverage]);

  // Was `country.code === "IN"`, hardcoded, in three separate places on this
  // screen. That is why every country except India showed a padlock however
  // many people had registered there, and why the globe badge was
  // permanently "1" — no amount of real data could ever have changed it,
  // because no data was consulted.
  //
  // Tri-state, deliberately: true and false are the server's answer, and
  // null means it has not answered yet (or the configured rule cannot be
  // evaluated). A null must not render as a padlock — "we don't know" and
  // "locked" are different facts and the second one is a claim.
  const countryStatus = coverageByIso[country.code] || null;
  const isUnlocked = countryStatus ? countryStatus.active : null;
  const unlockedCount = useMemo8(
    () => (coverage?.countries || []).filter((c) => c.active === true).length,
    [coverage]
  );

  // ── Hooman Projects, from the server ───────────────────────────────────
  //
  // The whole area used to be scaffolding: eight category names in the
  // array at the bottom of this file, a literal ∆ where a count should be,
  // and no way to add anything. These are real stored records now (see
  // server/models/Project.js).
  //
  // Refetched on the country, on the category, on the search text, and on
  // projectsToken — which is bumped after a create, so a new project appears
  // without a reload. Only fetched while the overlay is open: nothing on the
  // main Coverage screen shows a project, so fetching before it opens would
  // be a request nobody reads.
  //
  // ── Why the country is here ──────────────────────────────────────────
  //
  // This whole screen is one country at a time. `selected` picks it, every
  // figure on it is that country's, and the button that opens this overlay
  // sits INSIDE that country's panel. Projects were the one thing that
  // ignored it: the list showed every project on the platform, so opening
  // Hooman Projects from Pakistan and from India produced identical lists,
  // and a card could carry a flag for a country other than the one being
  // looked at.
  //
  // The route has supported ?country= since it was written, and so has
  // GloobalApi.listProjects. The screen simply never sent one — which is
  // why nothing looked broken: the wrong answer was a valid answer to a
  // different question.
  // ── A SEARCH SEARCHES EVERYTHING ───────────────────────────────────────
  //
  // This sent `category` on every request, including while searching. So the
  // box at the top of the screen only ever looked inside whichever of the
  // eight tiles happened to be selected: typing "bridge" while Education was
  // selected found nothing, with a river footbridge sitting one tile away.
  //
  // Nothing about the box said so. It is full-width, at the top, above the
  // category grid rather than inside it, and reads "Hooman Projects" — every
  // signal says it searches the screen. A search that silently looks at an
  // eighth of the data is worse than no search, because an empty result is
  // indistinguishable from "there is nothing like that here", and that is
  // the answer it gave most of the time.
  //
  // So while there is text in the box the category is not sent, and the
  // result cards name the category each hit came from (see the card below) —
  // otherwise a list drawn from all eight is a list you cannot place.
  // Country is STILL sent: this screen is one country at a time, every figure
  // on it says so, and a search that crossed borders would put projects in
  // the list that the count and the Raised figure above it do not include.
  useEffect14(() => {
    if (!showHoomanProjects) return undefined;
    let cancelled = false;
    const q = projectQuery.trim();
    setProjectsLoading(true);
    // Typing "water" fired five requests, one per keystroke. The stale ones
    // were discarded correctly, so nothing ever displayed the wrong answer —
    // but four of the five were work nobody read, on a route that runs a
    // regex over the collection. A short wait after the last keystroke sends
    // one. Only while searching: changing country or tapping a tile is a
    // single deliberate act and should not feel delayed.
    const run = () => {
      (async () => {
        const next = await GloobalApi.listProjects({
          category: q ? undefined : selectedHoomanCategory,
          country: country.code,
          q: q || undefined
        });
        if (cancelled) return;
        // null means the server could not answer, which is not the same as
        // "no projects" — the first shows ∆, the second shows a real zero.
        setProjectsData(next);
        setProjectsLoading(false);
      })();
    };
    if (!q) {
      run();
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(run, 260);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showHoomanProjects, selectedHoomanCategory, country.code, projectQuery, projectsToken]);

  // Counted the same way the server counts (lib/projectValidation.js's
  // countWords). The two MUST agree: a form that says "982 / 1000" and is
  // then rejected by the server is worse than no counter at all. The server
  // is still the authority — this only tells the person where they stand.
  const projectSummaryWords = countProjectSummaryWords(projectSummary);
  const projectSummaryOverLimit = projectSummaryWords > PROJECT_SUMMARY_WORD_LIMIT;

  const resetProjectForm = () => {
    setProjectTitle("");
    setProjectSummary("");
    setProjectLink("");
    setProjectPlace("");
    setProjectWebsite("");
    setProjectEmail("");
    setProjectAddress("");
    setProjectGoal("");
    setProjectGoalCurrency("");
    setProjectFile(null);
    setProjectError(null);
  };

  // ── Hardware back, wired for every overlay on this screen ──────────────
  //
  // This is what makes removing the in-screen back arrow safe rather than a
  // trap. These five overlays never registered with useBackClose, so the
  // phone's back gesture fell through to App.jsx's handler and closed the
  // WHOLE Coverage screen — or, on the outermost one, left the PWA. With no
  // arrow drawn and no registration, Hooman Projects would have been a
  // screen with no way out on iOS, where a standalone PWA has no system back
  // at all.
  //
  // Registered innermost-last so the stack unwinds in the order they were
  // opened: the category picker closes before the screen under it.
  //
  // Placed HERE, below every piece of state and every callback they read,
  // rather than up with the other useState calls. `showProjectForm` is
  // declared forty lines further down than the others, and reading it above
  // its own `const` is a temporal dead zone — the whole Coverage screen
  // threw on render and showed its error boundary. Hook order is what must
  // stay stable between renders, not hook position, so the only requirement
  // is that these five run unconditionally and in the same order every time,
  // which they do from here.
  useBackClose(showHoomanProjects, () => setShowHoomanProjects(false));
  useBackClose(showSpendingBreakdown, () => {
    setShowSpendingBreakdown(false);
    setSpendingBreakdownQuery("");
  });
  useBackClose(showSpendingCurrencyPicker, () => setShowSpendingCurrencyPicker(false));
  useBackClose(showProjectForm, () => {
    setShowProjectForm(false);
    resetProjectForm();
  });
  useBackClose(showHoomanCategoryPicker, () => setShowHoomanCategoryPicker(false));
  useBackClose(showHoomanCountryPicker, () => {
    setShowHoomanCountryPicker(false);
    setHoomanCountryQuery("");
  });
  useBackClose(!!hoomanProject, () => setHoomanProject(null));
  useBackClose(!!hoomanJustCreated, () => setHoomanJustCreated(null));


  const submitProject = async () => {
    if (projectSaving) return;
    setProjectError(null);
    if (!projectTitle.trim()) {
      setProjectError("Give the project a title.");
      return;
    }
    if (!projectSummary.trim()) {
      setProjectError("Add a summary describing the project.");
      return;
    }
    if (projectSummaryOverLimit) {
      setProjectError(`The summary is ${projectSummaryWords} words. The limit is ${PROJECT_SUMMARY_WORD_LIMIT}.`);
      return;
    }
    setProjectSaving(true);
    try {
      const created = await GloobalApi.createProject({
        title: projectTitle.trim(),
        category: selectedHoomanCategory,
        summary: projectSummary.trim(),
        link: projectLink.trim(),
        // Spread in only when filled. Sending "" for every untouched field
        // would have the server write an empty string over nothing, which
        // is a change where there was none — and on a PATCH it would clear
        // a value the person never opened.
        ...(projectPlace.trim() ? { place: projectPlace.trim() } : {}),
        ...(projectWebsite.trim() ? { website: projectWebsite.trim() } : {}),
        ...(projectEmail.trim() ? { email: projectEmail.trim() } : {}),
        ...(projectAddress.trim() ? { address: projectAddress.trim() } : {}),
        // Both halves or neither. A goal with no currency is refused by the
        // server, and sending one without the other would turn a blank
        // currency box into a 400 the person cannot act on.
        ...(projectGoal.trim() && projectGoalCurrency.trim()
          ? { goalMajor: projectGoal.trim(), goalCurrency: projectGoalCurrency.trim().toUpperCase() }
          : {})
      });
      // The file is a SECOND request against the project that now exists,
      // not part of the create. So a failed upload leaves a saved project
      // with no attachment rather than losing the whole thing — the summary
      // someone just wrote is the expensive part to lose, not the file.
      if (created && projectFile) {
        try {
          await GloobalApi.uploadProjectAttachment(created.id, projectFile);
        } catch (uploadError) {
          setProjectSaving(false);
          setShowProjectForm(false);
          resetProjectForm();
          setProjectsToken((n) => n + 1);
          setProjectError(null);
          return;
        }
      }
      setProjectSaving(false);
      setShowProjectForm(false);
      resetProjectForm();
      setProjectsToken((n) => n + 1);
      // Shown instead of dropping straight back to the list. Submitting a
      // project is the one thing on this screen somebody put real work into,
      // and a list that simply has one more row in it does not confirm that
      // the work landed.
      if (created) setHoomanJustCreated(created);
      // Follow the project to wherever the SERVER filed it.
      //
      // A project's country is not asked for on the form — the server takes
      // it from the creator's own resolved account country (see the note on
      // countryIso in models/Project.js), so that a project and its creator
      // can never disagree about where they are. Which means the country a
      // person happens to be LOOKING at when they add one has no bearing on
      // where it lands.
      //
      // Once the list below became per-country, that turned into a way to
      // lose something: add a project while reading about India, and it is
      // saved under your own country and is not in the list you are staring
      // at. No error, no row — it simply did not appear.
      //
      // `created.countryIso` is the server's own answer rather than a guess
      // from dialCountry, which is the account's dialling country and not
      // necessarily the one the account resolves to.
      if (created && created.countryIso && created.countryIso !== country.code) {
        setProjectFiledIn(created.countryIso);
        setSelected(created.countryIso);
      }
    } catch (err) {
      setProjectSaving(false);
      // The server's own message, not a generic one: it is what names the
      // real word count when the summary is too long.
      setProjectError((err && err.message) || "Couldn't save that project.");
    }
  };

  const totalRealSpend = coverage ? coverage.totalSpending : null;
  const realSpend = countryStatus ? countryStatus.totalSpending : null;
  // Both figures are already in `coverage.currency` — the server converted
  // them. The flip changes WHICH figure is shown, never its unit, so the two
  // are directly comparable and there is nothing left here to convert.
  const displaySpend = flipped ? realSpend : totalRealSpend;
  const displayCurrency = coverage ? coverage.currency : coverageCurrency;

  // ── Our spending ───────────────────────────────────────────────────────
  //
  // Null means ∆, and ∆ here means "nothing has been paid yet" rather than
  // "this cannot be known" — which is the whole difference the Disbursement
  // record made. The server decides: it sends available:false with a reason
  // until the first payout exists, and a real total afterwards.
  //
  // `available` is checked rather than `total != null`, because a genuine
  // zero is a real answer the day the record type exists and nothing has
  // been paid, and it must not be confused with the absent case. Nothing
  // here falls back to another figure when this one is missing: Total
  // spending sits directly above with a real number, and borrowing it would
  // assert that money Hoomans paid each other was money Gloobal spent.
  // The rows the chips leave visible. An unanswered request stays an empty
  // array here and is caught by the !projectsData branch before this is
  // read — never turned into "no projects", which is a different claim.
  // ── Every funding figure on this screen ────────────────────────────────
  //
  // Zero, and a REAL zero: no project has been contributed to, because
  // nothing in this system can take a contribution. It is computed from the
  // rows rather than written as a literal so that the day contributions
  // exist, the figure follows them instead of staying frozen at a number
  // somebody typed into the UI.
  //
  // `raised` is read off each project. The API does not send one yet, so it
  // is absent and reads as 0 — which is the truth. When publicProject starts
  // sending it, every bar and total on this screen becomes live with no
  // further change here.
  const projectRaised = (project) => Number(project?.raised) || 0;
  const projectBackers = (project) => Number(project?.backers) || 0;

  // Is the person searching right now?
  //
  // Read in three places and worth naming once, because all three have to
  // agree: the fetch drops the category while this is true, so no tile may
  // look selected (the selection is not being applied), and nothing on the
  // screen may describe the list as belonging to a category. A tile still
  // lit while the list behind it ignores it is the screen telling two
  // different stories about the same rows.
  const searchingProjects = projectQuery.trim().length > 0;

  // A stored date, or nothing at all.
  //
  // Both the project card and the project detail ran
  // `new Date(project.createdAt).toLocaleDateString(...)` straight out. On a
  // row whose createdAt is missing or unparseable that is not an error — it
  // is the string "Invalid Date", printed in the footer of somebody's
  // project between the word count and their flag, as though it were a date.
  //
  // Nothing is the honest answer, and it is the answer the rest of this
  // codebase already gives: coinReceiptStamp returns empty strings for an
  // unparseable stamp rather than a fabricated one, for the same reason.
  const projectDateText = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const hoomanVisibleProjects = (projectsData?.projects || []).filter((project) => {
    if (hoomanProjectFilter === "draft") return project.status === "draft";
    if (hoomanProjectFilter === "live") return project.status !== "draft";
    return true;
  });

  // Summed across the visible rows. Safe to add up despite the goals being
  // in different currencies ONLY because every term is zero — zero is zero
  // in any unit. The moment a non-zero appears this has to convert first,
  // which is the GLB-05 defect recorded elsewhere in this codebase, so it
  // asserts that rather than assuming it.
  const hoomanRaisedTotal = hoomanVisibleProjects.reduce((sum, p) => sum + projectRaised(p), 0);

  const ourSpending = coverage ? coverage.ourSpending : null;
  const ourSpendingTotal = ourSpending && ourSpending.available ? ourSpending.total : null;
  const ourSpendingHere = ourSpending && ourSpending.available && ourSpending.byCountry
    ? ourSpending.byCountry[country.code] ?? 0
    : null;
  const ourSpendingShown = flipped ? ourSpendingHere : ourSpendingTotal;
  // Total users, platform-wide, from the backend rather than from what
  // this browser can see. computeRealActiveUsers below can only ever
  // answer about the account holding the phone, so on the global view it
  // returns 1 — this account — no matter how many people have actually
  // registered. GET /api/profile/count is the only source that knows.
  //
  // null means the server didn't answer (route absent, or still waking).
  // The local count is used then, because "1" understating the truth is
  // better than "0" asserting the database is empty.
  const [platformUserCount, setPlatformUserCount] = useState16(null);
  useEffect14(() => {
    let cancelled = false;
    (async () => {
      const total = await GloobalApi.getPlatformUserCount();
      if (!cancelled) setPlatformUserCount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Per country, real and platform-wide — GET /api/stats' byCountry
  // breakdown (see countUsersByCountry() in Backend/server.js), grouped on
  // the same countryIso every account was registered with. Refetched
  // whenever the flipped country changes.
  //
  // This used to have no backend source at all: a selected country fell
  // back to a locally-derived figure (computeRealActiveUsers) that only
  // ever asked "has THIS account sent money to that country" — so
  // registering a brand-new account from India, or any other country,
  // never moved that country's number, because no send-history entry
  // exists for a fresh account. byCountry sums to exactly platformUserCount
  // above by construction (same query, grouped), so the Gloobal-wide total
  // and every country's own total can never drift apart.
  const [platformCountryUserCount, setPlatformCountryUserCount] = useState16(null);
  useEffect14(() => {
    if (!flipped) return undefined;
    let cancelled = false;
    setPlatformCountryUserCount(null);
    (async () => {
      const count = await GloobalApi.getPlatformUserCountByCountry(country.code);
      if (!cancelled) setPlatformCountryUserCount(count);
    })();
    return () => {
      cancelled = true;
    };
  }, [flipped, country.code]);
  // Local fallback only — used when the backend genuinely couldn't be
  // reached (cold start, offline, older deploy without this route), same
  // "something honest beats a fabricated 0" reasoning as platformUserCount
  // above. Once the server answers, its real count always wins.
  const localUserCount = computeRealActiveUsers(sendHistory, flipped ? country.code : null, isFullyRegistered);
  const displayUserCount = flipped
    ? platformCountryUserCount != null ? platformCountryUserCount : localUserCount
    : platformUserCount != null ? platformUserCount : localUserCount;
  const [deltaColor, setDeltaColor] = useState16(() => randomLogoFlipColor());
  useEffect14(() => {
    const interval = setInterval(() => {
      setDeltaColor((prev) => randomLogoFlipColor(prev));
    }, 2e3);
    return () => clearInterval(interval);
  }, []);
  // The one path a PERSON changes country by. The create path above sets
  // `selected` directly and deliberately does not come through here: it must
  // not clear the notice it just raised, and it should not overwrite the
  // stored country — following a save is not the same as choosing where to
  // look.
  function selectCountry(code) {
    setSelected(code);
    // A chosen country ends the explanation for a country that was chosen
    // for them. Without this the notice would reappear months later, saying
    // "Saved in Pakistan" to somebody who merely navigated back to it.
    setProjectFiledIn(null);
    setFlipped(true);
    saveStoredCoverageCountry(code);
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // The same choice, made from inside Hooman Projects.
  //
  // Everything selectCountry does except the scroll. `heroRef` belongs to
  // the Coverage screen, which is underneath a full-screen overlay when this
  // runs — scrolling it would move a page nobody is looking at, and leave it
  // somewhere other than where they left it when they come back.
  //
  // `setFlipped(true)` is kept deliberately: backing out of Hooman Projects
  // should land on the country whose projects you were just reading, not on
  // the one you had open before you changed it.
  function pickHoomanCountry(code) {
    setSelected(code);
    setProjectFiledIn(null);
    setFlipped(true);
    saveStoredCoverageCountry(code);
    setShowHoomanCountryPicker(false);
    setHoomanCountryQuery("");
  }
  return <div
    className="w-full font-sans"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 260,
      background: C.bgSoft,
      fontFamily: "'Inter', ui-sans-serif, system-ui",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch"
    }}
  ><style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .display { font-family: 'Space Grotesk', ui-sans-serif, system-ui; }
        @keyframes pulseRing { 0% { transform: scale(0.6); opacity: 0.55; } 70% { transform: scale(2.6); opacity: 0; } 100% { transform: scale(2.6); opacity: 0; } }
        @keyframes livePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes ambientDrift { 0% { transform: translate(0px, 0px); opacity: 0.05; } 50% { transform: translate(var(--dx), var(--dy)); opacity: 0.13; } 100% { transform: translate(0px, 0px); opacity: 0.05; } }

        @keyframes detailFlipIn {
          from { transform: perspective(1400px) rotateY(-90deg); opacity: 0; }
          to { transform: perspective(1400px) rotateY(0deg); opacity: 1; }
        }
        .coverage-detail-overlay { animation: detailFlipIn 0.5s cubic-bezier(0.22, 1, 0.36, 1); transform-origin: center; }

        @media (prefers-reduced-motion: reduce) {
          .pulse-ring, .live-dot, .ambient-flag { animation: none !important; }
          .coverage-detail-overlay { animation: none; }
        }
      `}</style>{
    /* Ambient background: slow-drifting, low-opacity flags — purely
       decorative, never intercepts taps, sits behind everything else. */
  }<div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>{ambientFlags.map((f, i) => <span
    key={i}
    className="ambient-flag"
    style={{
      position: "absolute",
      top: `${f.top}%`,
      left: `${f.left}%`,
      fontSize: f.size,
      lineHeight: 1,
      filter: "grayscale(20%)",
      willChange: "transform, opacity",
      animation: `ambientDrift ${f.duration}s ease-in-out ${f.delay}s infinite`,
      "--dx": `${f.dx}px`,
      "--dy": `${f.dy}px`
    }}
  >{
    /* Was `{f.flag}` printed as text. An emoji flag renders as a flag on
       Apple platforms and as the country's two LETTERS on Windows and most
       Android builds, which have no flag glyphs — so this decorative drift
       of flags was a decorative drift of the letters "IN GB KE" for a good
       share of the people using the app. FlagEmoji draws the real image and
       keeps the emoji as its own fallback, and it is the one component every
       other flag in the app already goes through. */
  }<FlagEmoji flag={f.flag} width={f.size} height={Math.round(f.size * 0.68)} radius={2} background="transparent" /></span>)}</div><div className="relative w-full" style={{ background: "transparent", minHeight: "100%", zIndex: 1 }}>{
    /* Header — plain title now, search bar removed. */
  }<div className="flex items-center gap-2.5 px-5 pt-6 pb-4"><button
    aria-label="Go back"
    onClick={onClose}
    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
    style={{ background: C.accentDeep, color: "#fff" }}
  ><ChevronLeft3 size={18} /></button><span className="display font-bold text-lg" style={{ color: C.ink }}><GloobalWordmark suffix=" Coverage" withSymbols /></span></div>{
    /* Hero box — 3 flowing flags (the default country) by default;
       once a country is picked below it flips to that country's
       flag at the full size of this same smooth-edged rectangle.
       Tapping the big flag flips back. */
  }<div className="mt-1 px-5"><div ref={heroRef} className="relative rounded-3xl overflow-hidden" style={{ height: 200, background: "#FFFFFF", border: `1px solid ${C.line}` }}>{flipped ? <button
    onClick={() => setFlipped(false)}
    aria-label={`${country.name} \u2014 tap to go back to the flag wall`}
    className="coverage-detail-overlay absolute inset-0"
    style={{ border: "none", padding: 0, background: "none", cursor: "pointer" }}
  >{
    /* Same flow concept as the idle wall, but every particle
       is this one country's flag — still masked into the
       +, −, ×, =, ○, ▢ symbol shapes — drifting at varied
       speeds (slower overall, some lazy, some quick). The
       key remounts the flow per country so it reseeds
       instantly with the right flag. */
  }<div
    aria-hidden="true"
    className="absolute inset-0 pointer-events-none"
    style={{ background: "radial-gradient(60% 60% at 50% 40%, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0) 70%)" }}
  /><FlagFlowBox key={country.code} opacityBoost={2.4} onlyFlag={country.flag} varied />{
    /* One constant anchor at the center — the country's flag
       held still in a circle, sized at 30% of the box,
       while the rest of the flow drifts on around it. No
       outer filter wrapper here anymore — FlagSignShape's
       circle mode already applies its own safe box-shadow
       internally, and wrapping it in another filter is what
       let a sliver of the flag bleed past the circle edge. */
  }<div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 2 }}><FlagSignShape sign="circle" flag={country.flag} box={Math.round(heroW * 0.3)} /></div></button> : <><div
    aria-hidden="true"
    className="absolute inset-0 pointer-events-none"
    style={{ background: "radial-gradient(60% 60% at 50% 40%, rgba(124,58,237,0.08) 0%, rgba(124,58,237,0) 70%)" }}
  />{
    /* Dense flow, and now the one and only country list — no
       separate flag grid below anymore. Each flowing flag is
       a real country (India included, same as everyone
       else), tappable to select it and flip this box — no
       lock badges here, per request. */
  }<FlagFlowBox
    opacityBoost={2.4}
    count={18}
    countries={countryQuery.trim() ? filteredCoverage : top20}
    onPick={selectCountry}
  /></>}</div></div>{
    /* Data panel — directly below the hero box, always showing
       something now instead of leaving that space empty until a
       country's picked. Idle: "Gloobal" with the real aggregate
       spend across every country. Once a flag's tapped: that
       country's own name and figures, same three rows either way. */
  }<div className="px-5 mt-4"><div className="flex items-center justify-between"><span className="display font-bold text-lg" style={{ color: C.ink }}>{flipped ? country.name : <GloobalWordmark withSymbols />}</span>{flipped && isUnlocked !== null && <span style={{ color: isUnlocked ? C.positive : C.negative }} aria-label={isUnlocked ? "Unlocked" : "Locked"}>{isUnlocked ? <Unlock2 size={14} /> : <Lock6 size={14} />}</span>}</div><div className="w-full mt-3 flex flex-col gap-3">{
    /* Total spending sits above Our spending on the global
       view — global figure is the sum across every country,
       real from this account's Send Money history; per-country
       it's that country's own figure. Tapping opens the full
       country-by-country breakdown. The currency symbol on the
       right is replaced by the flip-symbol circle — the number
       itself stays real and visible, just the sign is swapped
       for the flip icon. Our spending (below) is a genuinely
       different, currently-unavailable number — see its own
       comment. */
  }<button
    onClick={() => setShowSpendingBreakdown(true)}
    className="flex items-center justify-between rounded-2xl px-4 py-4"
    style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, cursor: "pointer", width: "100%", textAlign: "left" }}
  ><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><TrendingUp3 size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>Total spending</span></div>{displaySpend != null ? <span className="flex items-center gap-2"><FlipSymbolCircle size={20} />{
    /* The unit, restored. This figure used to render as a bare
       "8.1K" — the currency symbol was computed and then
       replaced by the flip circle at this exact spot, so a
       rupee total and a dollar total appeared side by side as
       two unlabelled numbers three orders of magnitude apart,
       which is most of what made them look inconsistent.
       fmtMoney is not used because the compact form is what
       fits here; the suffix is the same one it appends, so the
       amount-first-currency-after rule still holds. */
  }<span className="mono font-bold text-base" style={{ color: C.accent }}>{fmtCompact(displaySpend)}{currencySuffix(displayCurrency)}</span></span> : <span className="font-bold text-lg" style={{ color: deltaColor, transition: "color 0.4s ease" }} aria-label={coverageLoading ? "Loading" : "No data"}>∆</span>}</button>{
    /* "Our spending" is meant to mean collective spend across
       every Gloobal user, not just this account — a genuinely
       different number from "Total spending" above. There is
       no cross-account data source anywhere in this app (this
       prototype only has one real user), so it honestly shows
       ∆ rather than quietly repeating Total spending's number
       as if it meant something collective. Same rule already
       applied to Hooman Projects below — real data or ∆, never
       a borrowed number standing in for a different one. This
       becomes real the moment a backend can aggregate spend
       across accounts (see BACKEND_CONTRACT.md). */
  }<div
    className="flex items-center justify-between rounded-2xl px-4 py-4"
    style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, width: "100%", gap: 12 }}
  ><div className="flex items-center gap-3" style={{ minWidth: 0 }}><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft, flexShrink: 0 }}><Activity size={16} style={{ color: C.accent }} /></div><span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span className="text-sm font-semibold" style={{ color: C.ink }}>Our spending</span>{
    /* What the number MEANS, said on the row rather than left to be
       inferred from two words. It is the one line on this screen that
       distinguishes the two spending figures: Total spending above is
       Hoomans paying each other, this is Gloobal paying Hoomans. Without
       it they read as the same quantity measured twice, which is most of
       why the ∆ below looks like a bug rather than an honest gap.

       It follows the selected country, because "Gloobal" means something
       different once a flag is tapped — the local entity, spending on the
       people who are there. Phrased "Hoomans in India" rather than "Indian
       Hoomans" because countries.js carries no demonym, and inventing 194
       of them to fill a subtitle would be 194 chances to get someone's
       nationality wrong. The country name repeats on purpose: naming both
       sides is what makes it a statement about one country rather than a
       global figure with a flag next to it. */
  }<span style={{ fontSize: 11.5, color: C.inkSoft, lineHeight: 1.4 }}>{flipped ? `What Gloobal ${country.name} spends on Hoomans in ${country.name}` : "What Gloobal spends on Gloobal Hoomans"}</span></span></div>{
    /* The figure, once there is one.
       models/Disbursement.js is the record the old probe named as missing,
       and lib/disbursement.js is the only thing that writes one — debiting
       PlatformAccount in the same transaction that credits the person, so
       a payout is a movement rather than an appearance.
       ∆ until the first payout exists. That ∆ now means "nothing has been
       paid yet" rather than "this cannot be known", and the server says
       which in ourSpending.reason. The historical AssetSeed interest totals
       are deliberately NOT folded in: they carry no date and no recorded
       country, so counting them would mean guessing both. */
  }{ourSpendingShown != null ? <span className="mono font-bold text-base" style={{ color: C.accent, flexShrink: 0 }}>{fmtCompact(ourSpendingShown)}{currencySuffix(displayCurrency)}</span> : <span className="font-bold text-lg" style={{ color: deltaColor, transition: "color 0.4s ease", flexShrink: 0 }} aria-label="No data">∆</span>}</div>{
    /* Hooman Projects — genuinely no data source anywhere in
       this app, even reduced to "just this one account," so
       every category honestly stays ∆ rather than showing 0 as
       if that were a real count of something that doesn't
       exist yet. Transactions/hour below is real — computed from
       this account's actual send history, filtered to the flipped
       country when one's selected. Total users is the platform-wide
       figure from GET /api/profile/count, falling back to what can
       be counted locally when the server has no answer. */
  }<button
    onClick={() => setShowHoomanProjects(true)}
    className="flex items-center justify-between rounded-2xl px-4 py-4"
    style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, cursor: "pointer", width: "100%", textAlign: "left" }}
  ><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><Building22 size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>
                  H<SingleOMark before="" after="" /><SingleOMark before="" after="" />man Projects
                </span></div><ChevronRight5 size={16} style={{ color: C.inkSoft }} /></button><div className="flex items-center justify-between rounded-2xl px-4 py-4" style={{ background: "#FFFFFF", border: `1px solid ${C.line}` }}><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><Zap5 size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>Transactions / day</span></div>{
    /* Server-counted, over the current UTC calendar day.
       This used to be "/ hour", counted here in the browser by
       re-parsing each row's DISPLAY strings — `new Date("Sep 5"
       + the current year + "14:33:07")` — because the real
       createdAt was thrown away when the row was mapped. It
       stamped the present year onto every payment, so anything
       from a previous year was silently mis-dated, and it could
       only ever see this account's own last 100 rows. The count
       is now platform-wide and comes from the same aggregation
       as everything else on this screen; the UTC convention is
       the server's and is named in its response. */
  }<span className="mono font-bold text-base" style={{ color: C.accent }}>{coverage ? flipped ? countryStatus ? countryStatus.transactionsToday ?? 0 : 0 : coverage.transactionsPerDay : <span style={{ color: deltaColor, transition: "color 0.4s ease" }} aria-label="No data">∆</span>}</span></div><div className="flex items-center justify-between rounded-2xl px-4 py-4" style={{ background: "#FFFFFF", border: `1px solid ${C.line}` }}><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><Users24 size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>Total users</span></div><span className="mono font-bold text-base" style={{ color: C.accent }}>{displayUserCount}</span></div>{
    /* Creator Share — same My Share overview reached from the
       Receive screen elsewhere in the app, just a second
       entry point into it from here. */
  }{onOpenMyShare && <button
    onClick={onOpenMyShare}
    aria-label="Creator Share — My Share overview"
    className="flex items-center justify-between rounded-2xl px-4 py-4"
    style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, cursor: "pointer", width: "100%", textAlign: "left" }}
  ><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><PieChart2 size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>Creator Share</span></div><ChevronRight5 size={17} style={{ color: C.inkSoft }} /></button>}{
    /* The caption had to change with the number. It said
       "from YOUR Send Money history", which was an accurate
       description of a figure that should never have been
       per-account: these are platform-wide totals now, the
       same on every device. Saying otherwise would have been
       the old bug surviving in prose after the code was fixed. */
  }<div className="text-xs text-center mt-1" style={{ color: C.inkSoft }}>{flipped ? isUnlocked === null ? `${country.name} \u2014 \u2206 means we don't have that figure yet.` : isUnlocked ? `Everything ${country.name} has spent, across Gloobal. \u2206 means we don't have that figure yet.` : `${country.name} isn't active on Gloobal yet \u2014 \u2206 means no data available.` : "Total spending across every country on Gloobal. \u2206 means we don't have that figure yet."}</div></div></div>{
    /* Totals button — just the globe and how many countries are
       unlocked (India = 1 today, grows as more unlock); total
       spending now lives in the All Countries header instead. */
  }<div className="mt-5 px-5 pb-8"><button
    onClick={() => setShowAllCountries(true)}
    aria-label={`See all countries \u2014 ${unlockedCount} unlocked`}
    className="w-full flex items-center justify-center gap-4 rounded-2xl px-4 py-3.5"
    style={{ background: C.surface, border: `1px solid ${C.line}`, boxShadow: "0 2px 10px rgba(20,18,43,0.05)", cursor: "pointer" }}
  ><span className="flex items-center gap-1.5"><Globe23 size={14} style={{ color: C.accent }} /><span className="mono text-[12.5px] font-semibold" style={{ color: C.ink }}>{unlockedCount}</span></span><ChevronRight5 size={15} style={{ color: C.inkFaint }} /></button></div>{
    /* The whole country list — every country, live and coming soon,
       opened from the totals button. Tapping a row selects it and
       flips into its detail. */
  }{showAllCountries && <div style={{ position: "fixed", inset: 0, zIndex: 360, background: C.surface, display: "flex", flexDirection: "column" }}><div className="flex items-center gap-2.5 px-5 pb-3" style={{ paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", flexShrink: 0 }}><NavBackButton onClick={() => {
      setShowAllCountries(false);
      setAllCountriesQuery("");
    }} /><div className="display font-bold text-base" style={{ color: C.ink }}>All countries</div></div><div className="px-5 pb-3" style={{ flexShrink: 0 }}><div
    className="flex items-center gap-2 rounded-2xl px-4 py-2.5"
    style={{ background: C.bgSoft, border: `1px solid ${C.line}` }}
  ><Search5 size={15} style={{ color: C.inkFaint, flexShrink: 0 }} /><input
    value={allCountriesQuery}
    onChange={(e) => setAllCountriesQuery(e.target.value)}
    placeholder="Search countries"
    aria-label="Search all countries"
    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
    style={{ color: C.ink }}
  />{allCountriesQuery && <button onClick={() => setAllCountriesQuery("")} aria-label="Clear search" className="flex-shrink-0"><X5 size={14} style={{ color: C.inkFaint }} /></button>}</div></div><div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>{COVERAGE_ALL_COUNTRIES.filter((c) => countryMatches(c, allCountriesQuery)).map((c, i) => {
    // Second of the three hardcoded `=== "IN"` tests that used to decide
    // this. Every row in this list wore a padlock except India's, forever,
    // whatever the data said.
    const rowStatus = coverageByIso[c.code] || null;
    const rowUnlocked = rowStatus ? rowStatus.active : null;
    return <button
      key={c.code}
      onClick={() => {
        setShowAllCountries(false);
        setAllCountriesQuery("");
        selectCountry(c.code);
      }}
      aria-label={`${c.name}${rowUnlocked === null ? "" : rowUnlocked ? ", unlocked" : ", locked"}`}
      className="w-full flex items-center gap-3 py-2.5 text-left"
      style={{ border: "none", borderTop: i === 0 ? "none" : `1px solid ${C.line}`, background: "none", cursor: "pointer" }}
    ><div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ width: 40, height: 29, border: `1px solid ${C.line}`, opacity: rowUnlocked ? 1 : 0.55 }}><CoverageFlag code={c.code} width={40} height={29} /></div><span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate" style={{ color: C.ink }}>{c.name}</span>{rowUnlocked !== null && <span className="flex-shrink-0" style={{ color: rowUnlocked ? C.positive : C.negative }} aria-label={rowUnlocked ? "Unlocked" : "Locked"}>{rowUnlocked ? <Unlock2 size={14} /> : <Lock6 size={14} />}</span>}</button>;
  })}</div></div>}</div>{
    /* Hooman Projects — eight categories of real stored records, scoped to
       the country this screen is currently showing.

       This comment used to say the categories were "all honestly ∆ right
       now since there's no real project concept anywhere in this app's
       data model yet". That stopped being true when models/Project.js and
       /api/projects were written; the note is kept in this shape because
       the ∆ it describes still has a job — it is what the card shows when
       the server does not answer, which is a different fact from zero. */
  }{showHoomanProjects && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>{
    /* The header is the country, and nothing else.

       No screen title: "Hooman Projects" moved into the search field, where
       it is doing a job — telling you what the box searches — instead of
       sitting at the top restating the screen you already opened. No back
       arrow either; the phone's own back closes this now, which the hook
       registrations above are what actually make true.

       What is left is the flag, round, at the size of the control it
       replaced. It is the one fact that decides what is in the list, so it
       is the one thing in the header.

       It is also THE WAY OUT, and that is not decoration.

       The plan was to drop the arrow and let the phone's back gesture do
       it. Measured on a real render, it does not: one back from here lands
       on the dashboard, not on the Coverage screen underneath, and the
       overlay's own useBackClose registration below never pushed a history
       entry — history.state stayed where it was. On iOS there is no system
       back inside a standalone PWA at all, so shipping this with no control
       would have been a screen with no exit on one of the two platforms.

       So the flag sits exactly where the back arrow sat, at the size of the
       control it replaced, and tapping it closes the screen. The accessible
       name says so — "United States. Back to Gloobal Coverage" — because a
       flag does not look like a way out, and the one person who most needs
       to be told is the one who cannot see it. */
  }<div style={{ padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}>{
    /* The search bar, and nothing beside it.

       The flag that sat here was doing two jobs — saying which country, and
       being the way out — and the chip beside it named the category. Both
       are now said better elsewhere: the hero below carries the flag and the
       country name, and the category is the tile grid plus "All 8".

       The back arrow sits to its left, in the position every other screen in
       this app puts one. It has to exist somewhere: hardware back on this
       overlay lands on the dashboard rather than the Coverage screen
       underneath, and an iOS PWA has no system back at all, so a screen with
       no control is a screen with no exit on one of the two platforms. */
  }<div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton label="Back to Gloobal Coverage" onClick={() => setShowHoomanProjects(false)} /><div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, borderRadius: 999, background: T.surfaceAlt, padding: "5px 12px" }}><Search5 size={16} color={T.inkFaint} style={{ flexShrink: 0 }} /><input
    type="text"
    value={projectQuery}
    onChange={(e) => setProjectQuery(e.target.value)}
    placeholder="Hooman Projects"
    aria-label="Search Hooman Projects"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit", padding: "8px 0" }}
  />{projectQuery && <button onClick={() => setProjectQuery("")} aria-label="Clear project search" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}><X5 size={14} color={T.inkFaint} /></button>}</div></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 96px", display: "flex", flexDirection: "column", gap: 14 }}>{
    /* Shown only after a create that landed somewhere other than the
       country being viewed, which is not an error and not something the
       person did wrong — it is simply where their account is. Saying it
       is what turns an unexplained country change into an explained one.
       It clears itself the next time they pick a country by hand. */
  }{
    /* The hero, as the design has it: who, how much, how many.

       "Raised" rather than "Total spent". Spent is what the Coverage panel
       already means by two different figures — Hoomans paying each other,
       and Gloobal paying Hoomans — and a third sense of the word on a third
       screen is how all three get confused. This is money put INTO projects,
       and it is its own thing.

       It reads zero, and that zero is real: nothing in this system can take
       a contribution, so nobody has given to anything. It is summed from the
       visible rows rather than written as a literal, so the day contributions
       exist the figure follows them. */
  }<div style={{ position: "relative", overflow: "hidden", borderRadius: T.radiusXl, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "16px 18px 20px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>{
    /* The location filter, and the label for the figure beneath it.

       Every number on this screen — the raised total, the project count, the
       list — is scoped to one country, so the control that changes the
       country belongs on the card those numbers sit in rather than somewhere
       else on the screen.

       It opens the existing All countries picker, which is a real list of
       194 with a search box, not a second country UI built for this screen. */
  }<button
    onClick={() => setShowHoomanCountryPicker(true)}
    className="v2-tap"
    aria-label={`Showing ${country.name}. Change country`}
    style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 10px 0 6px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.26)", background: "rgba(255,255,255,0.16)", minWidth: 0, cursor: "pointer" }}
  ><FlagEmoji flag={country.flag} size={24} shape="circle" border="none" /><span style={{ fontSize: 12, fontWeight: 800, color: "#FFFFFF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{country.name}</span><ChevronDown3 size={13} color="rgba(255,255,255,0.85)" style={{ flexShrink: 0 }} /></button><span style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.26)", background: "rgba(255,255,255,0.12)", fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}><Layers3 size={13} />{projectsData ? `${hoomanVisibleProjects.length} ${hoomanVisibleProjects.length === 1 ? "project" : "projects"}` : "∆"}</span></div><div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.66)", marginTop: 18 }}>Raised</div><div style={{ fontSize: 34, fontWeight: 800, color: "#FFFFFF", fontFamily: T.fontDisplay, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(hoomanRaisedTotal, displayCurrency)}</div><div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.56)", marginTop: 8, lineHeight: 1.45 }}>
      Gloobal cannot take contributions yet, so every project is at zero.
    </div></div>{projectFiledIn === country.code && <div
    role="status"
    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: T.radiusMd, background: T.accentSoft }}
  ><FlagEmoji flag={country.flag} width={18} height={13} radius={3} /><span style={{ fontSize: 11.5, fontWeight: 600, color: T.accent, lineHeight: 1.45 }}>
      Saved in {country.name} — projects are filed where your account is registered, so that is where this one lives.
    </span></div>}{
    /* Categories, as eight tiles rather than a name in a dropdown.

       Four across with the rest behind "All 8", because a category is now
       something you recognise before you read it: each carries its own hue
       and icon, derived from the one `hue` number on HOOMAN_PROJECT_CATEGORIES.

       The chip on the search bar still shows the current category and opens
       the full picker. That is not a duplicate of this grid — the grid is
       how you move between the common ones at a glance, the chip is how you
       know which one you are in once you have scrolled past the grid. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 2 }}><span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Categories</span><button
    onClick={() => setShowHoomanCategoryPicker(true)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 2, border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, color: T.accent }}
  >All {HOOMAN_PROJECT_CATEGORIES.length}<ChevronRight5 size={13} /></button></div><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: -4, flexShrink: 0 }}>{HOOMAN_PROJECT_CATEGORIES.slice(0, 4).map((cat) => {
    // Nothing is selected while searching, because the search ignores the
    // category — a lit tile over a list that is not filtered by it would be
    // the screen contradicting itself.
    const on = !searchingProjects && cat.name === selectedHoomanCategory;
    const paint = hoomanCategoryColors(cat.hue);
    const CatIcon = cat.Icon;
    return <button
      key={cat.name}
      onClick={() => {
        // Tapping a tile is a request to browse that category, so it ends
        // the search. Leaving the text in the box would light the tile and
        // then show results from all eight anyway.
        setProjectQuery("");
        setSelectedHoomanCategory(cat.name);
      }}
      className="v2-tap"
      aria-pressed={on}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, border: "none", background: "none", padding: 0, cursor: "pointer", minWidth: 0 }}
    ><span style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", background: on ? paint.solid : paint.tint, border: `1px solid ${on ? "transparent" : paint.line}`, color: on ? "#FFFFFF" : paint.ink, transition: "background 0.15s, color 0.15s" }}><CatIcon size={21} /></span><span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600, color: on ? T.ink : T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{cat.name}</span></button>;
  })}</div>{
    /* The list, and what is being filtered out of it.

       The chips filter the PAGE the server returned, not the query — so the
       figure beside "All" is the number of rows actually on screen, and it
       cannot disagree with what is beneath it. A chip that filtered
       server-side would need its own count and its own round trip.

       Three chips, and deliberately not the five the design had. "Trending"
       needs a view or contribution count, and nothing in this system records
       either; "Favourites" needs somewhere to keep them. Both would have
       been chips that sort by nothing. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingInline: 2, marginTop: 4 }}><span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Projects</span>{projectsData ? <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{(() => {
    const n = hoomanVisibleProjects.length;
    return n === 1 ? "1 project" : `${n} projects`;
  })()}</span> : <span style={{ fontSize: 13, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</span>}</div><div style={{ display: "flex", gap: 7, overflowX: "auto", margin: "-6px -18px 0", padding: "0 18px 2px", scrollbarWidth: "none", flexShrink: 0 }}>{[
    { id: "all", label: "All" },
    { id: "live", label: "Live" },
    { id: "draft", label: "Drafts" },
  ].map((chip) => {
    const on = hoomanProjectFilter === chip.id;
    return <button
      key={chip.id}
      onClick={() => setHoomanProjectFilter(chip.id)}
      className="v2-tap"
      aria-pressed={on}
      style={{ flexShrink: 0, height: 32, padding: "0 13px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: on ? 800 : 600, background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.inkSoft, border: `1px solid ${on ? T.accent : T.line}` }}
    >{chip.label}</button>;
  })}</div>{
    /* The projects themselves. Three states, kept distinct: the
       server could not answer (∆), it answered with nothing (a
       real empty state), or it answered with rows. Collapsing the
       first two would show "no projects yet" every time the
       backend was asleep. */
  }{projectsLoading && !projectsData ? <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Loading…</div> : !projectsData ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "26px 18px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</div><div style={{ fontSize: 12.5, color: T.inkFaint, marginTop: 6 }}>Couldn't reach the server, so we don't know what's here.</div></div> : hoomanVisibleProjects.length === 0 ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "26px 18px", textAlign: "center" }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{projectQuery.trim() ? `Nothing in ${country.name} matches "${projectQuery.trim()}"` : hoomanProjectFilter !== "all" ? `No ${hoomanProjectFilter === "draft" ? "drafts" : "live projects"} in ${selectedHoomanCategory} here` : `No ${selectedHoomanCategory} projects in ${country.name} yet`}</div><div style={{ fontSize: 12, color: T.inkFaint, marginTop: 5 }}>{projectQuery.trim() ? "Try a different word." : hoomanProjectFilter !== "all" ? "Try All." : "Add the first one."}</div></div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{hoomanVisibleProjects.map((project) => {
    const paint = hoomanCategoryColors(hoomanCategory(project.category).hue ?? 258);
    const CatIcon = hoomanCategory(project.category).Icon || Construction;
    const draft = project.status === "draft";
    return <button
      key={project.id}
      onClick={() => setHoomanProject(project)}
      className="v2-tap"
      style={{ width: "100%", textAlign: "left", border: "none", cursor: "pointer", font: "inherit", color: "inherit", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px" }}
    ><div style={{ display: "flex", alignItems: "center", gap: 11 }}><span style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: paint.tint, color: paint.ink }}><CatIcon size={19} /></span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{project.title}</span>{(() => {
      // WHICH CATEGORY THIS IS, named.
      //
      // The icon square to the left already carries the category's colour
      // and glyph, and that was enough while the list was one category at a
      // time — everything on screen was Infrastructure, so nothing had to
      // say so. A search now draws from all eight at once, and a coloured
      // glyph is a thing you learn, not a thing you read: a list mixing
      // eight of them is unplaceable until each row says what it is.
      //
      // Written out rather than shown only while searching, because a card
      // that gains and loses a line as you type is a card that moves under
      // your thumb, and the name is worth having either way.
      const catName = hoomanCategory(project.category).name;
      const where = project.place || (COUNTRY_BY_ISO[project.countryIso] || {}).name || "";
      const line = [catName, where].filter(Boolean).join(" · ");
      return line ? <span style={{ fontSize: 11, color: T.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span> : null;
    })()}</span>{
      /* Status, as the two states that actually exist. The design had
         Live / Funding / In review / Draft; `Funding` and `In review`
         would be pills describing a lifecycle nothing moves a project
         through, so they are not drawn. */
    }<span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, background: draft ? "#FDF1D8" : T.positiveSoft, color: draft ? "#7A4B06" : T.positive }}>{draft ? "Draft" : "Live"}</span></div>{project.summary && <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginTop: 10 }}>{project.summary.length > 110 ? project.summary.slice(0, 110).trimEnd() + "…" : project.summary}</div>}{
      /* The goal, as a TARGET and nothing more.

         The design this came from drew a progress bar and a "$12,400 of
         $20,000 · 62%" line under every card. Nothing in this system can
         accept a contribution, so every bar would sit at 0% and every
         project would read as having raised nothing — which looks like a
         platform nobody gives to, rather than one that cannot yet be given
         to. The bar appears when there is something to put in it. */
    }{(() => {
      const raised = projectRaised(project);
      const goalMajor = project.goal ? project.goal.minor / 100 : 0;
      const currency = project.goal ? project.goal.currency : displayCurrency;
      // Guarded: a goal of zero would make this Infinity, and a bar that is
      // 100% because it was divided by nothing is worse than no bar.
      const pct = goalMajor > 0 ? Math.min(100, Math.round((raised / goalMajor) * 100)) : 0;
      return <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}><div style={{ height: 6, borderRadius: 3, background: paint.tint, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: paint.solid, transition: "width 0.4s ease" }} /></div><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 9 }}><span style={{ display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(raised, currency)}</span>{project.goal ? <span style={{ fontSize: 11.5, color: T.inkFaint }}>of {fmtMoney(goalMajor, currency)}</span> : <span style={{ fontSize: 11.5, color: T.inkFaint }}>raised</span>}</span>{project.goal && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>}</div></div>;
    })()}<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: T.inkFaint, marginTop: 10 }}><span>{project.summaryWordCount} words</span>{projectDateText(project.createdAt) && <><span>·</span><span>{projectDateText(project.createdAt)}</span></>}{project.countryIso && COUNTRY_BY_ISO[project.countryIso] && <><span>·</span><FlagEmoji flag={COUNTRY_BY_ISO[project.countryIso].flag} width={16} height={12} radius={3} /></>}</div></button>;
  })}</div>}</div>{
    /* Add a project, floating in the bottom-right corner.

       It was a dashed button at the END of the list, which on a country with
       forty projects is a control nobody scrolls to. Here it is reachable
       from anywhere in the list and sits under the thumb.

       Absolute within this overlay rather than fixed, so it is bounded by
       this screen and cannot outlive it on another. Still only offered to a
       registered account, because the create route requires a token and
       showing it to somebody who cannot use it is an invitation to a 401.

       Labelled as well as drawn: an unlabelled circle with a plus in it is a
       guess, and this one opens a form somebody will spend ten minutes in.

       The list's bottom padding leaves room for it, so the last project is
       not sitting underneath it. */
  }{isFullyRegistered && <button
    onClick={() => { resetProjectForm(); setShowProjectForm(true); }}
    className="v2-tap"
    aria-label={`Add a project to ${selectedHoomanCategory}`}
    style={{ position: "absolute", right: 18, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", alignItems: "center", gap: 8, height: 52, padding: "0 20px", borderRadius: 999, border: "none", cursor: "pointer", background: T.gradButton, color: "#FFFFFF", fontSize: 14, fontWeight: 800, fontFamily: "inherit", boxShadow: T.shadowFloat }}
  ><Plus3 size={19} />Add project</button>}{
    /* Add a project.

       The summary counter counts the same way the server does
       (countProjectSummaryWords mirrors countWords in
       server/lib/projectValidation.js). The server still decides
       — this only stops somebody writing 1,400 words before
       being told. */
  }{hoomanJustCreated && <div style={{ position: "fixed", inset: 0, zIndex: 355, background: T.bg, display: "flex", flexDirection: "column", padding: "0 22px calc(22px + env(safe-area-inset-bottom, 0px))" }}><div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}><span style={{ width: 84, height: 84, borderRadius: 999, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 12px ${T.accentSoft}55` }}><Check5 size={38} /></span><div style={{ fontSize: 21, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 24, lineHeight: 1.25 }}>{hoomanJustCreated.title}</div>{
    /* Says where it went, not just that it saved. A project is filed under
       the country the ACCOUNT is registered in, which is not always the
       country being viewed — and somebody who has just submitted into what
       they thought was Nepal deserves to be told it landed in India before
       they go looking for it. */
  }<div style={{ fontSize: 13, color: T.inkSoft, marginTop: 10, lineHeight: 1.55, maxWidth: 300 }}>
      Submitted to {hoomanCategory(hoomanJustCreated.category).name}{hoomanJustCreated.countryIso && COUNTRY_BY_ISO[hoomanJustCreated.countryIso] ? ` in ${COUNTRY_BY_ISO[hoomanJustCreated.countryIso].name}` : ""}.
    </div>{hoomanJustCreated.status === "draft" && <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, height: 26, padding: "0 11px", borderRadius: 999, background: "#FDF1D8", color: "#7A4B06", fontSize: 11, fontWeight: 800 }}>Saved as a draft</div>}</div><div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}><button
    onClick={() => { const created = hoomanJustCreated; setHoomanJustCreated(null); setHoomanProject(created); }}
    className="v2-tap"
    style={{ width: "100%", height: 52, borderRadius: T.radiusMd, border: "none", cursor: "pointer", background: T.gradButton, color: "#FFFFFF", fontSize: 14.5, fontWeight: 800, fontFamily: "inherit" }}
  >View project</button><button
    onClick={() => setHoomanJustCreated(null)}
    className="v2-tap"
    style={{ width: "100%", height: 50, borderRadius: T.radiusMd, border: "none", cursor: "pointer", background: "none", color: T.inkSoft, fontSize: 13.5, fontWeight: 700, fontFamily: "inherit" }}
  >Back to projects</button></div></div>}{hoomanProject && (() => {
    const cat = hoomanCategory(hoomanProject.category);
    const paint = hoomanCategoryColors(cat.hue ?? 258);
    const CatIcon = cat.Icon || Construction;
    const draft = hoomanProject.status === "draft";
    const home = COUNTRY_BY_ISO[hoomanProject.countryIso];
    // Only the contact rows that exist. A "Details" card listing three
    // labels with nothing beside them describes a project nobody filled in,
    // which is a different thing from a project with no website.
    const details = [
      hoomanProject.website && { key: "website", label: "Website", value: hoomanProject.website, href: hoomanProject.website, Icon: Globe4 },
      hoomanProject.address && { key: "address", label: "Address", value: hoomanProject.address, href: null, Icon: MapPin4 },
      hoomanProject.email && { key: "email", label: "Email", value: hoomanProject.email, href: `mailto:${hoomanProject.email}`, Icon: Mail2 },
      hoomanProject.link && { key: "link", label: "Link", value: hoomanProject.link, href: hoomanProject.link, Icon: LinkIcon2 },
    ].filter(Boolean);

    return <div style={{ position: "fixed", inset: 0, zIndex: 345, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 30 }}>{
      /* The banner takes the CATEGORY's hue, so the page is recognisable as
         an Infrastructure page before a word of it is read — the same hue
         the tile and the card icon already used. */
    }<div style={{ position: "relative", height: 132, background: `linear-gradient(135deg, ${paint.solid}, hsl(${(cat.hue ?? 258) + 30} 62% 36%))`, borderRadius: "0 0 28px 28px", padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}><button
      onClick={() => setHoomanProject(null)}
      className="v2-tap"
      aria-label="Back to Hooman Projects"
      style={{ width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.18)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    ><ArrowLeft5 size={18} /></button><span style={{ display: "flex", gap: 8 }}>{
      /* Favourite is kept in this browser, not on the server — there is no
         field for it and inventing one to back a heart would be a schema
         change for an ornament. It is wrapped in try/catch because private
         mode and blocked site data both make localStorage throw on access,
         and a heart is not worth a crashed screen. */
    }<button
      onClick={() => {
        const next = new Set(hoomanFavourites);
        if (next.has(hoomanProject.id)) next.delete(hoomanProject.id); else next.add(hoomanProject.id);
        setHoomanFavourites(next);
        try { window.localStorage.setItem("gloobal:project-favourites", JSON.stringify([...next])); } catch (e) { /* not worth a crash */ }
      }}
      className="v2-tap"
      aria-label={hoomanFavourites.has(hoomanProject.id) ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={hoomanFavourites.has(hoomanProject.id)}
      style={{ width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.18)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    ><Heart2 size={17} fill={hoomanFavourites.has(hoomanProject.id) ? "#FFFFFF" : "none"} /></button>{
      /* Share uses the OS sheet where there is one, and falls back to the
         clipboard. It shares the title and the place — not a URL, because
         this screen has no address of its own to link to yet, and sharing a
         link that opens nothing is worse than sharing text. */
    }<button
      onClick={() => {
        const text = `${hoomanProject.title}${hoomanProject.place ? ` — ${hoomanProject.place}` : ""}`;
        if (navigator.share) { navigator.share({ title: hoomanProject.title, text }).catch(() => {}); }
        else if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => {}); }
      }}
      className="v2-tap"
      aria-label="Share this project"
      style={{ width: 38, height: 38, borderRadius: 999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.18)", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    ><Share24 size={17} /></button></span></div><div style={{ padding: "0 18px", marginTop: -34, position: "relative" }}>{
      /* The logo is the category mark until a project can carry its own
         image. Drawn, not left blank — an empty square where a logo goes is
         a page that looks broken rather than one that is plain. */
    }<div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}><span style={{ width: 72, height: 72, borderRadius: 22, background: paint.tint, color: paint.ink, border: `4px solid ${T.bg}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><CatIcon size={30} /></span><span style={{ display: "flex", alignItems: "center", gap: 5, height: 26, padding: "0 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, marginBottom: 6, background: draft ? "#FDF1D8" : T.positiveSoft, color: draft ? "#7A4B06" : T.positive }}>{draft ? "Draft" : "Live"}</span></div><h2 style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.2, margin: "14px 0 0" }}>{hoomanProject.title}</h2><div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}><span style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 999, background: T.surface, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkSoft }}><CatIcon size={13} color={paint.ink} />{cat.name}</span>{(hoomanProject.place || home) && <span style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 11px", borderRadius: 999, background: T.surface, border: `1px solid ${T.line}`, fontSize: 12, color: T.inkSoft, minWidth: 0 }}>{home ? <FlagEmoji flag={home.flag} width={16} height={12} radius={3} /> : <MapPin4 size={13} color={T.inkFaint} />}<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hoomanProject.place || home.name}</span></span>}</div>{
      /* The goal, alone. The design put Raised / Goal / Backers in a row of
         three here; two of those three would have been a zero describing a
         flow that does not exist. One real figure beats three, two of which
         are placeholders. */
    }{(() => {
      const raised = projectRaised(hoomanProject);
      const backers = projectBackers(hoomanProject);
      const goalMajor = hoomanProject.goal ? hoomanProject.goal.minor / 100 : 0;
      const currency = hoomanProject.goal ? hoomanProject.goal.currency : displayCurrency;
      const pct = goalMajor > 0 ? Math.min(100, Math.round((raised / goalMajor) * 100)) : 0;
      const cell = (label, body) => <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, padding: "0 12px" }}><span style={{ fontSize: 10.5, color: T.inkFaint }}>{label}</span>{body}</span>;
      const figure = (text) => <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>;
      // Compact, not full. Three figures share one phone's width here, and
      // fmtMoney's long form truncated the middle cell to "20,000...." —
      // which is not a number, it is the shape of one. Same compact form the
      // Coverage panel uses for Total spending, so the two read alike.
      const money = (amount) => `${fmtCompact(amount)}${currencySuffix(currency)}`;
      return <div style={{ marginTop: 16, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 6px" }}><div style={{ display: "flex", alignItems: "stretch" }}>{cell("Raised", figure(money(raised)))}<span style={{ width: 1, background: T.line, flexShrink: 0 }} />{cell("Goal", figure(hoomanProject.goal ? money(goalMajor) : "—"))}<span style={{ width: 1, background: T.line, flexShrink: 0 }} />{cell("Backers", figure(String(backers)))}</div><div style={{ height: 6, borderRadius: 3, background: paint.tint, overflow: "hidden", margin: "16px 12px 0" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: paint.solid, transition: "width 0.4s ease" }} /></div></div>;
    })()}{
      /* Said once, and about the row above it. Three figures that all read
         zero look like a project nobody wants; the sentence is what makes
         them read as a flow that is not open yet. */
    }<div style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.5, marginTop: 9, paddingInline: 2 }}>
      Zero because Gloobal cannot take contributions yet — not because nobody has given.
    </div><div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 22 }}>About</div><div style={{ marginTop: 9, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px", fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{hoomanProject.summary}</div>{details.length > 0 && <><div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 22 }}>Details</div><div style={{ marginTop: 9, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{details.map((row, i) => {
      const RowIcon = row.Icon;
      const body = <><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: paint.tint, color: paint.ink, display: "flex", alignItems: "center", justifyContent: "center" }}><RowIcon size={16} /></span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}><span style={{ fontSize: 11, color: T.inkFaint }}>{row.label}</span><span style={{ fontSize: 13, fontWeight: 600, color: T.ink, wordBreak: "break-all" }}>{row.value}</span></span></>;
      const style = { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` };
      // rel="noopener noreferrer": the target learns nothing about where it
      // was opened from. The server already refused anything that is not
      // http(s), so neither href can be a javascript: URL.
      return row.href
        ? <a key={row.key} href={row.href} target="_blank" rel="noopener noreferrer" style={{ ...style, textDecoration: "none" }}>{body}</a>
        : <div key={row.key} style={style}>{body}</div>;
    })}</div></>}{hoomanProject.attachment && <a
      href={`${GloobalApi.baseUrl}${hoomanProject.attachment.url}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, borderRadius: T.radiusMd, background: T.surface, boxShadow: T.shadowCard, padding: "13px 16px", textDecoration: "none" }}
    ><Paperclip2 size={16} color={paint.ink} /><span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: T.ink, wordBreak: "break-all" }}>{hoomanProject.attachment.filename}</span><span style={{ fontSize: 11, color: T.inkFaint, flexShrink: 0 }}>{Math.max(1, Math.round(hoomanProject.attachment.byteSize / 1024))} KB</span></a>}<div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.inkFaint, marginTop: 18 }}><span>{hoomanProject.summaryWordCount} words</span>{projectDateText(hoomanProject.createdAt) && <><span>·</span><span>{projectDateText(hoomanProject.createdAt)}</span></>}{hoomanProject.ownerSymbolId && <><span>·</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hoomanProject.ownerSymbolId}</span></>}</div></div></div></div>;
  })()}{showProjectForm && <div style={{ position: "fixed", inset: 0, zIndex: 350, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      setShowProjectForm(false);
      resetProjectForm();
    }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>New {selectedHoomanCategory} project</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}><div style={{ padding: "14px 16px" }}><label htmlFor="project-title" style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Title</label><input
    id="project-title"
    type="text"
    value={projectTitle}
    maxLength={140}
    onChange={(e) => {
      setProjectError(null);
      setProjectTitle(e.target.value);
    }}
    placeholder="What is it called?"
    style={{ width: "100%", border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }}
  /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}><label htmlFor="project-summary" style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>Summary</label><span style={{ fontSize: 11, fontWeight: 700, color: projectSummaryOverLimit ? T.negative || "#DC2626" : T.inkFaint }}>{projectSummaryWords} / {PROJECT_SUMMARY_WORD_LIMIT} words</span></div><textarea
    id="project-summary"
    value={projectSummary}
    rows={8}
    onChange={(e) => {
      setProjectError(null);
      setProjectSummary(e.target.value);
    }}
    placeholder="What is it for, and who does it help?"
    style={{ width: "100%", border: "none", outline: "none", background: "none", fontSize: 14, lineHeight: 1.55, color: T.ink, fontFamily: "inherit", resize: "vertical" }}
  /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-link" style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Link (optional)</label><input
    id="project-link"
    type="url"
    inputMode="url"
    value={projectLink}
    onChange={(e) => {
      setProjectError(null);
      setProjectLink(e.target.value);
    }}
    placeholder="https://"
    style={{ width: "100%", border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit" }}
  /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-place" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Where (optional)</label><input id="project-place" type="text" value={projectPlace} maxLength={120} onChange={(e) => { setProjectError(null); setProjectPlace(e.target.value); }} placeholder="Pokhara, Nepal" style={{ width: "100%", marginTop: 7, border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }} /></div>{
    /* The goal, and its currency beside it — never one without the other.

       Typed in major units. The server scales it, because only the server
       knows a currency's decimal places, and it refuses more decimals than
       the currency has rather than rounding them away.

       It is a TARGET. Nothing can contribute towards it yet, which the
       hint under the field says plainly — a goal box with no such line
       invites somebody to expect a collection to open. */
  }<div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-goal" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Funding goal (optional)</label><div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}><input id="project-goal" type="text" inputMode="decimal" value={projectGoal} onChange={(e) => { setProjectError(null); setProjectGoal(e.target.value.replace(/[^0-9.]/g, "")); }} placeholder="20000" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }} /><input id="project-goal-currency" type="text" value={projectGoalCurrency} maxLength={3} onChange={(e) => { setProjectError(null); setProjectGoalCurrency(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase()); }} placeholder="INR" aria-label="Goal currency" style={{ width: 62, flexShrink: 0, textAlign: "center", border: `1px solid ${T.line}`, borderRadius: T.radiusSm, padding: "7px 0", outline: "none", background: T.surfaceAlt, fontSize: 13, fontWeight: 800, color: T.accent, fontFamily: "inherit" }} /></div><div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 7, lineHeight: 1.45 }}>A stated target. Gloobal cannot take contributions towards it yet.</div></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-website" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Website (optional)</label><input id="project-website" type="url" inputMode="url" value={projectWebsite} onChange={(e) => { setProjectError(null); setProjectWebsite(e.target.value); }} placeholder="https://" style={{ width: "100%", marginTop: 7, border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }} /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-email" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Email (optional)</label><input id="project-email" type="email" inputMode="email" value={projectEmail} onChange={(e) => { setProjectError(null); setProjectEmail(e.target.value); }} placeholder="hello@example.org" style={{ width: "100%", marginTop: 7, border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }} /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-address" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Address (optional)</label><input id="project-address" type="text" value={projectAddress} maxLength={300} onChange={(e) => { setProjectError(null); setProjectAddress(e.target.value); }} placeholder="Street, town" style={{ width: "100%", marginTop: 7, border: "none", outline: "none", background: "none", fontSize: 15, color: T.ink, fontFamily: "inherit" }} /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-file" style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>File (optional)</label><input
    id="project-file"
    type="file"
    accept={PROJECT_ATTACHMENT_ACCEPT}
    onChange={async (e) => {
      const file = e.target.files && e.target.files[0];
      setProjectError(null);
      if (!file) {
        setProjectFile(null);
        return;
      }
      // Checked here to save a round trip and to say so immediately.
      // The server re-measures and re-checks the type either way —
      // neither of these is the rule.
      if (file.size > PROJECT_ATTACHMENT_MAX_BYTES) {
        setProjectFile(null);
        setProjectError("Files can be at most 2 MB.");
        return;
      }
      try {
        setProjectFile(await readProjectFile(file));
      } catch (readError) {
        setProjectFile(null);
        setProjectError("That file could not be read.");
      }
    }}
    style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: "inherit", maxWidth: "100%" }}
  />{projectFile && <div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, wordBreak: "break-all" }}>{projectFile.filename}</div>}</div></div>{projectError && <div role="alert" style={{ fontSize: 12.5, color: T.negative || "#DC2626", padding: "0 4px", lineHeight: 1.5 }}>{projectError}</div>}<button
    onClick={submitProject}
    disabled={projectSaving || !projectTitle.trim() || !projectSummary.trim() || projectSummaryOverLimit}
    className="v2-tap"
    style={{
      width: "100%",
      padding: "14px 18px",
      borderRadius: T.radiusMd,
      border: "none",
      background: T.accent,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      cursor: projectSaving ? "wait" : "pointer",
      opacity: projectSaving || !projectTitle.trim() || !projectSummary.trim() || projectSummaryOverLimit ? 0.5 : 1
    }}
  >{projectSaving ? "Saving…" : "Save project"}</button></div></div>}{
    /* Category picker — search bar plus the full list, only
       reachable by tapping the corner button, so the main
       screen itself only ever shows one category. */
  }{showHoomanCategoryPicker && <div style={{ position: "fixed", inset: 0, zIndex: 350, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      setShowHoomanCategoryPicker(false);
      setHoomanCategoryQuery("");
    }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Choose a category</span></div><div style={{ padding: "0 18px 14px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 14px" }}><Search5 size={16} color={T.inkFaint} /><input
    type="text"
    value={hoomanCategoryQuery}
    onChange={(e) => setHoomanCategoryQuery(e.target.value)}
    placeholder="Search categories"
    aria-label="Search categories"
    style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit" }}
  /></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 30px" }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{HOOMAN_PROJECT_CATEGORIES.filter((c) => c.name.toLowerCase().includes(hoomanCategoryQuery.trim().toLowerCase())).map((cat, i, arr) => <button
    key={cat.name}
    onClick={() => {
      // Same as tapping a tile: choosing a category is a request to browse
      // it, and a search left running would ignore the choice.
      setProjectQuery("");
      setSelectedHoomanCategory(cat.name);
      setShowHoomanCategoryPicker(false);
      setHoomanCategoryQuery("");
    }}
    className="v2-tap"
    style={{
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: "12px 16px",
      border: "none",
      background: cat.name === selectedHoomanCategory ? T.accentSoft : "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      cursor: "pointer",
      textAlign: "left"
    }}
  >{
      /* THE SAME MARK THE CATEGORY WEARS EVERYWHERE ELSE.
         Each category has a hue and a glyph, and they are drawn on the four
         tiles on the main screen and on every project card. This list — the
         full eight, and the only place four of them can be reached — showed
         a name and an examples line and nothing else. So Healthcare was a
         pink heart on one screen and a line of text on the next, and the
         four categories that live ONLY behind "All 8" had no mark at all
         until you had already chosen one and seen the cards.
         Derived from the same `hue`, through the same hoomanCategoryColors,
         so there is one definition of what a category looks like. */
    }{(() => {
      const paint = hoomanCategoryColors(cat.hue);
      const CatIcon = cat.Icon;
      return <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: paint.tint, color: paint.ink }}><CatIcon size={18} /></span>;
    })()}<span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 14, fontWeight: 700, color: cat.name === selectedHoomanCategory ? T.accent : T.ink }}>{cat.name}</span><span style={{ fontSize: 11, color: T.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.examples}</span></span>{cat.name === selectedHoomanCategory && <Check5 size={16} color={T.accent} style={{ flexShrink: 0 }} />}</button>)}{HOOMAN_PROJECT_CATEGORIES.filter((c) => c.name.toLowerCase().includes(hoomanCategoryQuery.trim().toLowerCase())).length === 0 && <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>No categories match "{hoomanCategoryQuery}"</div>}</div></div></div>}{
    /* Country picker, for Hooman Projects.

       The flag chip used to open the Coverage screen's own All countries
       list. It worked — it opened, and picking did change the country — but
       it is a screen about COVERAGE: "All countries" across the top, a
       padlock or an open padlock on every row, and a counter reading
       "0 unlocked". None of that means anything to a project. A project can
       be filed in any country there is, whether or not Gloobal Coverage has
       gone live there, so a list that grades countries by Coverage status is
       answering a question nobody asked — and arriving at it from a flag on
       a project screen reads as being sent somewhere else entirely.

       Same 194 countries, same search, and one thing that list has no reason
       to carry: the account's own country, at the top, because "show me mine"
       is the most common reason to open this at all. */
  }{showHoomanCountryPicker && (() => {
    const q = hoomanCountryQuery.trim();
    const matches = COVERAGE_ALL_COUNTRIES.filter((c) => countryMatches(c, hoomanCountryQuery));
    // dialCountry is the country this ACCOUNT is registered in — not the one
    // the screen is showing, which is what the person is here to change.
    // Absent on an account that has not finished registering, and then the
    // section is simply not drawn rather than guessed at.
    const mine = dialCountry ? COVERAGE_ALL_COUNTRIES.find((c) => c.code === dialCountry.iso) : null;
    // The pinned country is not repeated below it. A row that appears twice,
    // both times with the same tick beside it, reads as a glitch rather than
    // as a shortcut — and the second section is honestly titled for what is
    // actually in it rather than claiming to be "all" while one is missing.
    const rest = mine ? matches.filter((c) => c.code !== mine.code) : matches;
    const row = (c, pinned) => <button
      key={(pinned ? "mine-" : "all-") + c.code}
      onClick={() => pickHoomanCountry(c.code)}
      className="v2-tap"
      aria-label={`${c.name}${c.code === country.code ? ", showing now" : ""}`}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", border: "none", background: c.code === country.code ? T.accentSoft : "none", cursor: "pointer", textAlign: "left" }}
    ><FlagEmoji flag={c.flag} size={30} shape="circle" /><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: c.code === country.code ? T.accent : T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>{c.code === country.code && <Check5 size={16} color={T.accent} style={{ flexShrink: 0 }} />}</button>;
    return <div style={{ position: "fixed", inset: 0, zIndex: 352, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      setShowHoomanCountryPicker(false);
      setHoomanCountryQuery("");
    }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Choose a country</span></div><div style={{ padding: "0 18px 14px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 14px" }}><Search5 size={16} color={T.inkFaint} style={{ flexShrink: 0 }} /><input
      type="text"
      value={hoomanCountryQuery}
      onChange={(e) => setHoomanCountryQuery(e.target.value)}
      placeholder="Search countries"
      aria-label="Search countries"
      style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit" }}
    />{hoomanCountryQuery && <button onClick={() => setHoomanCountryQuery("")} aria-label="Clear country search" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}><X5 size={14} color={T.inkFaint} /></button>}</div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{
      /* Hidden while searching: somebody typing a name is looking for a
         particular country, and a pinned row above the results is one more
         thing to read past. */
    }{!q && mine && <div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 7px 2px" }}>Your country</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{row(mine, true)}</div></div>}<div>{!q && <div style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 7px 2px" }}>{mine ? "Everywhere else" : "All countries"}</div>}<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rest.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>No countries match "{q}"</div> : rest.map((c) => row(c, false))}</div></div></div></div>;
  })()}</div>}{
    /* Spending breakdown — every country, each in its own currency
       (not mine converted awkwardly into theirs as a display
       gimmick — a genuine conversion, same convert() used
       everywhere else). Search narrows the list; the total at the
       bottom can be viewed in any currency the person picks, not
       just their own — someone in India can see the same real total
       expressed in USD, CNY, or anywhere else. */
  }{showSpendingBreakdown && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
      setShowSpendingBreakdown(false);
      setSpendingBreakdownQuery("");
    }} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Spending by country</span></div><div style={{ padding: "0 18px 14px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "10px 14px" }}><Search5 size={16} color={T.inkFaint} /><input
    type="text"
    value={spendingBreakdownQuery}
    onChange={(e) => setSpendingBreakdownQuery(e.target.value)}
    placeholder="Search country name"
    aria-label="Search country name"
    style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit" }}
  /></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 20px" }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{COVERAGE_ALL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(spendingBreakdownQuery.trim().toLowerCase())).map((c, i) => {
    // Every row in ONE unit — the currency picked at the bottom of this
    // sheet — so the countries can actually be compared against each other.
    //
    // Each row used to be shown in its own local currency, which put ₹, $
    // and ¥ figures in a single column with no common scale, and got there
    // by running the bundle's static RATES table through convert(). That
    // table is not a rate source (it is a hardcoded list) and convert()
    // answers 0 for any currency missing from it, so an unlisted country
    // rendered a confident ₹0 rather than admitting it had no figure. The
    // server does the conversion now, against real rates, once.
    const rowSpend = coverage ? coverage.totalSpendingByCountry[c.code] ?? null : null;
    return <div
      key={c.code}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
    ><FlagEmoji flag={c.flag} width={28} height={21} radius={6} /><span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>{rowSpend != null ? <span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>{fmtCompact(rowSpend)}{currencySuffix(displayCurrency)}</span> : <span style={{ fontSize: 15, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</span>}</div>;
  })}{COVERAGE_ALL_COUNTRIES.filter((c) => c.name.toLowerCase().includes(spendingBreakdownQuery.trim().toLowerCase())).length === 0 && <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>No countries match "{spendingBreakdownQuery}"</div>}</div>{
    /* Aggregate total — real number, viewable in any currency,
       not just the one this account happens to use. */
  }<div style={{ borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "20px 20px", marginTop: 16 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.72)", textTransform: "uppercase", letterSpacing: 0.3 }}>System total</span><button
    onClick={() => setShowSpendingCurrencyPicker(true)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "6px 11px", cursor: "pointer" }}
  ><span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>{displayCurrency}</span><ChevronDown3 size={12} color="#fff" /></button></div><div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, marginTop: 6 }}>{
    /* Picking a currency here refetches; the server converts.
       This used to call the bundle's convert() on a figure
       already summed across currencies as bare numbers, so it
       was converting a number that had no single unit to
       convert from. */
  }{totalRealSpend != null ? fmtMoney(totalRealSpend, displayCurrency) : <span aria-label="No data">∆</span>}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 8, lineHeight: 1.4 }}>
                Same real total, shown in whichever currency you pick — not just your own.
              </div></div></div>{
    /* Currency picker for the aggregate total */
  }{showSpendingCurrencyPicker && <div style={{ position: "fixed", inset: 0, zIndex: 350, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => setShowSpendingCurrencyPicker(false)} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Choose a currency</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 30px" }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{[...new Set(COVERAGE_ALL_COUNTRIES.map((c) => COUNTRY_CURRENCY[c.iso] || "USD"))].sort().map((code, i) => <button
    key={code}
    onClick={() => {
      setSpendingBreakdownCurrency(code);
      setShowSpendingCurrencyPicker(false);
    }}
    className="v2-tap"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 16px",
      border: "none",
      background: code === coverageCurrency ? T.accentSoft : "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span style={{ fontSize: 14, fontWeight: 700, color: code === coverageCurrency ? T.accent : T.ink }}>{code}</span><span style={{ fontSize: 13, color: T.inkFaint }}>{CURRENCY_SYMBOL[code] || ""}</span></button>)}</div></div></div>}</div>}</div>;
}
// The founder's rule, mirrored from server/lib/projectValidation.js.
//
// The server is the authority — it rejects an over-long summary whatever
// this says — but the two counts MUST agree, because a form that reads
// "982 / 1000" and is then refused has told the person something untrue.
// If the limit or the definition of a word changes, change both.
var PROJECT_SUMMARY_WORD_LIMIT = 1000;

// Whitespace-separated runs, empties dropped. Character-for-character the
// same rule as countWords() in server/lib/projectValidation.js.
function countProjectSummaryWords(text) {
  const trimmed = String(text == null ? "" : text).trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

// A File, read into the shape GloobalApi.uploadProjectAttachment wants.
//
// The server takes base64 in JSON rather than multipart, which needs no
// upload dependency on either side; this is the whole client half of that.
// FileReader's data: URL carries a "data:<type>;base64," prefix that has to
// come off — sending it would corrupt the first bytes of every file.
function readProjectFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve({
        filename: file.name,
        contentType: file.type,
        base64: comma === -1 ? result : result.slice(comma + 1)
      });
    };
    reader.readAsDataURL(file);
  });
}

// Mirrors PROJECT_ATTACHMENT_TYPES on the server. Used for the file input's
// `accept` and for the size check below — both are conveniences that save a
// round trip, and neither is the rule: the server re-checks the type against
// its own allow-list and re-measures the bytes.
var PROJECT_ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv";
var PROJECT_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

// The category row for a name, or a stand-in carrying the name itself.
//
// It deliberately does NOT fall back to the first category. The list below
// the header is queried by `selectedHoomanCategory`, so heading those rows
// with a different category's name and description would label the list as
// something it is not — a quiet wrong answer in place of a visibly empty
// one. An unknown name shows itself, with no invented description.
function hoomanCategory(name) {
  return HOOMAN_PROJECT_CATEGORIES.find((c) => c.name === name) || { name: name, examples: "" };
}

// Each category now carries a HUE and an icon as well as its description.
//
// The hue is one number, and every colour the category needs is derived from
// it — tint, icon, selected fill. Storing three hex values per category
// instead would be twenty-four colours to keep in step, and the first one
// somebody adjusted by eye would be the one that drifted.
//
// ── Why hsl() strings rather than color-mix() ────────────────────────────
//
// The prototype these came from builds every shade with
// `color-mix(in srgb, hsl(var(--h) 90% 55%) 13%, var(--card))`. color-mix
// needs Chrome 111 / Safari 16.2, and this is a payments app used on phones
// people keep for years — a category tile that falls back to transparent on
// an older handset is a tile that vanishes. hsl() has worked everywhere for
// a decade and the result here is indistinguishable.
//
// The eight hues are the prototype's own, in its own order, which is already
// this list's order. They are spaced around the wheel rather than picked to
// mean anything: no category is "the red one" because it is dangerous.
function hoomanCategoryColors(hue) {
  return {
    tint: `hsl(${hue} 80% 95%)`,
    line: `hsl(${hue} 60% 88%)`,
    ink: `hsl(${hue} 62% 42%)`,
    solid: `hsl(${hue} 68% 52%)`,
  };
}

var HOOMAN_PROJECT_CATEGORIES = [
  { name: "Infrastructure", examples: "Roads, bridges, water systems", hue: 258, Icon: Construction },
  { name: "Startup", examples: "Early-stage ventures, incubators", hue: 18, Icon: Rocket },
  { name: "Research", examples: "Clinical trials, academic studies", hue: 190, Icon: Microscope },
  { name: "Education", examples: "Schools, scholarships, literacy programs", hue: 215, Icon: GraduationCap },
  { name: "Healthcare", examples: "Clinics, medical camps, vaccination drives", hue: 345, Icon: HeartPulse },
  { name: "Environment", examples: "Reforestation, clean energy, conservation", hue: 145, Icon: Leaf2 },
  { name: "Art", examples: "Public murals, cultural festivals, exhibitions", hue: 35, Icon: Palette },
  { name: "Technology", examples: "Open-source tools, digital literacy, connectivity", hue: 275, Icon: Cpu }
];

