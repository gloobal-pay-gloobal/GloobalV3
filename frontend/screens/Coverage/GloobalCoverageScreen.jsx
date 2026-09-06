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
  function selectCountry(code) {
    setSelected(code);
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
    style={{ background: "#FFFFFF", border: `1px solid ${C.line}`, width: "100%" }}
  ><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: C.accentSoft }}><Activity size={16} style={{ color: C.accent }} /></div><span className="text-sm font-semibold" style={{ color: C.ink }}>Our spending</span></div><span className="font-bold text-lg" style={{ color: deltaColor, transition: "color 0.4s ease" }} aria-label="No data">∆</span></div>{
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
    /* Hooman Projects — 8 categories, all honestly ∆ right now since
       there's no real "project" concept anywhere in this app's data
       model yet, not even one created by this account. Scaffolding
       for when that feature actually exists. */
  }{showHoomanProjects && <div style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={() => setShowHoomanProjects(false)} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}>
              H<SingleOMark before="" after="" /><SingleOMark before="" after="" />man Projects
            </span>{
    /* Current category — top-right corner, tap to search/pick a
       different one. Only one shown at a time, not all 8. */
  }<button
    onClick={() => setShowHoomanCategoryPicker(true)}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      borderRadius: 999,
      background: T.surface,
      boxShadow: T.shadowCard,
      padding: "8px 12px",
      border: "none",
      cursor: "pointer"
    }}
  ><span style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{selectedHoomanCategory}</span><ChevronDown3 size={13} color={T.accent} /></button></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{(() => {
    const cat = HOOMAN_PROJECT_CATEGORIES.find((c) => c.name === selectedHoomanCategory);
    return <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "20px 18px" }}><div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{cat.name}</div><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>{cat.examples}</div><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.line}` }}><span style={{ fontSize: 12, color: T.inkFaint }}>Real projects in this category</span><span style={{ fontSize: 18, fontWeight: 800, color: T.inkFaint }} aria-label="No data">∆</span></div></div>;
  })()}<div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", lineHeight: 1.4 }}>
              No real projects exist in any category yet — this is the scaffolding for when that feature is actually built, not a placeholder for real numbers.
            </div></div>{
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

