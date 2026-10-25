// src/screens/Banks/AddBankScreen.jsx
import { useState as useState13, useMemo as useMemo4 } from "react";
import {
  Search as Search2,
  Lock as Lock3,
  ChevronRight as ChevronRight3,
  Star,
  Shield as Shield2,
  ArrowLeft as ArrowLeft3,
  Landmark as Landmark4
} from "lucide-react";


// src/screens/Banks/AddBankScreen.jsx
function AddBankScreen({ onClose, country: countryProp }) {
  // The screen reads country.iso / .name / .flag in a dozen places and
  // assumed the prop was always supplied — opening it before a country
  // was resolved threw on the first read and blanked the screen.
  // Normalising once here keeps every downstream reference unchanged.
  const country = countryProp || COUNTRY_BY_ISO?.IN || ALL_COUNTRIES?.[0] || { iso: "IN", name: "India", flag: "🇮🇳" };
  const [query, setQuery] = useState13("");
  const [toast, setToast] = useState13(null);
  const countryBanks = BANKS_BY_COUNTRY[country.iso] || [];
  const gloobalBank = useMemo4(() => buildGloobalBank(country), [country]);
  const filteredCountryBanks = useMemo4(() => {
    if (!query.trim()) return countryBanks;
    const q = query.toLowerCase();
    return countryBanks.filter((b) => b.name.toLowerCase().includes(q));
  }, [query, countryBanks]);
  const searching = query.trim().length > 0;
  const onLockedTap = () => {
    setToast("Locked until live APIs connect");
    setTimeout(() => setToast(null), 2200);
  };
  return <div
    className="bg-white flex flex-col font-sans"
    style={{ position: "fixed", inset: 0, zIndex: 250 }}
  ><style>{`
        @keyframes abBankListIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .ab-bank-row { animation: abBankListIn 0.4s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .ab-bank-row { animation: none !important; } }
      `}</style>{
    /* Header — country is fixed to the person's registered country: a
       display-only flag, no name, no picker, nothing tappable. */
  }<div
    className="px-4 pb-3 flex items-center gap-2.5 border-b border-slate-100"
    style={{ paddingTop: "calc(14px + env(safe-area-inset-top, 0px))" }}
  ><button
    onClick={onClose}
    aria-label="Close"
    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all flex-shrink-0"
  ><ArrowLeft3 size={19} className="text-slate-700" /></button><div
    aria-label="Your registered country"
    className="flex items-center justify-center bg-slate-100 rounded-2xl px-3 py-2.5 flex-shrink-0"
  ><FlagEmoji flag={country.flag} width={24} height={18} radius={5} /></div><div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-violet-500/30 transition-all"><Search2 size={17} className="text-slate-400 flex-shrink-0" /><input
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    placeholder="Search bank name"
    className="bg-transparent outline-none text-[14.5px] text-slate-700 placeholder:text-slate-400 w-full"
  /></div></div><div className="flex-1 overflow-y-auto pb-6" style={{ scrollbarWidth: "none" }}>{!searching && <div className="relative pt-2 pb-8 overflow-hidden bg-gradient-to-b from-sky-50 via-sky-50/40 to-transparent"><div className="absolute -right-[190px] -top-16 z-0"><GlobeHero size={300} /></div>{
    /* ── THE HEADLINE WAS UNDER THE GLOBE ─────────────────────────────
       A 340px globe at -right-24 puts its left edge at (screen + 96 −
       340). On a 390px phone that is x=146, and the text column — px-6
       plus max-w-[210px] — runs to x=234. Eighty-eight pixels of
       "Bank globally. One ID for all." were printed over a photograph
       of the Atlantic, which is what the founder photographed.
       It was invisible in development for the usual reason: the only
       screen in this app written in Tailwind utility classes is this
       one, so it renders completely unstyled in the browser test
       harness (esbuild, no Tailwind pass) and the overlap cannot
       happen there. See tests/add-bank-layout.test.mjs.
       The fix is arithmetic rather than taste. Pushing the globe out to
       -190px leaves a CONSTANT 110px of it showing at every width —
       screen + 190 − 300 — so the crescent is the same on a 360 and on
       a 430, and the text column is sized as a fraction of the screen
       rather than a fixed 210px so it cannot grow into that strip on a
       narrow phone. */
  }{
    /* soft fade so the globe blends into the white content below, like the reference */
  }<div
    className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none"
    style={{ zIndex: 1 }}
  /><div className="relative z-10 px-6 max-w-[65%]"><div className="flex items-center gap-1.5 mb-4"><div className="w-7 h-[3px] bg-violet-600 rounded-full" /><div className="w-1.5 h-1.5 bg-violet-300 rounded-full" /></div><h1 className="text-[32px] font-extrabold text-slate-900 leading-[1.1] tracking-tight">
                Bank globally.
              </h1><h1 className="text-[32px] font-extrabold text-violet-600 leading-[1.1] tracking-tight mb-3">
                One ID for all.
              </h1><p className="text-slate-500 text-[14px] leading-relaxed">
                Link your bank account securely and create your <GloobalWordmark suffix=" ID" /> instantly.
              </p></div></div>}<div key={country.iso} className="px-5 flex flex-col gap-3">{
    /* ── GLOOBAL BANK, IN A BOX OF ITS OWN ────────────────────────────
       It used to be the first row of the same list, differing only by a
       tint — which made the one bank Gloobal actually runs look like the
       most-favoured entry in a directory of other people's banks.
       It is its own thing: a separate card, above the list and outside
       it, with the headline saying what it is rather than a star saying
       it ranks first. */
  }<div className="ab-bank-row rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-4 shadow-sm"><div className="flex items-center gap-2 mb-3"><div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0"><Star size={10} className="text-white fill-white" /></div><span className="font-bold text-slate-900 text-[13px] tracking-tight uppercase" style={{ letterSpacing: "0.06em" }}>
              Ours
            </span></div><BankRow bank={gloobalBank} index={0} accent onLockedTap={onLockedTap} /></div>{
    /* Country-specific top 5 */
  }<div className="flex items-center gap-2 mt-2 mb-0.5"><div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0"><Landmark4 size={11} className="text-slate-600" /></div><span className="font-bold text-slate-900 text-[15px] tracking-tight">{searching ? `Results for "${query}"` : `Top 5 banks in ${country.name}`}</span></div>{countryBanks.length === 0 && <p className="text-slate-400 text-[13.5px] py-1">
              No additional banks currently supported for {country.name}.
            </p>}{
    /* ── THREE TO A ROW ───────────────────────────────────────────────
       Five banks as five full-width rows filled a whole phone screen to
       say five words. As a grid they are one glance, and the room that
       buys goes to the thing underneath.

       Search results take the same grid: a result list that changed
       shape from the list it filters would read as a different screen.
       The logo carries the recognition either way — the name underneath
       it is confirmation, which is why it may wrap to two lines and clip
       rather than widening the cell. */
  }<div className="grid grid-cols-3 gap-2.5">{filteredCountryBanks.map((bank, i) => <BankTile key={bank.id} bank={bank} index={i + 1} onLockedTap={onLockedTap} />)}{!searching && <button
    onClick={onLockedTap}
    aria-label="Other bank — locked"
    className="ab-bank-row relative flex flex-col items-center gap-2 px-2 py-3.5 rounded-3xl border border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/30 active:scale-[0.99] transition-all"
    style={{ animationDelay: `${(filteredCountryBanks.length + 1) * 45}ms` }}
  ><div className="w-[46px] h-[46px] rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0"><Landmark4 size={20} className="text-slate-400" /></div><span className="text-slate-500 text-[12px] font-semibold leading-tight text-center">Other</span></button>}</div>{searching && countryBanks.length > 0 && filteredCountryBanks.length === 0 && <p className="text-slate-400 text-[13.5px] py-1">No banks found for "{query}".</p>}</div>{!searching && <div className="px-5 mt-5"><div className="w-full flex items-center gap-3 bg-gradient-to-r from-violet-50 to-violet-100 rounded-2xl px-4 py-3.5 border border-violet-100/60"><div className="relative w-9 h-9 flex-shrink-0 flex items-center justify-center"><Shield2 size={24} className="text-violet-600 fill-violet-100" /><Lock3 size={11} className="text-violet-700 absolute bottom-0 right-0" /></div><div className="flex-1"><p className="font-bold text-slate-900 text-[14px]">Your security is our priority</p><p className="text-slate-500 text-[12px] leading-snug">Bank-grade encryption &amp; secure onboarding</p></div><ChevronRight3 size={17} className="text-slate-400 flex-shrink-0" /></div></div>}</div>{toast && <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap">{toast}</div>}</div>;
}
// One bank in the grid. The row form (BankRow, below) is kept and still
// used by the Gloobal Bank card above, where there is one bank and the
// full width to say its name in.
function BankTile({ bank, index, onLockedTap }) {
  return <button
    onClick={() => onLockedTap(bank)}
    aria-label={`${bank.name} \u2014 locked`}
    className="ab-bank-row relative flex flex-col items-center gap-2 px-2 py-3.5 rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
    style={{ animationDelay: `${index * 45}ms` }}
  >{
    /* ── THE PADLOCK RIDES THE TILE, NOT THE LOGO ─────────────────────
       It was pinned to the bottom-right of the 46px avatar, which in a
       three-across grid puts it in the middle of the card, floating over
       nothing and reading as part of the bank's own mark — a red padlock
       apparently belonging to SBI rather than to Gloobal's connection to
       it.
       On the tile's own corner it is unmistakably a state of the TILE,
       which is what it means: nothing here connects to a real bank yet.
       Outside the column flow, so it cannot shift the logo or the name. */
  }<span className="absolute right-2 top-2"><ServiceLock size={14} /></span><div className="relative flex-shrink-0"><BankAvatar bank={bank} size={46} /></div><span
    className="text-slate-700 text-[12px] font-semibold leading-tight text-center w-full"
    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
    title={bank.name}
  >{bank.name}</span></button>;
}

function BankRow({ bank, index, accent, onLockedTap }) {
  return <button
    onClick={() => onLockedTap(bank)}
    aria-label={`${bank.name} \u2014 locked`}
    className={`ab-bank-row relative w-full flex items-center gap-4 px-4 py-4 rounded-3xl border text-left transition-all ${accent ? "border-violet-100 bg-gradient-to-r from-blue-50/70 to-violet-50/70 shadow-sm hover:shadow-md active:scale-[0.99]" : "border-slate-100 bg-white shadow-sm hover:shadow-md active:scale-[0.99]"}`}
    style={{ animationDelay: `${index * 45}ms` }}
  ><BankAvatar bank={bank} size={54} /><span className="flex-1 min-w-0 text-slate-800 text-[15.5px] font-semibold truncate">{bank.isGloobal ? <GloobalWordmark suffix=" Bank" /> : bank.name}</span><ServiceLock size={18} /></button>;
}

