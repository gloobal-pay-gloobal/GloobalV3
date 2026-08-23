// src/features/essentials/EssentialsScreen.jsx
import { Utensils as EssUtensils, Droplet as EssDroplet, Home as EssHome, Sparkles as EssSparkles, CheckCircle2 as EssCheckCircle, Circle as EssCircle } from "lucide-react";
var ESSENTIALS_COMPONENT_META = [
  { key: "food", label: "Food", icon: EssUtensils, color: "#F59E0B" },
  { key: "water", label: "Water", icon: EssDroplet, color: "#3B82F6" },
  { key: "shelter", label: "Shelter", icon: EssHome, color: "#7C3AED" },
  { key: "creativity", label: "Creativity", icon: EssSparkles, color: "#EC4899" }
];
function EssentialsScreen({ onClose, dialCountry, ccy, iHaveEnough, onToggleIHaveEnough, bankUnlocked, onUnlockGloobalBank, onOpenScanAndPay }) {
  const baseline = useMemo5(() => computeEssentialsBaseline(dialCountry.iso), [dialCountry.iso]);
  const poolRemainingToday = useEssentialsPoolRemaining(baseline.dailyTotal);
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><button
    onClick={onClose}
    aria-label="Back"
    className="v2-tap"
    style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><ArrowLeft size={18} color={T.ink} /></button><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>My Essentials</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* First-time-user onboarding banner — opening Essentials while
       Gloobal Bank has never been opened doesn't bounce the person
       back out with a toast; it opens the real screen and guides them
       through it instead. Same banner slot then becomes a Scan & Pay
       shortcut once Gloobal Bank is unlocked, since that's the
       natural next step for actually using Essentials day to day —
       not a one-time onboarding message that then disappears. */
  }<div style={{ borderRadius: T.radiusLg, background: bankUnlocked ? T.accentSoft : T.surface, boxShadow: T.shadowCard, border: bankUnlocked ? "none" : `1px solid ${T.line}`, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: bankUnlocked ? T.surface : T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>{bankUnlocked ? <ScannerIcon size={19} animated /> : <Lock5 size={18} color={T.accent} />}</span><span style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{bankUnlocked ? "Ready to use Essentials" : "Unlock Gloobal Bank to get started"}</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 2, lineHeight: 1.4 }}>{bankUnlocked ? "Scan & Pay to start earning toward your baseline." : "Essentials unlocks once you've opened Gloobal Bank."}</div></span><button
    onClick={bankUnlocked ? onOpenScanAndPay : onUnlockGloobalBank}
    className="v2-tap"
    style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "10px 16px", background: T.gradButton, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
  >{bankUnlocked ? "Scan & Pay" : "Unlock"}</button></div>{
    /* Total — daily + monthly baseline, in local currency, tied to
       dialCountry so it moves with the user's registered country.
       "Daily baseline" is the limit; "left today" is the REAL,
       ledger-backed remaining pool (see useEssentialsPoolRemaining) —
       whatever's used resets automatically at the next calendar day,
       it never carries over or accumulates. */
  }<div style={{ borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "22px 20px" }}><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><FlagEmoji flag={dialCountry.flag} width={22} height={16} radius={3} /><span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.78)" }}>{dialCountry.name} Essentials Baseline</span></div><div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}><div><div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>Daily limit</div><div style={{ fontSize: 28, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, marginTop: 3 }}>{ccy}{baseline.dailyTotal.toFixed(2)}</div></div><div><div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>Left today</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34D399", fontFamily: T.fontDisplay, marginTop: 3 }}>{ccy}{poolRemainingToday.toFixed(2)}</div></div></div><div style={{ marginTop: 16, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
            Refills tomorrow — unused amounts don't carry over · Methodology {baseline.methodologyVersion} · Placeholder data, not verified
          </div>{baseline.usedFallback && <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
            No country-specific entry yet — showing a regional default
          </div>}</div>{
    /* Four components */
  }<div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
          Components
        </div><div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>{ESSENTIALS_COMPONENT_META.map((c) => <div
    key={c.key}
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 14px" }}
  ><span style={{ width: 32, height: 32, borderRadius: 10, background: `${c.color}1F`, display: "flex", alignItems: "center", justifyContent: "center" }}><c.icon size={15} color={c.color} /></span><div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginTop: 10 }}>{c.label}</div><div style={{ fontSize: 16.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 2 }}>{ccy}{baseline.components[c.key].toFixed(2)}
            </div></div>)}</div></div>{
    /* "I have enough" — voluntary, internal, reversible. Copy is
       explicit that this never touches eligibility or financial
       rights, per the feature's own ground rules. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 12 }}><div><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>I have enough</div><div style={{ fontSize: 11.5, color: T.inkFaint, marginTop: 4, lineHeight: 1.45 }}>
            A voluntary, internal note to yourself — it doesn't remove eligibility, restrict future use, or change your financial rights. Change it anytime.
          </div></div><button
    onClick={onToggleIHaveEnough}
    aria-pressed={iHaveEnough}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: `1px solid ${iHaveEnough ? T.positive : T.line}`,
      borderRadius: T.radiusMd,
      padding: "12px 0",
      background: iHaveEnough ? T.positiveSoft : T.surfaceAlt,
      color: iHaveEnough ? T.positive : T.inkSoft,
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >{iHaveEnough ? <EssCheckCircle size={16} /> : <EssCircle size={16} />}
          {iHaveEnough ? "Marked \u2014 I have enough" : "Mark \u2014 I have enough"}
        </button></div></div></div>;
}

