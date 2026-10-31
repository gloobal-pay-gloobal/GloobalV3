// src/features/bank/bankOpen.jsx
//
// OPENING A GLOOBAL BANK ACCOUNT.
//
// The account number is the person's GLOOBAL ID. Nothing here mints another
// number: what the flow collects is who the person is, proof of it, who their
// nominee is, and their agreement — confirmed with their PIN.
//
// Six steps, saved on the server after each one (server/lib/bank.js), so
// "Save & exit" is real and the Accounts card can say "Continue — step 3 of 6":
//
//   0 About you  →  1 Your ID (+ Aadhaar code)  →  2 Selfie  →  3 Nominee
//   →  4 Check and agree  →  5 PIN  →  opening  →  done
//
// India uses Aadhaar + PAN with a code to the Aadhaar mobile; everywhere else
// uses a passport. The identity checks run in prototype mode until a licensed
// provider is connected — the review screen says so in words, and the server
// marks every account opened this way.
//
// The selfie is taken with the phone's camera and never leaves the phone.
// There is no face-matching model in this app, so the screen does not claim
// to match anything: it says it takes a photo, and that is what it does.
import { useState as useStateBank, useEffect as useEffectBank, useRef as useRefBank, useMemo as useMemoBank } from "react";
import {
  ArrowLeft as ArrowLeftBk, X as XBk, Check as CheckBk, ShieldCheck as ShieldBk, Landmark as LandmarkBk,
  Coins as CoinsBk, Clock3 as ClockBk, Lock as LockBk, Delete as DeleteBk, Plus as PlusBk, Pencil as PencilBk,
  ScanFace as ScanFaceBk, Users as UsersBk, FileText as FileBk, BookUser as BookUserBk, Copy as CopyBk,
  Eye as EyeBk, EyeOff as EyeOffBk, ChevronRight as ChevronRightBk, Camera as CameraBk, RotateCcw as RetakeBk,
  Plane as PlaneBk, Trash2 as TrashBk, ArrowRight as ArrowRightBk, Loader as LoaderBk
} from "lucide-react";

var BANK_STEP_NAMES = ["About you", "Your ID", "Selfie", "Nominee", "Review", "Confirm"];
var BANK_OCCUPATIONS = [["salaried", "Salaried"], ["self_employed", "Self-employed"], ["business", "Business"], ["student", "Student"], ["homemaker", "Homemaker"], ["retired", "Retired"], ["other", "Other"]];
var BANK_INCOMES = [["lt_1", "Under 1 lakh"], ["1_5", "1 – 5 lakh"], ["5_10", "5 – 10 lakh"], ["10_25", "10 – 25 lakh"], ["gt_25", "Over 25 lakh"]];
var BANK_INCOMES_INTL = [["lt_1", "Low"], ["1_5", "Lower-middle"], ["5_10", "Middle"], ["10_25", "Upper-middle"], ["gt_25", "High"]];
var BANK_RELATIONS = [["spouse", "Spouse"], ["parent", "Parent"], ["child", "Child"], ["sibling", "Sibling"], ["other", "Other"]];

// Text on an accent fill. Ink's Creator side has a near-white accent, where
// white text would vanish.
function bankOnAccent() {
  return String(T.accent).toUpperCase() === "#F5F5F5" ? "#111111" : "#FFFFFF";
}

function bankAgeOn(dob) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob || ""))) return null;
  const d = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// Same rules as problemsWith() on the server, for the About you step, so the
// person hears about a mistake before the round trip rather than after it.
function bankDetailsProblem(d) {
  if (!String(d.fullName || "").trim()) return "Enter your full name, as on your ID.";
  const age = bankAgeOn(d.dob);
  if (age === null) return "Enter your date of birth.";
  if (age < 18) return "You need to be 18 or older to open an account.";
  if (age > 120) return "That date of birth does not look right.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(d.email || ""))) return "Enter your email address.";
  if (!String(d.address?.line1 || "").trim() || !String(d.address?.city || "").trim() || !String(d.address?.postcode || "").trim()) return "Enter your home address: house and street, city and postcode.";
  if (!d.occupation) return "Choose what you do.";
  if (!d.income) return "Choose your yearly income.";
  return null;
}

// Where somebody coming back should land.
function bankResumeScreen(bank) {
  if (!bank || bank.status === "none") return "welcome";
  if (bank.status === "open") return "done";
  const s = Number(bank.step) || 0;
  if (s <= 0) return "about";
  if (s === 1) return "id";
  if (s === 2) return "selfie";
  if (s === 3) return "nominee";
  return "review";
}
function bankResumeStep(bank) {
  if (!bank || bank.status === "none") return 0;
  return Math.min(6, Number(bank.step) || 0);
}

// The GLOOBAL ID as an account number: three groups of four. On a coloured
// card every symbol is white; on paper each position wears its own colour,
// the same palette ColoredGloobalId uses.
function BankIdSymbols({ id = "", white = false, masked = false, size = 16 }) {
  const ch = String(id || "").replace(/\s/g, "").split("");
  const groups = [ch.slice(0, 4), ch.slice(4, 8), ch.slice(8, 12)];
  return <span aria-label={masked ? "GLOOBAL ID, partly hidden" : `GLOOBAL ID ${ch.join(" ")}`} style={{ display: "inline-flex", gap: Math.round(size * 0.55), fontWeight: 800, fontSize: size, lineHeight: 1, whiteSpace: "nowrap" }}>{groups.map((g, gi) => <span key={gi} style={{ display: "inline-flex", gap: Math.round(size * 0.2) }}>{g.map((c, j) => {
    const i = gi * 4 + j;
    const hide = masked && i < 8;
    return <span key={j} style={{ width: size * 0.82, textAlign: "center", color: white ? "#fff" : hide ? T.inkFaint : POSITION_COLORS[i % POSITION_COLORS.length] }}>{hide ? "•" : c}</span>;
  })}</span>)}</span>;
}

// The card that stands for the account, used on the welcome and done screens.
function BankCardFace({ id, name, status, masked = false, width = 270, tilt = 0 }) {
  return <div style={{ width, maxWidth: "100%", aspectRatio: "1.6", borderRadius: 20, background: T.gradWallet, color: "#fff", position: "relative", overflow: "hidden", boxShadow: "0 18px 40px rgba(0,0,0,.28)", transform: tilt ? `rotate(${tilt}deg)` : "none", padding: "16px 18px", boxSizing: "border-box", display: "flex", flexDirection: "column", flexShrink: 0 }}>
    <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: T.cardTexture }} />
    <span aria-hidden="true" style={{ position: "absolute", right: -40, bottom: -60, width: 180, height: 180, borderRadius: "50%", border: "18px solid rgba(255,255,255,.07)" }} />
    <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, fontWeight: 800 }}><span><GloobalWordmark suffix=" Bank" /></span>{status && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, padding: "4px 8px", borderRadius: 99, background: "rgba(255,255,255,.2)" }}>{status}</span>}</div>
    <span aria-hidden="true" style={{ position: "relative", width: 34, height: 25, borderRadius: 6, background: "linear-gradient(135deg,#F7E3A3,#C9A24A)", marginTop: 14 }} />
    <span style={{ flex: 1 }} />
    <div style={{ position: "relative" }}><BankIdSymbols id={id} white masked={masked} size={15} /></div>
    <div style={{ position: "relative", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, opacity: 0.82, marginTop: 5, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
  </div>;
}

function BankLabel({ children, htmlFor }) {
  return <label htmlFor={htmlFor} style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint, margin: "0 2px 5px" }}>{children}</label>;
}
function BankField({ id, label, value, onChange, type = "text", inputMode, placeholder, maxLength, autoComplete, error, locked, right, upper, mono, secure }) {
  return <div>
    <BankLabel htmlFor={id}>{label}</BankLabel>
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 46, borderRadius: 13, padding: "0 12px", background: locked ? T.surfaceAlt : T.surface, boxShadow: error ? `0 0 0 2px ${T.negative}` : `inset 0 0 0 1px ${T.line}`, boxSizing: "border-box" }}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange && onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        readOnly={locked}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: T.ink, fontSize: 15, fontWeight: 700, fontFamily: "inherit", letterSpacing: mono ? 1.4 : 0, padding: "12px 0", colorScheme: T.dark ? "dark" : "light", WebkitTextSecurity: secure ? "disc" : "none" }}
      />
      {right}
    </div>
    {error && <div role="alert" style={{ fontSize: 11.5, fontWeight: 700, color: T.negative, margin: "5px 2px 0" }}>{error}</div>}
  </div>;
}
function BankChip({ on, children, onClick }) {
  return <button type="button" onClick={onClick} aria-pressed={on} className="v2-tap" style={{ padding: "9px 12px", borderRadius: 99, fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", background: on ? T.accent : T.surface, color: on ? bankOnAccent() : T.inkSoft, boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`, display: "inline-flex", alignItems: "center", gap: 5 }}>{on && <CheckBk size={12} strokeWidth={3} />}{children}</button>;
}
function BankCta({ children, onClick, disabled, busy, ghost, arrow = true, testId }) {
  return <button
    type="button"
    onClick={disabled || busy ? undefined : onClick}
    disabled={disabled || busy}
    data-testid={testId}
    className="v2-tap"
    style={{ width: "100%", height: 50, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: disabled || busy ? "default" : "pointer", flexShrink: 0,
      border: ghost ? `1.5px solid ${T.line}` : "none",
      background: ghost ? "transparent" : disabled ? T.gradButtonDisabled : T.gradButton,
      color: ghost ? T.accent : disabled ? T.inkFaint : "#fff",
      boxShadow: ghost || disabled ? "none" : `0 10px 24px rgba(${T.accentRgb},.28)` }}
  >{busy ? <LoaderBk size={18} style={{ animation: "bankSpin 1s linear infinite" }} /> : <>{children}{arrow && !ghost && !disabled && <ArrowRightBk size={17} strokeWidth={2.6} />}</>}</button>;
}
function BankIconBox({ children, solid, size = 40 }) {
  return <span style={{ width: size, height: size, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: solid ? T.gradButton : T.accentSoft, color: solid ? "#fff" : T.accent }}>{children}</span>;
}
function BankH1({ children, sub }) {
  return <div style={{ margin: "14px 0 16px" }}><div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.fontDisplay, lineHeight: 1.2, color: T.ink, textWrap: "balance" }}>{children}</div>{sub && <div style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>{sub}</div>}</div>;
}
function BankError({ children }) {
  if (!children) return null;
  return <div role="alert" style={{ borderRadius: 13, padding: "10px 12px", background: T.negativeSoft, color: T.negative, fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>{children}</div>;
}

// Plain digits, no letters under them — the same pad the mobile number uses.
function BankKeypad({ onDigit, onDelete }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, flexShrink: 0 }}>{keys.map((k, i) => k === "" ? <span key={i} /> : <button
    key={i}
    type="button"
    aria-label={k === "del" ? "Delete" : k}
    onClick={() => (k === "del" ? onDelete() : onDigit(k))}
    className="v2-tap"
    style={{ height: 52, borderRadius: 14, border: "none", cursor: "pointer", fontFamily: T.fontDisplay, fontSize: 22, fontWeight: 700, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", background: k === "del" ? "transparent" : T.surface, boxShadow: k === "del" ? "none" : T.shadowCard }}
  >{k === "del" ? <DeleteBk size={22} color={T.inkSoft} /> : k}</button>)}</div>;
}
// A physical keyboard types into the same pads on a laptop.
function useBankDigitKeys(active, onDigit, onDelete) {
  useEffectBank(() => {
    if (!active) return undefined;
    const h = (e) => {
      if (/^\d$/.test(e.key)) onDigit(e.key);
      else if (e.key === "Backspace") onDelete();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onDigit, onDelete]);
}

// ── THE FLOW ────────────────────────────────────────────────────────────
function BankOpenFlow({ symbolId, myName = "", mobileNumber = "", dialCountry, initialBank, after = "bank", onClose, onOpened, onFinish, onToast }) {
  const [bank, setBank] = useStateBank(initialBank || null);
  // Which ways to prove identity apply comes from the SERVER, for the
  // account's registered country (lib/kycCountries.js) — not from the
  // phone's dial code. A UAE account never sees Aadhaar, whatever +code the
  // phone was set up with.
  const kyc = bank && bank.kyc ? bank.kyc : null;
  const country = String((kyc && kyc.country) || dialCountry?.iso || "").toUpperCase();
  const india = country === "IN";
  const countryName = dialCountry && String(dialCountry.iso || "").toUpperCase() === country ? dialCountry.name : "";
  const [kycLoadFailed, setKycLoadFailed] = useStateBank(false);
  const loadKyc = () => {
    setKycLoadFailed(false);
    GloobalApi.getBank(symbolId).then((b) => { if (b) setBank((cur) => ({ ...(cur || {}), ...b })); else setKycLoadFailed(true); });
  };
  useEffectBank(() => { if (!kyc) loadKyc(); }, []);
  // The app-map button floats at z-index 10000 and sat on top of this
  // flow's own buttons. Hidden while the flow is up — it is a form with a
  // PIN at the end, not a screen to jump away from mid-way.
  useEffectBank(() => {
    window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: true } }));
    return () => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: false } }));
  }, []);
  const [screen, setScreen] = useStateBank(() => bankResumeScreen(initialBank));
  const [busy, setBusy] = useStateBank(false);
  const [error, setError] = useStateBank("");
  const [fieldError, setFieldError] = useStateBank({});

  const d0 = (initialBank && initialBank.details) || {};
  const [details, setDetails] = useStateBank(() => ({
    fullName: d0.fullName || myName || "",
    dob: d0.dob || "",
    email: d0.email || "",
    address: { line1: d0.address?.line1 || "", line2: d0.address?.line2 || "", city: d0.address?.city || "", postcode: d0.address?.postcode || "" },
    occupation: d0.occupation || "",
    income: d0.income || ""
  }));
  const [methodKey, setMethodKey] = useStateBank("");
  const [idValues, setIdValues] = useStateBank({});
  const [revealed, setRevealed] = useStateBank({});
  const liveMethods = kyc ? kyc.methods.filter((m) => m.status === "live") : [];
  const soonMethods = kyc ? kyc.methods.filter((m) => m.status !== "live") : [];
  const activeMethod = liveMethods.find((m) => m.key === methodKey) || liveMethods[0] || null;
  const [otp, setOtp] = useStateBank("");
  const [sentTo, setSentTo] = useStateBank("");
  const [otpTo, setOtpTo] = useStateBank("");
  const [resendIn, setResendIn] = useStateBank(0);
  const [nominees, setNominees] = useStateBank(() => {
    const list = (initialBank && initialBank.nominees) || [];
    return list.length ? list.map((n) => ({ ...n })) : [{ name: "", relation: "spouse", dob: "", sharePct: 100, mobile: "" }];
  });
  const [decl, setDecl] = useStateBank({ taxResidentOnly: false, notPep: false, terms: false });
  const [pin, setPin] = useStateBank("");
  const [checks, setChecks] = useStateBank(0);
  const [idShown, setIdShown] = useStateBank(false);

  const stepIndex = { about: 0, id: 1, otp: 1, selfie: 2, nominee: 3, review: 4, pin: 5 }[screen];
  const go = (s) => { setError(""); setFieldError({}); setScreen(s); };
  // Editing one part from the review screen comes back to the review
  // screen, rather than walking forward through every step after it.
  const [editing, setEditing] = useStateBank(false);
  const goNext = (s) => { if (editing) { setEditing(false); go("review"); } else go(s); };
  const fail = (err, fallback) => {
    const msg = (err && (err.body?.message || err.message)) || fallback;
    setError(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Check your connection and try again." : msg);
  };

  // The resend clock on the code screen.
  useEffectBank(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const saveAndExit = async () => {
    if (screen === "about" || screen === "nominee") {
      try {
        const patch = screen === "about" ? { details } : { nominees: nominees.filter((n) => n.name.trim()) };
        await GloobalApi.saveBankDraft(symbolId, patch);
      } catch (e) { /* Exiting anyway: the last completed step is already saved. */ }
    }
    if (onToast) onToast("Saved. Carry on from Accounts any time.");
    onClose(bank);
  };

  // ── step handlers ───────────────────────────────────────────────────
  const submitAbout = async () => {
    const problem = bankDetailsProblem(details);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const b = await GloobalApi.saveBankDraft(symbolId, { details, step: 1 });
      setBank(b);
      goNext(b && b.identity?.verified ? "selfie" : "id");
    } catch (e) { fail(e, "Could not save. Try again."); } finally { setBusy(false); }
  };

  const submitId = async () => {
    setBusy(true); setError(""); setFieldError({});
    try {
      if (!activeMethod) return;
      const r = await GloobalApi.submitBankId(symbolId, { method: activeMethod.key, values: idValues });
      if (r && r.bank) setBank(r.bank);
      if (r && r.otpSent) {
        setSentTo((r && r.sentTo) || "");
        setOtpTo((r && r.otpTo) || "");
        setOtp("");
        setResendIn(30);
        go("otp");
      } else {
        goNext("selfie");
      }
    } catch (e) {
      const field = e && e.body && e.body.field;
      if (field) setFieldError({ [field]: e.body.message });
      else fail(e, "Could not check your ID. Try again.");
    } finally { setBusy(false); }
  };

  const verifyOtp = async (code) => {
    setBusy(true); setError("");
    try {
      const r = await GloobalApi.verifyBankOtp(symbolId, code);
      if (r && r.bank) setBank(r.bank);
      goNext("selfie");
    } catch (e) {
      setOtp("");
      fail(e, "That code is not right.");
    } finally { setBusy(false); }
  };
  const typeOtp = (k) => {
    if (busy) return;
    setOtp((v) => {
      if (v.length >= 6) return v;
      const next = v + k;
      if (next.length === 6) verifyOtp(next);
      return next;
    });
  };
  const deleteOtp = () => setOtp((v) => v.slice(0, -1));
  useBankDigitKeys(screen === "otp", typeOtp, deleteOtp);

  const submitSelfie = async (skipped) => {
    setBusy(true); setError("");
    try {
      const b = await GloobalApi.saveBankSelfie(symbolId, skipped);
      if (b) setBank(b);
      goNext("nominee");
    } catch (e) { fail(e, "Could not save. Try again."); } finally { setBusy(false); }
  };

  const shareTotal = nominees.reduce((s, n) => s + (Number(n.sharePct) || 0), 0);
  const submitNominees = async (skip) => {
    setError("");
    const list = nominees.map((n) => ({ ...n, name: n.name.trim(), sharePct: Math.round(Number(n.sharePct) || 0) }));
    if (!skip) {
      if (list.some((n) => !n.name)) { setError("Every nominee needs a name."); return; }
      if (shareTotal !== 100) { setError(`Shares add up to ${shareTotal}%. They need to add up to 100%.`); return; }
    }
    setBusy(true);
    try {
      const b = await GloobalApi.saveBankDraft(symbolId, skip ? { nominees: [], nomineeSkipped: true, step: 4 } : { nominees: list, nomineeSkipped: false, step: 4 });
      setBank(b);
      if (skip) setNominees([{ name: "", relation: "spouse", dob: "", sharePct: 100, mobile: "" }]);
      go("review");
    } catch (e) { fail(e, "Could not save. Try again."); } finally { setBusy(false); }
  };

  const openAccount = async (code) => {
    setScreen("opening"); setError(""); setChecks(0);
    // The checklist moves while the request runs, and only the last line
    // waits for the server's answer: a tick on "Linking your GLOOBAL ID"
    // before the account exists would be a tick on something not done.
    const timers = [setTimeout(() => setChecks(1), 450), setTimeout(() => setChecks(2), 900)];
    try {
      const b = await GloobalApi.openBank(symbolId, code, decl);
      await new Promise((r) => setTimeout(r, 1300));
      setChecks(4);
      await new Promise((r) => setTimeout(r, 450));
      setBank(b);
      setPin("");
      setScreen("done");
      if (onOpened) onOpened(b);
    } catch (e) {
      timers.forEach(clearTimeout);
      setPin("");
      const body = (e && e.body) || {};
      if (body.code === "wrong_pin" || body.code === "pin" || body.code === "pin_locked") { setScreen("pin"); fail(e, "Invalid PIN."); return; }
      if (body.code === "incomplete" && Number.isFinite(Number(body.step))) {
        const target = ["about", "id", "selfie", "nominee", "review", "review"][Number(body.step)] || "review";
        setScreen(target); fail(e, "Something is missing."); return;
      }
      if (body.code === "declarations") { setScreen("review"); fail(e, "Tick all three boxes."); return; }
      if (body.code === "id_in_use") { setScreen("id"); fail(e, "This ID already has an account."); return; }
      setScreen("review");
      fail(e, "Could not open the account. Nothing was changed.");
    }
  };
  const typePin = (k) => setPin((v) => (v.length >= 6 ? v : v + k));
  const deletePin = () => setPin((v) => v.slice(0, -1));
  useBankDigitKeys(screen === "pin", typePin, deletePin);

  // ── layout ──────────────────────────────────────────────────────────
  const showSteps = stepIndex !== undefined;
  const canExit = showSteps;
  const back = () => {
    const prev = { about: "welcome", id: "about", otp: "id", selfie: "id", nominee: "selfie", review: "nominee", pin: "review" }[screen];
    if (screen === "welcome" || screen === "done" || !prev) { onClose(bank); return; }
    go(prev);
  };

  let body = null;
  let foot = null;

  if (screen === "welcome") {
    body = <>
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}><BankCardFace id={symbolId} name={myName} status="NEW" masked width={256} tilt={-4} /></div>
      <BankH1 sub="About 5 minutes. Your progress saves after every step, so you can stop and come back.">Open your <GloobalWordmark suffix=" Bank" /> account</BankH1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[
        [<LandmarkBk size={19} />, <><GloobalWordmark suffix=" ID" /> = your account number</>, "Nothing new to remember"],
        [<CoinsBk size={19} />, "Settle My Assets into it", "Your accumulated assets move here when you choose"],
        [<ShieldBk size={19} />, "Locked by your PIN", "Nobody opens it but you"]
      ].map(([icon, title, sub], i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}><BankIconBox size={38}>{icon}</BankIconBox><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{title}</span><span style={{ display: "block", fontSize: 12, fontWeight: 500, color: T.inkSoft, marginTop: 1 }}>{sub}</span></span></div>)}</div>
      <div style={{ marginTop: 16, borderRadius: 14, background: T.surfaceAlt, padding: "11px 12px" }}><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Keep ready</div><div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>{[...((kyc && kyc.keepReady) || []), "Your face for a selfie"].map((t) => <span key={t} style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 99, background: T.surface, color: T.ink }}>{t}</span>)}</div></div>
    </>;
    foot = <BankCta testId="bank-start" onClick={() => go("about")}>Start</BankCta>;
  }

  if (screen === "about") {
    const set = (k, v) => setDetails((d) => ({ ...d, [k]: v }));
    const setA = (k, v) => setDetails((d) => ({ ...d, address: { ...d.address, [k]: v } }));
    body = <>
      <BankH1 sub="We filled in what GLOOBAL already knows. Check it matches your ID.">About you</BankH1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BankField id="bank-name" label="Full name, as on your ID" value={details.fullName} onChange={(v) => set("fullName", v)} autoComplete="name" maxLength={80} />
        <BankField id="bank-mobile" label="Mobile · verified" value={mobileNumber || ""} locked right={<CheckBk size={15} color={T.positive} strokeWidth={3} />} />
        <BankField id="bank-dob" label="Date of birth" type="date" value={details.dob} onChange={(v) => set("dob", v)} autoComplete="bday" />
        <BankField id="bank-email" label="Email" type="email" inputMode="email" value={details.email} onChange={(v) => set("email", v)} autoComplete="email" maxLength={120} placeholder="you@example.com" />
        <BankField id="bank-line1" label="House and street" value={details.address.line1} onChange={(v) => setA("line1", v)} autoComplete="address-line1" maxLength={120} />
        <BankField id="bank-line2" label="Area or landmark (optional)" value={details.address.line2} onChange={(v) => setA("line2", v)} autoComplete="address-line2" maxLength={120} />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1.4, minWidth: 0 }}><BankField id="bank-city" label="City" value={details.address.city} onChange={(v) => setA("city", v)} autoComplete="address-level2" maxLength={60} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><BankField id="bank-postcode" label={(kyc && kyc.postcodeLabel) || "Postcode"} value={details.address.postcode} onChange={(v) => setA("postcode", v)} inputMode={india ? "numeric" : "text"} autoComplete="postal-code" maxLength={12} /></div>
        </div>
        <div><BankLabel>What do you do?</BankLabel><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{BANK_OCCUPATIONS.map(([k, l]) => <BankChip key={k} on={details.occupation === k} onClick={() => set("occupation", k)}>{l}</BankChip>)}</div></div>
        <div><BankLabel>Yearly income{india ? " (₹)" : ""}</BankLabel><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(india ? BANK_INCOMES : BANK_INCOMES_INTL).map(([k, l]) => <BankChip key={k} on={details.income === k} onClick={() => set("income", k)}>{l}</BankChip>)}</div></div>
        <BankError>{error}</BankError>
      </div>
    </>;
    foot = <BankCta testId="bank-about-continue" busy={busy} onClick={submitAbout}>Continue</BankCta>;
  }

  if (screen === "id") {
    if (!kyc) {
      body = <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: T.inkSoft, fontSize: 13, fontWeight: 600 }}>{kycLoadFailed ? <><span>Couldn't load the ID options for your country.</span><BankCta ghost onClick={loadKyc}>Try again</BankCta></> : <LoaderBk size={22} style={{ animation: "bankSpin 1s linear infinite", color: T.accent }} />}</div>;
      foot = null;
    } else {
      const sub = kyc.country === "IN"
        ? "Banks must check who opens an account. GLOOBAL never keeps your full ID numbers."
        : "Banks must check who opens an account. These are the ways used where your account is registered.";
      body = <>
        <BankH1 sub={sub}>Prove it's you</BankH1>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {liveMethods.length > 1 && <div role="radiogroup" aria-label="How to prove it's you" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{liveMethods.map((m) => {
            const on = m.key === activeMethod?.key;
            return <button key={m.key} type="button" role="radio" aria-checked={on} data-testid={`bank-method-${m.key}`} onClick={() => { setMethodKey(m.key); setFieldError({}); setError(""); }} style={{ display: "flex", alignItems: "center", gap: 11, textAlign: "left", padding: 12, borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit", background: T.surface, boxShadow: on ? `0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}` }}><BankIconBox solid={on} size={36}>{m.key === "passport" ? <PlaneBk size={17} /> : <FileBk size={17} />}</BankIconBox><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{m.label}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 1 }}>{m.sub}</span></span><span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: on ? T.accent : "transparent", boxShadow: on ? "none" : `inset 0 0 0 1.5px ${T.inkFaint}` }}>{on && <CheckBk size={12} color={bankOnAccent()} strokeWidth={3.2} />}</span></button>;
          })}</div>}
          {activeMethod && activeMethod.fields.map((f) => {
            const raw = idValues[f.key] || "";
            const shown = f.maxDigits && f.group ? raw.replace(new RegExp(`(\\d{${f.group}})(?=\\d)`, "g"), "$1 ") : raw;
            const onChange = (v) => {
              let next = v;
              if (f.type === "date") next = v;
              else if (f.maxDigits) next = v.replace(/\D/g, "").slice(0, f.maxDigits);
              else if (f.upper) next = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, f.maxLength || 20);
              setIdValues((x) => ({ ...x, [f.key]: next }));
            };
            const eye = f.secure ? <button type="button" onClick={() => setRevealed((x) => ({ ...x, [f.key]: !x[f.key] }))} aria-label={revealed[f.key] ? `Hide ${f.label}` : `Show ${f.label}`} style={{ border: "none", background: "none", cursor: "pointer", color: T.inkFaint, display: "flex", padding: 4 }}>{revealed[f.key] ? <EyeOffBk size={17} /> : <EyeBk size={17} />}</button> : null;
            return <BankField key={f.key} id={`bank-kyc-${f.key}`} label={f.label} type={f.type === "date" ? "date" : "text"} inputMode={f.inputMode} value={shown} onChange={onChange} placeholder={f.placeholder} mono={f.type !== "date"} upper={f.upper} secure={f.secure && !revealed[f.key]} autoComplete="off" error={fieldError[f.key]} right={eye} />;
          })}
          {activeMethod && activeMethod.provider && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45, padding: "0 2px" }}><ShieldBk size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>Checked now for format only. Once connected, checked with {activeMethod.provider}.</span></div>}
          {soonMethods.length > 0 && <div style={{ marginTop: 4 }}><BankLabel>More ways, coming soon</BankLabel><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{soonMethods.map((m) => <div key={m.key} data-testid={`bank-soon-${m.key}`} style={{ display: "flex", gap: 10, alignItems: "center", borderRadius: 14, padding: "10px 12px", background: T.surface, boxShadow: `inset 0 0 0 1px ${T.line}`, opacity: 0.72 }}><BankIconBox size={32}><FileBk size={15} /></BankIconBox><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink }}>{m.label}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft }}>{m.sub}</span></span><span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, padding: "3px 8px", borderRadius: 99, background: T.surfaceAlt, color: T.inkSoft, whiteSpace: "nowrap" }}>SOON</span></div>)}</div></div>}
          <BankError>{error}</BankError>
        </div>
      </>;
      const ready = Boolean(activeMethod) && activeMethod.fields.every((f) => {
        const v = idValues[f.key] || "";
        if (!v) return false;
        if (f.maxDigits && f.group) return v.length === f.maxDigits;
        return true;
      });
      foot = <BankCta testId="bank-id-continue" busy={busy} disabled={!ready} onClick={submitId}>{activeMethod?.verify === "otp" ? "Send me a code" : `Check my ${activeMethod?.label || "ID"}`}</BankCta>;
    }
  }

  if (screen === "otp") {
    body = <>
      <BankH1 sub={<>Sent to {otpTo || "your registered mobile"}{sentTo ? <> <b style={{ color: T.ink }}>{sentTo}</b></> : ""}.</>}>Enter the 6-digit code</BankH1>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "6px 0 14px" }}>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ width: 44, height: 54, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 23, fontWeight: 700, fontFamily: T.fontDisplay, background: T.surface, color: T.ink, boxShadow: i === otp.length ? `0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}` }}>{otp[i] || ""}</span>)}</div>
      <div style={{ textAlign: "center", fontSize: 12.5, fontWeight: 600, color: T.inkSoft }}>{resendIn > 0 ? <>Resend in <b style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}>0:{String(resendIn).padStart(2, "0")}</b></> : <button type="button" onClick={() => (Object.keys(idValues).length ? submitId() : go("id"))} style={{ border: "none", background: "none", color: T.accent, fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Send a new code</button>}</div>
      <div style={{ marginTop: 12 }}><BankError>{error}</BankError></div>
    </>;
    foot = busy ? <div style={{ display: "flex", justifyContent: "center", padding: 14, color: T.accent }}><LoaderBk size={22} style={{ animation: "bankSpin 1s linear infinite" }} /></div> : <BankKeypad onDigit={typeOtp} onDelete={deleteOtp} />;
  }

  if (screen === "selfie") {
    body = <BankSelfieStep busy={busy} error={error} onDone={() => submitSelfie(false)} onSkip={() => submitSelfie(true)} />;
    foot = null;
  }

  if (screen === "nominee") {
    const setN = (i, k, v) => setNominees((list) => list.map((n, j) => (j === i ? { ...n, [k]: v } : n)));
    body = <>
      <BankH1 sub="The person who receives this account's money if something happens to you.">Add a nominee</BankH1>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {nominees.map((n, i) => <div key={i} style={{ display: "flex", flexDirection: "column", gap: 11, ...(nominees.length > 1 ? { borderRadius: 16, padding: 12, background: T.surface, boxShadow: T.shadowCard } : {}) }}>
          {nominees.length > 1 && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>Nominee {i + 1}</span><button type="button" aria-label={`Remove nominee ${i + 1}`} onClick={() => setNominees((list) => list.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: T.inkFaint, cursor: "pointer", display: "flex" }}><TrashBk size={16} /></button></div>}
          <BankField id={`bank-nom-name-${i}`} label="Full name" value={n.name} onChange={(v) => setN(i, "name", v)} maxLength={80} />
          <div><BankLabel>Relation to you</BankLabel><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{BANK_RELATIONS.map(([k, l]) => <BankChip key={k} on={n.relation === k} onClick={() => setN(i, "relation", k)}>{l}</BankChip>)}</div></div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}><BankField id={`bank-nom-dob-${i}`} label="Their date of birth" type="date" value={n.dob} onChange={(v) => setN(i, "dob", v)} /></div>
            <div style={{ width: 92 }}><BankField id={`bank-nom-share-${i}`} label="Share %" inputMode="numeric" value={String(n.sharePct ?? "")} onChange={(v) => setN(i, "sharePct", v.replace(/\D/g, "").slice(0, 3))} /></div>
          </div>
          <BankField id={`bank-nom-mobile-${i}`} label="Their mobile (optional)" type="tel" inputMode="tel" value={n.mobile} onChange={(v) => setN(i, "mobile", v.replace(/[^\d+ ]/g, "").slice(0, 20))} />
        </div>)}
        {nominees.length < 3 && <button type="button" onClick={() => setNominees((list) => {
          const evenShare = Math.floor(100 / (list.length + 1));
          return [...list.map((n) => ({ ...n, sharePct: evenShare })), { name: "", relation: "other", dob: "", sharePct: 100 - evenShare * list.length, mobile: "" }];
        })} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "none", color: T.accent, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "2px", fontFamily: "inherit" }}><PlusBk size={16} strokeWidth={2.6} />Add another nominee <span style={{ color: T.inkFaint, fontWeight: 600 }}>· up to 3</span></button>}
        {nominees.length > 1 && <div style={{ fontSize: 12, fontWeight: 700, color: shareTotal === 100 ? T.positive : T.negative }}>Shares add up to {shareTotal}%{shareTotal === 100 ? "" : " — they need to make 100%"}</div>}
        <BankError>{error}</BankError>
      </div>
    </>;
    foot = <><BankCta testId="bank-nominee-continue" busy={busy} onClick={() => submitNominees(false)}>Continue</BankCta><button type="button" onClick={() => submitNominees(true)} disabled={busy} style={{ border: "none", background: "none", color: T.inkSoft, fontSize: 12.5, fontWeight: 700, marginTop: 10, cursor: "pointer", fontFamily: "inherit", width: "100%" }}>Skip for now — add one later</button></>;
  }

  if (screen === "review") {
    const b = bank || {};
    const id = b.identity || {};
    const noms = b.nominees || [];
    const occ = (BANK_OCCUPATIONS.find(([k]) => k === b.details?.occupation) || [])[1];
    const rel = (k) => (BANK_RELATIONS.find(([x]) => x === k) || [])[1] || "";
    const rows = [
      [<BookUserBk size={16} />, "About you", [b.details?.fullName, occ, b.details?.address?.city].filter(Boolean).join(" · "), "about"],
      [<FileBk size={16} />, "Your ID", id.summary || id.methodLabel || "Checked", "id"],
      [<ScanFaceBk size={16} />, "Selfie", b.selfie?.skipped ? "Skipped in test mode" : "Taken on this phone", "selfie"],
      [<UsersBk size={16} />, "Nominee", b.nomineeSkipped || noms.length === 0 ? "None yet — add one later" : noms.map((n) => `${n.name} · ${rel(n.relation)} · ${n.sharePct}%`).join(", "), "nominee"]
    ];
    const tick = (k, label) => <button type="button" role="checkbox" aria-checked={decl[k]} onClick={() => setDecl((x) => ({ ...x, [k]: !x[k] }))} style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45 }}><span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: decl[k] ? T.accent : "transparent", boxShadow: decl[k] ? "none" : `inset 0 0 0 1.5px ${T.inkFaint}` }}>{decl[k] && <CheckBk size={13} color={bankOnAccent()} strokeWidth={3.2} />}</span><span>{label}</span></button>;
    body = <>
      <BankH1>Check and agree</BankH1>
      <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: "2px 14px" }}>{rows.map(([icon, title, sub, target], i) => <button key={title} type="button" onClick={() => { setEditing(true); go(target); }} style={{ width: "100%", display: "flex", gap: 11, alignItems: "center", padding: "11px 0", border: "none", borderBottom: i < rows.length - 1 ? `1px solid ${T.lineSoft}` : "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}><BankIconBox size={34}>{icon}</BankIconBox><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800, color: T.ink }}>{title}<CheckBk size={13} color={T.positive} strokeWidth={3} /></span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span></span><PencilBk size={14} color={T.inkFaint} /></button>)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
        {tick("taxResidentOnly", countryName ? `I pay tax in ${countryName} only.` : "I pay tax only in the country where this account is registered.")}
        {tick("notPep", "I'm not a politically exposed person, or related to one.")}
        {tick("terms", <>I agree to the <GloobalWordmark suffix=" Bank" /> account terms and privacy notice.</>)}
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45 }}><ShieldBk size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>Identity checks run in test mode until our ID partner is connected. You may be asked to verify again then.</span></div>
      <div style={{ marginTop: 12 }}><BankError>{error}</BankError></div>
    </>;
    foot = <BankCta testId="bank-review-continue" disabled={!(decl.taxResidentOnly && decl.notPep && decl.terms)} onClick={() => { setPin(""); go("pin"); }}>Agree and continue</BankCta>;
  }

  if (screen === "pin") {
    body = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 18 }}>
      <BankIconBox solid size={54}><LockBk size={24} /></BankIconBox>
      <div style={{ fontSize: 21, fontWeight: 700, fontFamily: T.fontDisplay, marginTop: 14, color: T.ink, textAlign: "center" }}>Enter your GLOOBAL PIN</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, marginTop: 5, textAlign: "center" }}>This opens the account in your name.</div>
      <div style={{ display: "flex", gap: 14, marginTop: 22 }} aria-label={`${pin.length} digits entered`}>{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ width: 15, height: 15, borderRadius: "50%", background: i < pin.length ? T.accent : "transparent", boxShadow: i < pin.length ? "none" : `inset 0 0 0 2px ${T.line}` }} />)}</div>
      <div style={{ marginTop: 16, width: "100%" }}><BankError>{error}</BankError></div>
    </div>;
    foot = <><BankKeypad onDigit={typePin} onDelete={deletePin} /><div style={{ height: 12 }} /><BankCta testId="bank-open" disabled={pin.length < 4} onClick={() => openAccount(pin)}>Open my account</BankCta></>;
  }

  if (screen === "opening") {
    const items = [`${(bank && bank.identity && bank.identity.methodLabel) || "ID"} checked`, "Selfie saved", "Safety checks", <>Linking your <GloobalWordmark suffix=" ID" /></>];
    body = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 30 }}>
      <div style={{ position: "relative", width: 120, height: 120 }}>
        <svg width="120" height="120" style={{ position: "absolute", inset: 0, animation: "bankSpin 1.4s linear infinite" }}><circle cx="60" cy="60" r="54" fill="none" stroke={T.surfaceSunk} strokeWidth="7" /><circle cx="60" cy="60" r="54" fill="none" stroke={T.accent} strokeWidth="7" strokeLinecap="round" strokeDasharray="339" strokeDashoffset="230" /></svg>
        <span style={{ position: "absolute", inset: 18, borderRadius: "50%", background: T.gradButton, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><LandmarkBk size={34} /></span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.fontDisplay, marginTop: 20, color: T.ink }}>Opening your account</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, marginTop: 6, textAlign: "center" }}>This takes a few seconds.</div>
      <div style={{ width: "100%", marginTop: 24, borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>{items.map((t, i) => {
        const state = i < checks ? 2 : i === checks ? 1 : 0;
        return <div key={i} style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: state === 2 ? T.positive : "transparent", boxShadow: state === 2 ? "none" : `inset 0 0 0 2.5px ${state === 1 ? T.accent : T.line}` }}>{state === 2 && <CheckBk size={14} color="#fff" strokeWidth={3.2} />}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: state ? 800 : 600, color: state ? T.ink : T.inkFaint }}>{t}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: state === 2 ? T.positive : state === 1 ? T.accent : T.inkFaint }}>{state === 2 ? "Done" : state === 1 ? "Checking…" : "Next"}</span>
        </div>;
      })}</div>
    </div>;
    foot = null;
  }

  if (screen === "done") {
    const b = bank || {};
    const primary = after === "settle" ? "Settle my assets now" : after === "essentials" ? "See My Essentials" : <>Go to <GloobalWordmark suffix=" Bank" /></>;
    body = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14 }}>
      <BankCardFace id={b.accountNumber || symbolId} name={b.nameOnAccount || myName} status="ACTIVE" width={268} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, fontSize: 22, fontWeight: 700, fontFamily: T.fontDisplay, color: T.ink }}><span style={{ width: 27, height: 27, borderRadius: "50%", background: T.positive, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckBk size={16} color="#fff" strokeWidth={3.2} /></span>Your account is open</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, marginTop: 6, textAlign: "center" }}>Your <GloobalWordmark suffix=" ID" /> is now your account number.</div>
      <div style={{ width: "100%", marginTop: 18, borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: "4px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${T.lineSoft}` }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Account number · your GLOOBAL ID</span><span style={{ display: "block", marginTop: 6 }}><BankIdSymbols id={b.accountNumber || symbolId} masked={!idShown} size={16} /></span></span><button type="button" aria-label={idShown ? "Hide account number" : "Show account number"} onClick={() => setIdShown((s) => !s)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{idShown ? <EyeOffBk size={15} /> : <EyeBk size={15} />}</button><button type="button" aria-label="Copy account number" onClick={() => { copyToClipboard(b.accountNumber || symbolId); if (onToast) onToast("Copied"); }} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><CopyBk size={15} /></button></div>
        <div style={{ padding: "11px 0" }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Name on account</span><span style={{ display: "block", fontSize: 15, fontWeight: 700, marginTop: 3, color: T.ink }}>{b.nameOnAccount || myName}</span></div>
      </div>
    </div>;
    foot = <><BankCta testId="bank-done-primary" onClick={() => onFinish(after)}>{primary}</BankCta><div style={{ height: 9 }} /><BankCta ghost onClick={() => onClose(bank)}>Done</BankCta></>;
  }

  return <div data-testid="bank-open-flow" style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <style>{"@keyframes bankSpin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { [data-testid=bank-open-flow] * { animation-duration: 3s !important; } }"}</style>
    {screen !== "opening" && <div style={{ padding: "calc(14px + env(safe-area-inset-top, 0px)) 18px 0", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12 }}>
        <button type="button" onClick={back} aria-label={screen === "welcome" || screen === "done" ? "Close" : "Back"} className="v2-tap" style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>{screen === "welcome" || screen === "done" ? <XBk size={18} /> : <ArrowLeftBk size={18} />}</button>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{screen === "done" ? <GloobalWordmark suffix=" Bank" /> : <>Open <GloobalWordmark suffix=" Bank" /></>}</span>
        {canExit && <button type="button" onClick={saveAndExit} style={{ border: "none", background: "none", color: T.accent, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}><ClockBk size={13} />Save &amp; exit</button>}
      </div>
      {showSteps && <>
        <div style={{ display: "flex", gap: 4 }}>{BANK_STEP_NAMES.map((n, i) => <span key={n} style={{ flex: 1, height: 4, borderRadius: 99, background: i < stepIndex ? T.accent : i === stepIndex ? `rgba(${T.accentRgb},.45)` : T.surfaceSunk }} />)}</div>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint, marginTop: 8 }}>Step {stepIndex + 1} of 6 · {BANK_STEP_NAMES[stepIndex]}</div>
      </>}
    </div>}
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: screen === "selfie" ? 0 : "0 18px 16px", display: "flex", flexDirection: "column" }}>{body}</div>
    {foot && <div style={{ flexShrink: 0, padding: "10px 18px calc(16px + env(safe-area-inset-bottom, 0px))", background: T.bg }}>{foot}</div>}
  </div>;
}

// ── THE SELFIE ──────────────────────────────────────────────────────────
// Front camera into an oval. "Take selfie" freezes the frame; "Use this"
// records that it was taken. The picture itself stays in this component and
// is gone when it unmounts — it is never uploaded.
function BankSelfieStep({ busy, error, onDone, onSkip }) {
  const videoRef = useRefBank(null);
  const canvasRef = useRefBank(null);
  const streamRef = useRefBank(null);
  const [state, setState] = useStateBank("starting"); // starting | live | taken | denied
  const [camError, setCamError] = useStateBank("");

  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const start = async () => {
    setState("starting"); setCamError("");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("no-camera");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    } catch (e) {
      setCamError(e && e.name === "NotAllowedError" ? "Camera access is off for GLOOBAL. Allow it in your browser's site settings, then try again." : "We couldn't start the camera on this device.");
      setState("denied");
    }
  };
  useEffectBank(() => { start(); return stop; }, []);

  const take = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setState("taken");
    stop();
  };
  const retake = () => { const c = canvasRef.current; if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); start(); };
  useEffectBank(() => () => { const c = canvasRef.current; if (c) { c.width = 1; c.height = 1; } }, []);

  const ring = String(T.accent).toUpperCase() === "#111111" ? "#fff" : T.accent;
  return <div style={{ flex: 1, minHeight: 520, margin: "12px 0 0", background: "#0E0D18", borderRadius: "26px 26px 0 0", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 18px calc(18px + env(safe-area-inset-bottom, 0px))" }}>
    <div style={{ color: "#fff", fontSize: 19, fontWeight: 700, fontFamily: T.fontDisplay, textAlign: "center" }}>{state === "taken" ? "Happy with it?" : "Look at the camera"}</div>
    <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 600, marginTop: 4, textAlign: "center" }}>Your photo stays on this phone.</div>
    <div style={{ position: "relative", width: 220, height: 280, marginTop: 20, flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 6, borderRadius: "50%", overflow: "hidden", background: "#22203A" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: state === "live" || state === "starting" ? "block" : "none" }} />
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: state === "taken" ? "block" : "none" }} />
        {state === "denied" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.5)" }}><CameraBk size={44} /></div>}
      </div>
      <svg width="220" height="280" viewBox="0 0 220 280" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><ellipse cx="110" cy="140" rx="104" ry="134" fill="none" stroke={state === "taken" ? T.positive : state === "live" ? ring : "rgba(255,255,255,.2)"} strokeWidth="6" /></svg>
    </div>
    {state === "live" && <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 99, background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 13, fontWeight: 800 }}><ScanFaceBk size={16} />Face inside the oval, then tap below</div>}
    {(camError || error) && <div role="alert" style={{ marginTop: 14, color: "#FECACA", fontSize: 12.5, fontWeight: 700, textAlign: "center", lineHeight: 1.45, maxWidth: 300 }}>{error || camError}</div>}
    <div style={{ flex: 1, minHeight: 16 }} />
    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>{["Good light", "No glasses", "Only you"].map((t) => <span key={t} style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.75)", padding: "5px 9px", borderRadius: 99, border: "1px solid rgba(255,255,255,.2)", display: "flex", gap: 4, alignItems: "center" }}><CheckBk size={11} />{t}</span>)}</div>
    <div style={{ width: "100%" }}>
      {state === "live" && <BankCta testId="bank-selfie-take" arrow={false} onClick={take}><CameraBk size={18} />Take selfie</BankCta>}
      {state === "starting" && <BankCta disabled arrow={false}>Starting camera…</BankCta>}
      {state === "taken" && <div style={{ display: "flex", gap: 10 }}><button type="button" onClick={retake} disabled={busy} style={{ flex: 1, height: 50, borderRadius: 16, border: "1.5px solid rgba(255,255,255,.25)", background: "transparent", color: "#fff", fontSize: 14.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", fontFamily: "inherit" }}><RetakeBk size={16} />Retake</button><div style={{ flex: 1.4 }}><BankCta testId="bank-selfie-use" busy={busy} onClick={onDone}>Use this</BankCta></div></div>}
      {state === "denied" && <><BankCta arrow={false} onClick={start}><CameraBk size={18} />Try the camera again</BankCta><button type="button" data-testid="bank-selfie-skip" onClick={onSkip} disabled={busy} style={{ width: "100%", marginTop: 10, border: "none", background: "none", color: "rgba(255,255,255,.7)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Continue without a selfie (test mode)</button></>}
    </div>
  </div>;
}

// ── PIECES OTHER SCREENS USE ────────────────────────────────────────────

// Shown when Settle is tapped with no account to settle into.
function BankNeedsAccountSheet({ amountText, bank, onOpen, onClose }) {
  const resuming = bank && bank.status === "draft";
  return <div style={{ position: "fixed", inset: 0, zIndex: 315, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,8,25,.5)" }} />
    <div role="dialog" aria-modal="true" aria-label="Settle needs a GLOOBAL Bank account" style={{ position: "relative", borderRadius: "28px 28px 0 0", background: T.bg, padding: "10px 18px calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", boxShadow: "0 -14px 40px rgba(0,0,0,.25)" }}>
      <span style={{ width: 40, height: 5, borderRadius: 99, background: T.line, margin: "0 auto 16px" }} />
      <BankIconBox solid size={52}><LandmarkBk size={24} /></BankIconBox>
      <div style={{ fontSize: 21, fontWeight: 700, fontFamily: T.fontDisplay, marginTop: 14, lineHeight: 1.25, color: T.ink }}>Settle needs a <GloobalWordmark suffix=" Bank" /> account</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: T.inkSoft, marginTop: 8, lineHeight: 1.5 }}>{amountText ? <>Your <b style={{ color: T.ink }}>{amountText}</b> of assets will settle into it. </> : null}Open one first — about 5 minutes — and we'll bring you straight back here to finish.</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 18px" }}>{["Your ID", "A quick selfie", "Your GLOOBAL PIN to confirm"].map((t) => <span key={t} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700, color: T.ink }}><CheckBk size={15} color={T.positive} strokeWidth={3} />{t}</span>)}</div>
      <BankCta testId="bank-needs-open" onClick={onOpen}>{resuming ? `Continue — step ${Math.min(6, (Number(bank.step) || 0) + 1)} of 6` : "Open account"}</BankCta>
      <button type="button" onClick={onClose} style={{ border: "none", background: "none", color: T.inkSoft, fontSize: 13, fontWeight: 700, marginTop: 12, cursor: "pointer", fontFamily: "inherit" }}>Not now</button>
    </div>
  </div>;
}

// On the GLOOBAL Bank screen, under the balance: the account's details once
// it is open, or the way to open it until then.
function BankAccountPanel({ bank, gloobalId, onOpen, onToast }) {
  const [shown, setShown] = useStateBank(false);
  if (!bank) return null;
  if (bank.status !== "open") {
    const resuming = bank.status === "draft";
    return <div style={{ flexShrink: 0, borderRadius: T.radiusLg, background: T.surface, boxShadow: `0 0 0 2px ${T.accent}, ${T.shadowCard}`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}><BankIconBox size={42}><LandmarkBk size={20} /></BankIconBox><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink }}>{resuming ? "Finish opening your account" : "Open your account"}</span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>Your <GloobalWordmark suffix=" ID" /> becomes the account number</span></span></div>
      <BankCta testId="bank-panel-open" onClick={onOpen}>{resuming ? `Continue — step ${Math.min(6, (Number(bank.step) || 0) + 1)} of 6` : "Open account · 5 min"}</BankCta>
    </div>;
  }
  const nominee = (bank.nominees || [])[0];
  const rel = nominee ? ((BANK_RELATIONS.find(([k]) => k === nominee.relation) || [])[1] || "") : "";
  return <div style={{ flexShrink: 0, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "4px 16px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${T.lineSoft}` }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Account number · GLOOBAL ID</span><span style={{ display: "block", marginTop: 6 }}><BankIdSymbols id={bank.accountNumber || gloobalId} masked={!shown} size={15} /></span></span><button type="button" aria-label={shown ? "Hide account number" : "Show account number"} onClick={() => setShown((s) => !s)} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{shown ? <EyeOffBk size={15} /> : <EyeBk size={15} />}</button><button type="button" aria-label="Copy account number" onClick={() => { copyToClipboard(bank.accountNumber || gloobalId); if (onToast) onToast("Copied"); }} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><CopyBk size={15} /></button></div>
    <div style={{ padding: "12px 0", borderBottom: nominee ? `1px solid ${T.lineSoft}` : "none" }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Name on account</span><span style={{ display: "block", fontSize: 14.5, fontWeight: 700, marginTop: 3, color: T.ink }}>{bank.nameOnAccount}</span></div>
    {nominee && <div style={{ padding: "12px 0", display: "flex", alignItems: "center" }}><span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint }}>Nominee</span><span style={{ display: "block", fontSize: 14.5, fontWeight: 700, marginTop: 3, color: T.ink }}>{nominee.name}{rel ? ` · ${rel}` : ""}{(bank.nominees || []).length > 1 ? ` +${bank.nominees.length - 1}` : ""}</span></span><ChevronRightBk size={15} color={T.inkFaint} /></div>}
  </div>;
}
