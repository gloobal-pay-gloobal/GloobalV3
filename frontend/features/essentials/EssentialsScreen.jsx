// src/features/essentials/EssentialsScreen.jsx
import { useState as useState45 } from "react";
import { Utensils as EssUtensils, Droplet as EssDroplet, Home as EssHome, Sparkles as EssSparkles, CheckCircle2 as EssCheckCircle, Circle as EssCircle, Lock as Lock8, ChevronRight as ChevronRight6 } from "lucide-react";

var ESSENTIALS_COMPONENT_META = [
  { key: "food", label: "Food", icon: EssUtensils, color: "#F59E0B" },
  { key: "water", label: "Water", icon: EssDroplet, color: "#3B82F6" },
  { key: "shelter", label: "Shelter", icon: EssHome, color: "#7C3AED" },
  { key: "creativity", label: "Creativity", icon: EssSparkles, color: "#EC4899" }
];

// How many dots stand in for a hidden figure. Six, and always six: a count
// that tracked the real number of digits would leak the magnitude of the
// thing being hidden, which is most of what there is to leak.
var ESSENTIALS_MASK_DOTS = 6;

function EssentialsMasked({ size, light }) {
  const dot = Math.max(5, Math.round((Number(size) || 20) * 0.3));
  return <span
    // Says only that the figure is hidden, not what to do about it. The
    // instruction belongs to whichever card is currently showing, and a
    // mask that named one would be telling a screen-reader user to mark
    // something that is not offered until the account is open.
    aria-label="Amount hidden"
    role="img"
    style={{ display: "inline-flex", alignItems: "center", gap: dot * 0.75, height: Number(size) || 20 }}
  >{Array.from({ length: ESSENTIALS_MASK_DOTS }).map((_, at) => <span
    key={at}
    style={{ width: dot, height: dot, borderRadius: "50%", background: light ? "#fff" : T.inkFaint, display: "block" }}
  />)}</span>;
}

// A proportion bar. `fraction` is already clamped by the caller; this only
// draws it, and floors a non-zero share at 3% so a real-but-tiny component
// is a visible sliver rather than an empty track that reads as "nothing".
function EssentialsBar({ fraction, color, track }) {
  const safe = Number(fraction) > 0 ? Math.min(1, Number(fraction)) : 0;
  return <span
    style={{ display: "block", height: 6, borderRadius: 999, background: track || T.surfaceSunk, overflow: "hidden" }}
  ><span
    style={{ display: "block", height: "100%", borderRadius: 999, background: color, width: safe > 0 ? `${Math.max(3, safe * 100)}%` : "0%" }}
  /></span>;
}

function EssentialsScreen({ onClose, dialCountry, ccy, ccyCode = "USD", iHaveEnough, onToggleIHaveEnough, bankUnlocked, onUnlockGloobalBank, onOpenScanAndPay }) {
  // ── THIS SCREEN ANSWERED TO NOTHING ───────────────────────────────────
  //
  // Every figure on it went through raw fmtMoney, so the whole Essentials
  // baseline stayed in rupees while the rest of the app read in GEU. The
  // founder's words: "I don't want any single currency representation."
  //
  // Every figure here is the account's own money in the account's own
  // currency, so ccyCode is passed as both the figure's code and the
  // viewer's — the same as My Assets and PayLater.
  const lens = useGeuLens();
  const [howOpen, setHowOpen] = useState45(false);
  const essentialsMoney = (value) => geuLensBarParts(value, ccyCode, lens, ccyCode);
  // One renderer for all of them, so a tile and the headline cannot end up
  // drawn differently. `base` is the size the design asked for; the second
  // unit follows at 75% of it.
  const essentialsFigure = (value, base) => {
    const parts = essentialsMoney(value);
    return <>{parts.lead}{parts.trail && <span
      style={{ fontSize: geuLensTrailSize(base), fontWeight: 800 }}
    > {parts.trail}</span>}</>;
  };
  const baseline = useMemo5(() => computeEssentialsBaseline(dialCountry.iso), [dialCountry.iso]);
  const poolRemainingToday = useEssentialsPoolRemaining(baseline.dailyTotal);

  // ── WHAT "HIDDEN" IS KEYED ON, AND WHY IT IS NOT THE TOGGLE ───────────
  //
  // The card below says marking this "unlocks Gloobal Bank and reveals your
  // amounts", and the reveal follows the BANK, not the note. That is the
  // difference between the two things the button does: marking is a note to
  // yourself and is reversible, while opening Gloobal Bank is an account
  // that now exists and cannot be un-opened.
  //
  // Keying the reveal on `iHaveEnough` instead would mean un-marking the
  // note re-hid figures belonging to an account already open — a screen
  // pretending not to know something it plainly does. So: marked once,
  // bank opened, figures shown, and the note stays free to change.
  const revealed = Boolean(bankUnlocked);

  // Each component's share of the daily baseline, scaled against the
  // largest of them so the biggest reads as a full bar.
  //
  // This is a SHARE, not spending — nothing in this app tracks what was
  // spent per component, and a bar that looked like it did would be the
  // most believable wrong thing on the screen. The caption under the grid
  // says which it is, in words, rather than leaving it to be inferred.
  const componentPeak = ESSENTIALS_COMPONENT_META.reduce(
    (high, c) => Math.max(high, Number(baseline.components[c.key]) || 0),
    0
  );
  // Declared after poolRemainingToday and baseline, both of which it reads.
  const spentToday = Math.max(0, (Number(baseline.dailyTotal) || 0) - (Number(poolRemainingToday) || 0));
  const leftFraction = Number(baseline.dailyTotal) > 0
    ? Math.max(0, Math.min(1, (Number(poolRemainingToday) || 0) / Number(baseline.dailyTotal)))
    : 0;

  return <div
    style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}
  ><AppSymbolBg zIndex={-1} /><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}
  ><NavBackButton onClick={onClose} /><span
    style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  >
      My Essentials
    </span></div><div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}
  >{
    /* The hero. Locked, it shows the SHAPE of the thing — a label, a
       masked figure, a bar that is genuinely full because nothing has
       been spent — rather than an empty card. What is withheld is the
       magnitude, which is the only part that is anybody's business. */
  }<div
    style={{ borderRadius: T.radiusLg, background: T.gradButton, boxShadow: T.shadowRaised, padding: "20px 20px 18px" }}
  >{
    /* The country, in both states. A baseline is estimated for ONE
       country and the figure means nothing without knowing which — so
       the flag is not a reward for unlocking, it is the label on what is
       being withheld. The old pill said "Hidden until you mark below"
       and said it over the top of this; the dots already carry that, and
       the card at the foot of the screen says the rest. */
  }<div
    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}
  ><FlagEmoji flag={dialCountry.flag} width={22} height={16} radius={3} /><span
    style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}
  >{dialCountry.name} Essentials Baseline</span></div><div
    style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}
  >
      Left today
    </div><div
    style={{ marginTop: 5, fontSize: 30, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, whiteSpace: "nowrap", minHeight: 36, display: "flex", alignItems: "center" }}
  >{revealed ? essentialsFigure(poolRemainingToday, 30) : <EssentialsMasked size={30} light />}</div><div
    style={{ marginTop: 14 }}
  ><EssentialsBar fraction={leftFraction} color="#fff" track="rgba(255,255,255,0.28)" /></div><div
    style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 11, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.82)" }}
  ><span>{spentToday > 0
    ? <span style={{ whiteSpace: "nowrap" }}>{revealed ? <>{essentialsFigure(spentToday, 12.5)} spent</> : "Some spent today"}</span>
    : "Nothing spent yet"}</span><span style={{ whiteSpace: "nowrap" }}>{revealed
    ? <>Daily limit {essentialsFigure(baseline.dailyTotal, 12.5)}</>
    : "Daily limit hidden"}</span></div></div>{
    /* The four components */
  }<div><div
    style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}
  >
      Components
    </div><div
    style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}
  >{ESSENTIALS_COMPONENT_META.map((c) => {
    const value = Number(baseline.components[c.key]) || 0;
    const share = componentPeak > 0 ? value / componentPeak : 0;
    return <div
      key={c.key}
      style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 14px 15px" }}
    ><span
      style={{ width: 36, height: 36, borderRadius: 11, background: `${c.color}1F`, display: "flex", alignItems: "center", justifyContent: "center" }}
    ><c.icon size={17} color={c.color} /></span><div
      style={{ fontSize: 14.5, fontWeight: 700, color: T.ink, marginTop: 11 }}
    >{c.label}</div><div
      style={{ marginTop: 6, minHeight: 22, display: "flex", alignItems: "center", fontSize: 16.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, whiteSpace: "nowrap" }}
    >{revealed ? essentialsFigure(value, 16.5) : <EssentialsMasked size={16} />}</div><div
      style={{ marginTop: 9 }}
    ><EssentialsBar fraction={share} color={c.color} /></div></div>;
  })}</div><div
    style={{ fontSize: 11, color: T.inkFaint, margin: "9px 2px 0", lineHeight: 1.45 }}
  >
      Each bar is that component{"’"}s share of your daily baseline {"—"} not what you have spent on it.
    </div></div>{
    /* How the baseline is arrived at. A row rather than a footnote,
       because the caveats underneath it — placeholder data, a regional
       default where a country has no entry of its own — are the kind of
       thing somebody should be able to go and read, not squint at. */
  }<button
    onClick={() => setHowOpen(true)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", border: "none", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px", cursor: "pointer", textAlign: "left" }}
  ><span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: T.ink }}>
      How this is worked out
    </span><ChevronRight6 size={17} color={T.inkFaint} /></button>{
    /* ── TWO CARDS, NEVER BOTH ───────────────────────────────────────

       These used to be one button doing two jobs: marking the note AND
       opening Gloobal Bank. That put an irreversible act (an account
       that now exists) behind the same tap as a reversible one (a note
       to yourself), and it offered the note to somebody who had nothing
       yet for it to be about — "I have enough" is a statement about a
       baseline you cannot see.

       So the screen asks for one thing at a time. Locked, the card opens
       the account. Open, the card is the note. Which one is showing is
       the same `revealed` flag the figures above answer to, so the
       screen cannot end up offering a note while still hiding what the
       note refers to. */
  }{!revealed && <div
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 13 }}
  ><div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}><span
    style={{ width: 44, height: 44, borderRadius: 13, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><Lock8 size={19} color={T.accent} /></span><span style={{ minWidth: 0 }}><span
    style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink }}
  >
        Open <GloobalWordmark suffix=" Bank" />
      </span><span
    style={{ display: "block", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, color: T.accent, textTransform: "uppercase", marginTop: 3 }}
  >
        Reveals your amounts
      </span></span></div><div
    style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}
  >
      Your {dialCountry.name} baseline is worked out already {"—"} opening the account is what shows you the figures. It never removes eligibility or restricts future use.
    </div><button
    onClick={onUnlockGloobalBank}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      background: T.gradButton,
      color: "#fff",
      boxShadow: T.shadowRaised,
      fontSize: 15,
      fontWeight: 800,
      cursor: "pointer"
    }}
  ><Lock8 size={16} />
      Open <GloobalWordmark suffix=" Bank" />
    </button></div>}{revealed && <div
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 13 }}
  ><div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}><span
    style={{ width: 44, height: 44, borderRadius: 13, background: iHaveEnough ? T.positiveSoft : T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  >{iHaveEnough ? <EssCheckCircle size={20} color={T.positive} /> : <EssCircle size={20} color={T.inkSoft} />}</span><span
    style={{ minWidth: 0 }}
  ><span style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink }}>
        I have enough
      </span></span></div><div
    style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}
  >
      A voluntary, internal note to yourself. It does not remove eligibility, restrict future use, or change your financial rights, and it is yours to change at any time.
    </div><button
    onClick={onToggleIHaveEnough}
    aria-pressed={Boolean(iHaveEnough)}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      width: "100%",
      border: iHaveEnough ? `1px solid ${T.positive}` : "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      background: iHaveEnough ? T.positiveSoft : T.gradButton,
      color: iHaveEnough ? T.positive : "#fff",
      boxShadow: iHaveEnough ? "none" : T.shadowRaised,
      fontSize: 15,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >{iHaveEnough ? <EssCheckCircle size={17} /> : <EssCircle size={17} />}{iHaveEnough
    ? "Marked — I have enough"
    : "Mark — I have enough"}</button>{
    /* Once the bank is open, Scan & Pay is the thing somebody actually
       came here to do next. No guard of its own any more — it lives
       inside the card that only exists when the account does. */
  }<button
    onClick={onOpenScanAndPay}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", border: `1px solid ${T.line}`, borderRadius: T.radiusMd, padding: "13px 0", background: T.surfaceAlt, color: T.ink, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  ><ScannerIcon size={17} animated />
      Scan &amp; Pay
    </button></div>}</div><HelpSheet
    open={howOpen}
    onClose={() => setHowOpen(false)}
    title="How this is worked out"
    subtitle={`${dialCountry.name} · methodology ${baseline.methodologyVersion}`}
  ><div style={{ display: "flex", flexDirection: "column", gap: 13, fontSize: 13, lineHeight: 1.55, color: T.inkSoft }}><div>
      Your daily baseline is the sum of four components {"—"} food, water, shelter and creativity {"—"} estimated for {dialCountry.name}. Whatever is left of it refills tomorrow: unused amounts never carry over or accumulate.
    </div><div>
      The four bars above show how the baseline is divided between those components. They are not a record of what you spent on each, because nothing in this app tracks spending that way.
    </div>{baseline.usedFallback && <div
    style={{ borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "12px 14px", fontWeight: 700, color: T.ink }}
  >
      There is no entry for {dialCountry.name} yet, so these figures come from a regional default rather than from your own country.
    </div>}<div
    style={{ borderRadius: T.radiusMd, background: T.surfaceAlt, padding: "12px 14px", fontWeight: 700, color: T.ink }}
  >
      These are placeholder figures and have not been verified. Do not treat them as advice about what anything costs.
    </div></div></HelpSheet></div>;
}
