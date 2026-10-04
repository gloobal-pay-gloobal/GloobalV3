// src/screens/Coverage/GloobalCoverageScreen.jsx
import { useState as useState16, useEffect as useEffect14, useRef as useRef12, useMemo as useMemo8 } from "react";
import {
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
  PieChart as PieChart2
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

  // Searches the eight CATEGORY NAMES, in the browser. Kept exactly as it
  // was, and kept separate from the project search below: one filters a
  // fixed list of names, the other queries stored records, and collapsing
  // them into one box would give a control that claimed to search projects
  // while actually filtering a hardcoded array.
  const [hoomanCategoryQuery, setHoomanCategoryQuery] = useState16("");
  // Searches stored PROJECTS, on the server.
  const [projectQuery, setProjectQuery] = useState16("");
  const [projectsData, setProjectsData] = useState16(null);
  const [projectsLoading, setProjectsLoading] = useState16(false);
  const [projectsToken, setProjectsToken] = useState16(0);
  const [showProjectForm, setShowProjectForm] = useState16(false);
  const [projectTitle, setProjectTitle] = useState16("");
  const [projectSummary, setProjectSummary] = useState16("");
  const [projectLink, setProjectLink] = useState16("");
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
  useEffect14(() => {
    if (!showHoomanProjects) return undefined;
    let cancelled = false;
    setProjectsLoading(true);
    (async () => {
      const next = await GloobalApi.listProjects({
        category: selectedHoomanCategory,
        country: country.code,
        q: projectQuery.trim() || undefined
      });
      if (cancelled) return;
      // null means the server could not answer, which is not the same as
      // "no projects" — the first shows ∆, the second shows a real zero.
      setProjectsData(next);
      setProjectsLoading(false);
    })();
    return () => {
      cancelled = true;
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
    setProjectFile(null);

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

    setProjectError(null);
  };

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
        link: projectLink.trim()
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
    /* Still ∆, and this subtitle does not change that.
       server/lib/coverageAggregation.js's ourSpendingProbe checked every
       candidate and found no record type for a platform-funded
       disbursement to a person — the seed interest bonus is the only
       money Gloobal actually pays out, and it writes no Transaction and no
       LedgerEntry, so there is no per-payout record to attribute to a
       country. The definition above is now the agreed meaning; the figure
       arrives when a disbursement record exists to count. Writing a number
       here before then would be inventing it. */
  }<span className="font-bold text-lg" style={{ color: deltaColor, transition: "color 0.4s ease", flexShrink: 0 }} aria-label="No data">∆</span></div>{
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
  }{showAllCountries && <div style={{ position: "fixed", inset: 0, zIndex: 270, background: C.surface, display: "flex", flexDirection: "column" }}><div className="flex items-center gap-2.5 px-5 pb-3" style={{ paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", flexShrink: 0 }}><NavBackButton onClick={() => {
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
  }<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}><button
    onClick={() => setShowHoomanProjects(false)}
    className="v2-tap"
    aria-label={`${country.name}. Back to Gloobal Coverage`}
    title={country.name}
    style={{ display: "flex", border: "none", background: "none", padding: 0, cursor: "pointer", borderRadius: 999 }}
  ><FlagEmoji flag={country.flag} size={40} shape="circle" /></button>{
    /* Search and category, on the SAME line as the flag.

       The flag was a row of its own with 350px of empty space beside it,
       and the search bar was the first thing in the scroll below. They are
       one row now: who, then what you are looking for. The bar is a pill
       rather than a rounded rectangle so it reads as a sibling of the round
       flag rather than a block parked next to it.

       The field says what it searches. The chip beside it changes what is
       being searched, and shows the current type rather than making you
       open it to find out. Capped at 46% so a long category name cannot
       squeeze the field down to nothing. */
  }<div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, borderRadius: 999, background: T.surfaceAlt, padding: "5px 6px 5px 12px" }}><Search5 size={16} color={T.inkFaint} style={{ flexShrink: 0 }} /><input
    type="text"
    value={projectQuery}
    onChange={(e) => setProjectQuery(e.target.value)}
    placeholder="Hooman Projects"
    aria-label="Search Hooman Projects"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: "inherit", padding: "8px 0" }}
  />{projectQuery && <button onClick={() => setProjectQuery("")} aria-label="Clear project search" style={{ border: "none", background: "none", cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}><X5 size={14} color={T.inkFaint} /></button>}<button
    onClick={() => setShowHoomanCategoryPicker(true)}
    className="v2-tap"
    aria-label={`Project type: ${selectedHoomanCategory}. Change type`}
    style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, maxWidth: "46%", border: "none", background: T.surface, boxShadow: T.shadowCard, borderRadius: 999, padding: "7px 10px 7px 12px", cursor: "pointer" }}
  ><span style={{ fontSize: 12, fontWeight: 800, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hoomanCategory(selectedHoomanCategory).name}</span><ChevronDown3 size={13} color={T.accent} style={{ flexShrink: 0 }} /></button></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>{
    /* Shown only after a create that landed somewhere other than the
       country being viewed, which is not an error and not something the
       person did wrong — it is simply where their account is. Saying it
       is what turns an unexplained country change into an explained one.
       It clears itself the next time they pick a country by hand. */
  }{projectFiledIn === country.code && <div
    role="status"
    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: T.radiusMd, background: T.accentSoft }}
  ><FlagEmoji flag={country.flag} width={18} height={13} radius={3} /><span style={{ fontSize: 11.5, fontWeight: 600, color: T.accent, lineHeight: 1.45 }}>
      Saved in {country.name} — projects are filed where your account is registered, so that is where this one lives.
    </span></div>}{
    /* The count, moved out of the card and down to the rows it describes.

       On the card it was an 18px figure beside a "Projects in <country>"
       label, two scrolls above the list, which made it a claim you had to
       take on trust. Here it sits on the list it counts.

       The country is not repeated — it is in the eyebrow at the top of the
       screen, and saying it twice was half of what made this screen feel
       cluttered. The three states the card had are kept exactly: a real
       count, including a real zero, and ∆ for "the server did not answer",
       which is a different fact from none and must never be shown as 0. */
  }<div style={{ display: "flex", alignItems: "center", gap: 6, paddingInline: 2 }}>{projectsData ? <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{(projectsData.counts[selectedHoomanCategory] ?? 0) === 1 ? "1 project" : `${projectsData.counts[selectedHoomanCategory] ?? 0} projects`}</span> : <><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>Projects</span><span style={{ fontSize: 13, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</span></>}</div>{
    /* The projects themselves. Three states, kept distinct: the
       server could not answer (∆), it answered with nothing (a
       real empty state), or it answered with rows. Collapsing the
       first two would show "no projects yet" every time the
       backend was asleep. */
  }{projectsLoading && !projectsData ? <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Loading…</div> : !projectsData ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "24px 18px", textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.5 }}>Couldn't reach the server, so we don't know what's here.</div></div> : projectsData.projects.length === 0 ? <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "24px 18px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{projectQuery.trim() ? `Nothing in ${country.name} matches "${projectQuery.trim()}"` : `No ${selectedHoomanCategory} projects in ${country.name} yet`}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.5 }}>{projectQuery.trim() ? "Try a different word." : "Add the first one."}</div></div> : <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{projectsData.projects.map((project, i) => <div
    key={project.id}
    style={{ padding: "16px 18px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
  ><div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}><span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{project.title}</span>{project.countryIso && COUNTRY_BY_ISO[project.countryIso] && <FlagEmoji flag={COUNTRY_BY_ISO[project.countryIso].flag} width={22} height={16} radius={4} />}</div><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 8, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{project.summary}</div>{
    /* rel="noreferrer" as well as noopener: the target learns
       nothing about where it was opened from. The server
       already refused anything that is not http(s), so this
       href cannot be a javascript: URL. */
  }{project.link && <a
    href={project.link}
    target="_blank"
    rel="noopener noreferrer"
    style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: "none", wordBreak: "break-all" }}
  >{project.link}</a>}{project.attachment && <a
    href={`${GloobalApi.baseUrl}${project.attachment.url}`}
    target="_blank"
    rel="noopener noreferrer"
    style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, fontWeight: 700, color: T.accent, textDecoration: "none" }}
  ><span style={{ wordBreak: "break-all" }}>{project.attachment.filename}</span><span style={{ color: T.inkFaint, fontWeight: 600, flexShrink: 0 }}>{Math.max(1, Math.round(project.attachment.byteSize / 1024))} KB</span></a>}<div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}><span>{project.summaryWordCount} words</span><span>·</span><span>{new Date(project.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>{project.status === "draft" && <><span>·</span><span style={{ fontWeight: 800, color: T.accent }}>Draft</span></>}</div></div>)}</div>}{
    /* Add a project. Only offered to a registered account,
       because the create route requires a token — showing the
       button to somebody who cannot use it would be an
       invitation to a 401. */
  }{isFullyRegistered && <button
    onClick={() => {
      resetProjectForm();
      setShowProjectForm(true);
    }}
    className="v2-tap"
    style={{ width: "100%", padding: "14px 18px", borderRadius: T.radiusMd, border: `1px dashed ${T.line}`, background: "none", color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  >Add a project to {selectedHoomanCategory}</button>}</div>{
    /* Our spending, pinned to the foot rather than scrolled to.

       It sits OUTSIDE the scrolling area — a sibling of it, not a child —
       so it is on screen whatever the list is doing. Inside the scroll it
       was the last thing after an unbounded list, which on a country with
       forty projects meant a figure nobody would ever reach. shadowRaised
       rather than shadowCard, because it is now floating above the content
       that passes under it rather than sitting in the same plane.

       The row on the Coverage panel means the whole platform's spending on
       people. This one is narrower on purpose: what Gloobal puts into
       Hooman Projects, in the country being viewed. Putting it here is
       what makes it answerable per country at all — the screen already
       knows which country it is showing, so the day a project is funded,
       the figure has a place to land and a country to land under.

       It is NOT a button, and that is deliberate rather than unfinished.
       Spending by country opens because it has 194 rows of real figures
       behind it. The equivalent here would be 194 rows of ∆, which is a
       screen that teaches people the app is broken. The breakdown ships
       with the data; the row and its meaning ship now, so the structure is
       agreed before there is anything in it.

       The ∆ is the same ∆ as everywhere else on this screen: the figure is
       unknown, which is a different fact from zero. Nothing records a
       payment from Gloobal to a Hooman — see ourSpendingProbe in
       server/lib/coverageAggregation.js, which names the missing record
       type rather than just reporting no data. */
  }<div style={{ flexShrink: 0, margin: "0 18px", marginBottom: "calc(14px + env(safe-area-inset-bottom, 0px))", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowRaised, overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px" }}><span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><span role="img" aria-label={country.name} title={country.name} style={{ display: "flex", flexShrink: 0 }}><FlagEmoji flag={country.flag} width={26} height={19} radius={5} /></span><span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Our spending</span><span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.4 }}>What Gloobal spends on H<SingleOMark before="" after="" /><SingleOMark before="" after="" />man Projects in {country.name}</span></span></span><span style={{ fontSize: 18, fontWeight: 800, color: T.inkFaint, flexShrink: 0 }} aria-label="No data">∆</span></div><div style={{ borderTop: `1px solid ${T.line}`, padding: "11px 18px", fontSize: 10.5, color: T.inkFaint, lineHeight: 1.5 }}>
      Breaks down country by country once projects are funded. Nothing records a payment from Gloobal to a H<SingleOMark before="" after="" /><SingleOMark before="" after="" />man yet.
    </div></div>{
    /* Add a project.

       The summary counter counts the same way the server does
       (countProjectSummaryWords mirrors countWords in
       server/lib/projectValidation.js). The server still decides
       — this only stops somebody writing 1,400 words before
       being told. */
  }{showProjectForm && <div style={{ position: "fixed", inset: 0, zIndex: 350, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => {
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
  /></div><div style={{ padding: "14px 16px", borderTop: `1px solid ${T.line}` }}><label htmlFor="project-file" style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>File (optional)</label><input
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
      setSelectedHoomanCategory(cat.name);
      setShowHoomanCategoryPicker(false);
      setHoomanCategoryQuery("");
    }}
    className="v2-tap"
    style={{
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 2,
      padding: "14px 16px",
      border: "none",
      background: cat.name === selectedHoomanCategory ? T.accentSoft : "none",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span style={{ fontSize: 14, fontWeight: 700, color: cat.name === selectedHoomanCategory ? T.accent : T.ink }}>{cat.name}</span><span style={{ fontSize: 11, color: T.inkFaint }}>{cat.examples}</span></button>)}{HOOMAN_PROJECT_CATEGORIES.filter((c) => c.name.toLowerCase().includes(hoomanCategoryQuery.trim().toLowerCase())).length === 0 && <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>No categories match "{hoomanCategoryQuery}"</div>}</div></div></div>}</div>}{
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

var HOOMAN_PROJECT_CATEGORIES = [
  { name: "Infrastructure", examples: "Roads, bridges, water systems" },
  { name: "Startup", examples: "Early-stage ventures, incubators" },
  { name: "Research", examples: "Clinical trials, academic studies" },
  { name: "Education", examples: "Schools, scholarships, literacy programs" },
  { name: "Healthcare", examples: "Clinics, medical camps, vaccination drives" },
  { name: "Environment", examples: "Reforestation, clean energy, conservation" },
  { name: "Art", examples: "Public murals, cultural festivals, exhibitions" },
  { name: "Technology", examples: "Open-source tools, digital literacy, connectivity" }
];

