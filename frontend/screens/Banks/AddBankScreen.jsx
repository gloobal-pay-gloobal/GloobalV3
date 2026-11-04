// src/screens/Banks/AddBankScreen.jsx
import { useState as useState84, useEffect as useEffect80, useMemo as useMemo19, useRef as useRef44 } from "react";

// ── LINK A BANK, v2 (0209) ─────────────────────────────────────────────────
//
// The old screen said "Bank globally. One ID for all.", showed a globe, a
// star on GLOOBAL Bank and a padlock on every other bank: "Locked until live
// APIs connect". But linking already worked, inside GLOOBAL Bank — account
// number and IFSC (or a UPI ID), the name checked, up to five accounts. This
// is that real flow, as the founder drew it:
//
//   1. Pick your bank — logos inside their box, the name outside, under it.
//   2. Your linked banks come first once you have one.
//   3. Two ways to prove it is yours, both ₹1:
//        · pay ₹1 from that bank by UPI, and the payment says which account
//          it came from (number, IFSC, the name) — nothing to type;
//        · or type the numbers, and ₹1 is sent to it; the bank answers with
//          the name, checked against yours.
//   4. Linked — and straight into Add money from it / Send to it.
//
// TEST MODE, like Add money and Send to bank: no UPI app opens and no bank
// is called; the server simulates the ₹1 and the bank's answer and says so.

// The first four letters of an Indian IFSC, by bank — what makes "pay ₹1"
// possible without typing, and what half-fills the IFSC when typing.
var LINK_BANK_IFSC = {
  "State Bank of India": "SBIN", "HDFC Bank": "HDFC", "ICICI Bank": "ICIC", "Axis Bank": "UTIB",
  "Kotak Mahindra Bank": "KKBK", "Punjab National Bank": "PUNB", "Bank of Baroda": "BARB",
  "Canara Bank": "CNRB", "Union Bank of India": "UBIN", "IndusInd Bank": "INDB", "Indian Bank": "IDIB",
  "Indian Overseas Bank": "IOBA", "Yes Bank": "YESB", "IDFC First Bank": "IDFB", "Federal Bank": "FDRL",
  "AU Small Finance Bank": "AUBL"
};
// India has more banks than the five on the Home list; the rest of the
// banks people actually use, for "All banks".
var LINK_BANK_MORE_IN = [
  ["Indian Bank", "IB", "indianbank.in"], ["Indian Overseas Bank", "IOB", "iob.in"], ["Yes Bank", "YES", "yesbank.in"],
  ["IDFC First Bank", "IDFC", "idfcfirstbank.com"], ["Federal Bank", "FED", "federalbank.co.in"], ["AU Small Finance Bank", "AU", "aubank.in"]
];
var LINK_BANK_UPI_APPS = [["GPay", "G", "#1A73E8"], ["PhonePe", "Pe", "#5F259F"], ["Paytm", "P", "#00B9F1"], ["BHIM", "B", "#F47B20"]];

function linkBankList(iso) {
  const names = (typeof BANK_NAMES !== "undefined" && BANK_NAMES[iso]) || [];
  const all = iso === "IN" ? names.concat(LINK_BANK_MORE_IN.filter(([n]) => !names.some((x) => x[0] === n))) : names;
  return all.map(([name, initials, domain], i) => ({
    id: `${iso}-all-${i}`,
    name,
    initials: initials.length > 5 ? initials.slice(0, 5) : initials,
    color: PALETTE[i % PALETTE.length],
    logo: logoUrlForDomain(domain),
    ifsc: LINK_BANK_IFSC[name] || ""
  }));
}

// The logo, inside its own rounded box — the box is the bank's mark, so the
// name goes outside it.
function LinkBankLogo({ bank, size = 52 }) {
  const [failed, setFailed] = useState84(false);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
  if (!bank || !bank.logo || failed) {
    return <span aria-hidden="true" style={{ ...box, background: (bank && bank.color) || T.accent, color: "#fff", fontWeight: 900, fontSize: Math.round(size * 0.27), letterSpacing: 0.2 }}>{(bank && bank.initials) || "\u{1F3E6}"}</span>;
  }
  return <span aria-hidden="true" style={{ ...box, background: "#fff", boxShadow: `inset 0 0 0 1px ${T.line}` }}><img src={bank.logo} alt="" onError={() => setFailed(true)} style={{ width: "72%", height: "72%", objectFit: "contain" }} /></span>;
}

function LinkBankCard({ children, style, onClick, label, testId }) {
  const Tag = onClick ? "button" : "div";
  return <Tag type={onClick ? "button" : undefined} onClick={onClick} aria-label={label} data-testid={testId} className={onClick ? "v2-tap" : undefined} style={{ display: "block", width: "100%", textAlign: "left", border: "none", fontFamily: "inherit", cursor: onClick ? "pointer" : "default", background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, padding: 14, ...style }}>{children}</Tag>;
}

function LinkBankButton({ children, onClick, disabled, quiet, testId }) {
  return <button type="button" data-testid={testId} onClick={onClick} disabled={disabled} className="v2-tap" style={{ width: "100%", border: "none", borderRadius: 16, padding: "15px 16px", fontFamily: "inherit", fontSize: 15, fontWeight: 900, cursor: disabled ? "default" : "pointer", background: disabled ? T.surfaceAlt : quiet ? T.surface : T.gradButton, color: disabled ? T.inkFaint : quiet ? T.ink : "#fff", boxShadow: quiet ? `inset 0 0 0 1.5px ${T.line}` : "none" }}>{children}</button>;
}

function LinkBankKV({ rows }) {
  return <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rows.filter(Boolean).map(([k, v, color], i) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 14px", borderTop: i ? `1px solid ${T.line}` : "none", fontSize: 13, fontWeight: 700 }}><span style={{ color: T.inkSoft }}>{k}</span><b style={{ color: color || T.ink, fontWeight: 900, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</b></div>)}</div>;
}

function LinkBankNote({ children, tone = "info" }) {
  const c = tone === "ok" ? [T.positiveSoft, T.positive] : tone === "bad" ? [T.negativeSoft, T.negative] : [T.surfaceAlt, T.inkSoft];
  return <div role={tone === "bad" ? "alert" : undefined} style={{ borderRadius: 14, padding: "10px 12px", background: c[0], color: c[1], fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}>{children}</div>;
}

function AddBankScreen({ onClose, country: countryProp, balance = 0, myName = "", onOpenGloobalBank }) {
  const country = countryProp || COUNTRY_BY_ISO?.IN || ALL_COUNTRIES?.[0] || { iso: "IN", name: "India", flag: "🇮🇳" };
  const india = country.iso === "IN";
  const ccy = (typeof COUNTRY_CURRENCY !== "undefined" && COUNTRY_CURRENCY[country.iso]) || "INR";
  // 0224: the one-rupee check is money too, so it carries GEU beside it.
  const lens = useGeuLens();
  const one = geuLensBarMoney(1, ccy, lens, ccy).replace(/\.00(?=\D|$)/, "");
  const popular = (typeof BANKS_BY_COUNTRY !== "undefined" && BANKS_BY_COUNTRY[country.iso]) || [];
  const all = useMemo19(() => linkBankList(country.iso).slice().sort((a, b) => a.name.localeCompare(b.name)), [country.iso]);

  const [accounts, setAccounts] = useState84(null); // null = loading
  const [bankOpen, setBankOpen] = useState84(true);
  const [step, setStep] = useState84("home");
  const [bank, setBank] = useState84(null);
  const [query, setQuery] = useState84("");
  const [num, setNum] = useState84("");
  const [num2, setNum2] = useState84("");
  const [code, setCode] = useState84("");
  const [upiId, setUpiId] = useState84("");
  const [busy, setBusy] = useState84(false);
  const [error, setError] = useState84("");
  const [result, setResult] = useState84(null); // { account, nameAtBank, utr, via }
  const [money, setMoney] = useState84(null); // "add" | "send" | "history"
  const idem = useRef44("");

  const load = async () => {
    try {
      const [list, ess] = await Promise.all([GloobalApi.getLinkedAccounts(), GloobalApi.getEssentials()]);
      setAccounts(list.filter((a) => a.status === "active").sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))));
      if (ess && ess.bankOpen === false) setBankOpen(false);
    } catch (e) {
      setAccounts([]);
    }
  };
  useEffect80(() => {
    load();
  }, []);
  // (0231) The map button stays here (an edge tab now, clear of the form).

  const go = (next) => { setError(""); setStep(next); };
  const pickBank = (b) => {
    const prefix = b.ifsc || LINK_BANK_IFSC[b.name] || "";
    setBank({ ...b, ifsc: prefix });
    setNum(""); setNum2(""); setCode(india && prefix ? `${prefix}0` : "");
    idem.current = "";
    go(india && prefix ? "verify" : "type");
  };
  const linked = accounts || [];
  const hasLinked = linked.length > 0;
  const atMost = linked.length >= 5;
  const nameMatch = (n) => String(n || "").trim().toUpperCase() === String(myName || "").trim().toUpperCase();

  const payRupee = async (app) => {
    setBusy(app || true);
    setError("");
    try {
      if (!idem.current) idem.current = `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // The wait a real UPI collect has, so the screen reads as it will.
      await new Promise((r) => setTimeout(r, 900));
      const r = await GloobalApi.linkBankByRupee({ bankCode: bank.ifsc, bankName: bank.name, idempotencyKey: idem.current });
      idem.current = "";
      setResult({ account: r.account, nameAtBank: r.nameAtBank, utr: r.utr || (r.transfer && r.transfer.externalRef), via: "upi" });
      load();
      go("paid");
    } catch (e) {
      setError((e && e.message) || "Couldn't link it. Nothing was taken.");
    } finally {
      setBusy(false);
    }
  };
  const saveTyped = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await GloobalApi.linkBankAccount({ kind: "bank", accountNumber: num, confirmNumber: num2, code, bankName: bank && bank.name });
      setResult({ account: r.account, nameAtBank: r.nameAtBank, utr: r.pennyDrop && r.pennyDrop.utr, via: "penny" });
      load();
      go("typed");
    } catch (e) {
      setError((e && e.message) || "Couldn't save that account.");
    } finally {
      setBusy(false);
    }
  };
  const saveUpi = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await GloobalApi.linkBankAccount({ kind: "upi", upiId });
      setResult({ account: r.account, nameAtBank: r.nameAtBank, via: "upiid" });
      load();
      go("done");
    } catch (e) {
      setError((e && e.message) || "Couldn't save that UPI ID.");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    const parent = { verify: "pick", pay: "verify", type: bank && bank.ifsc && india ? "verify" : "pick", upi: "pick", pick: hasLinked ? "home" : null, paid: "done", typed: "done", done: null }[step];
    if (parent && !(step === "pick" && !hasLinked)) go(parent);
    else onClose();
  };
  const title = { home: hasLinked ? "Your banks" : "Link a bank", pick: "Link a bank", verify: bank ? bank.name : "", pay: `Pay ${one} to verify`, paid: bank ? bank.name : "", type: bank ? bank.name : "Your bank", typed: bank ? bank.name : "", upi: "Link by UPI ID", done: "Linked" }[step];
  const view = step === "home" && !hasLinked && accounts !== null ? "pick" : step;

  const sectionCap = (t) => <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft, padding: "4px 2px 0" }}>{t}</div>;
  const field = (id, label, value, onChange, opts = {}) => <label htmlFor={id} style={{ display: "block", background: T.surface, borderRadius: 16, padding: "10px 14px", boxShadow: `inset 0 0 0 1.5px ${T.line}` }}><span style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.inkFaint }}>{label}</span><input id={id} value={value} onChange={(e) => onChange(e.target.value)} inputMode={opts.inputMode || "text"} placeholder={opts.placeholder || ""} autoComplete="off" style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: opts.spaced ? 1 : 0, padding: "3px 0 0" }} /></label>;

  let body = null;
  let footer = null;

  if (accounts === null) {
    body = <div role="status" style={{ padding: 30, textAlign: "center", color: T.inkFaint, fontWeight: 700, fontSize: 13 }}>Loading your banks…</div>;
  } else if (!bankOpen) {
    // Linking needs a GLOOBAL Bank account to move money to and from.
    body = <><LinkBankCard testId="link-bank-open-first" style={{ padding: 18, textAlign: "center" }}><div style={{ fontSize: 34 }} aria-hidden="true">🏦</div><div style={{ fontFamily: T.fontDisplay, fontSize: 20, fontWeight: 800, color: T.ink, marginTop: 6 }}>Open <GloobalWordmark suffix=" Bank" /> to link</div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 6, lineHeight: 1.45 }}>A linked bank is where you add money from and send money to. About 5 minutes · your progress saves.</div></LinkBankCard></>;
    footer = <LinkBankButton testId="link-bank-open" onClick={() => (onOpenGloobalBank ? onOpenGloobalBank() : onClose())}>Open GLOOBAL Bank</LinkBankButton>;
  } else if (view === "home") {
    body = <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}><FlagEmoji flag={country.flag} width={20} height={14} radius={3} /><span>{`${linked.length} linked · up to 5`}</span></div>
      <div data-testid="link-bank-linked" style={{ display: "flex", flexDirection: "column", gap: 9 }}>{linked.map((a, i) => {
        const b = all.find((x) => x.name === a.bankName) || { name: a.bankName, initials: a.kind === "upi" ? "UPI" : String(a.bankName || "?").slice(0, 4).toUpperCase(), color: PALETTE[i % PALETTE.length] };
        return <LinkBankCard key={a.id} style={{ display: "flex", alignItems: "center", gap: 12 }}><LinkBankLogo bank={a.kind === "upi" ? { initials: "UPI", color: "#5F259F" } : b} size={44} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14.5, fontWeight: 800, color: T.ink }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.kind === "upi" ? a.upiId : a.bankName}</span>{i === 0 ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, borderRadius: 999, padding: "2px 7px", background: T.accentSoft, color: T.accent }}>Primary</span> : null}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: T.inkFaint, marginTop: 2 }}>{`${a.kind === "upi" ? "UPI" : `•••• ${a.last4}`} · ${a.holderName} · verified${a.verifiedBy === "upi_rupee" ? ` by ${one}` : a.verifiedBy === "penny_drop" ? ` · ${one} sent` : ""}`}</span></span><span aria-hidden="true" style={{ color: T.positive, fontWeight: 900 }}>✓</span></LinkBankCard>;
      })}</div>
      {!atMost && <LinkBankCard onClick={() => go("pick")} testId="link-bank-another" label="Link another bank" style={{ display: "flex", alignItems: "center", gap: 12, boxShadow: `inset 0 0 0 1.5px ${T.line}`, background: "transparent" }}><span style={{ width: 44, height: 44, borderRadius: 14, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900 }}>+</span><b style={{ fontSize: 14.5, color: T.accent }}>Link another bank</b></LinkBankCard>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 9 }}>{[["add", "↙", "Add money"], ["send", "↗", "Send to bank"], ["history", "≡", "Transfers"]].map(([k, icon, label]) => <button key={k} type="button" data-testid={`link-bank-money-${k}`} onClick={() => setMoney(k)} className="v2-tap" style={{ border: "none", borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}><span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900 }}>{icon}</span><span style={{ fontSize: 12, fontWeight: 800, color: T.ink }}>{label}</span></button>)}</div>
      <LinkBankNote>🔒 Only the last 4 digits are kept on screen. Money only goes to accounts in your own name.</LinkBankNote>
    </>;
  } else if (view === "pick") {
    const q = query.trim().toLowerCase();
    const hits = q ? all.filter((b) => b.name.toLowerCase().includes(q) || b.initials.toLowerCase().includes(q)) : null;
    const tile = (b, i) => <button key={b.id} type="button" data-testid="link-bank-tile" onClick={() => pickBank(b)} aria-label={`Link ${b.name}`} className="v2-tap" style={{ border: "none", background: "transparent", padding: "4px 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}><LinkBankLogo bank={{ ...b, ifsc: b.ifsc || LINK_BANK_IFSC[b.name] }} size={56} /><span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, lineHeight: 1.25, textAlign: "center", width: "100%", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{b.name}</span></button>;
    const row = (b) => <button key={b.id} type="button" onClick={() => pickBank(b)} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}><LinkBankLogo bank={b} size={34} /><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name}</span><span aria-hidden="true" style={{ color: T.inkFaint, fontWeight: 900 }}>›</span></button>;
    body = <>
      <LinkBankCard style={{ display: "flex", alignItems: "center", gap: 12 }}><span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 14, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏦</span><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, color: T.ink }}>Add money from it, send money to it</b><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>Accounts in your own name. We check the name on the account matches yours before saving.</span></span><FlagEmoji flag={country.flag} width={22} height={16} radius={3} /></LinkBankCard>
      <label htmlFor="link-bank-search" style={{ display: "flex", alignItems: "center", gap: 9, background: T.surface, borderRadius: 16, padding: "11px 14px", boxShadow: `inset 0 0 0 1.5px ${T.line}` }}><span aria-hidden="true" style={{ color: T.inkFaint, fontWeight: 900 }}>⌕</span><input id="link-bank-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your bank" autoComplete="off" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 15, fontWeight: 700, color: T.ink }} /></label>
      {hits ? <div style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{hits.length ? hits.map(row) : <div style={{ padding: 16, fontSize: 13, color: T.inkFaint, textAlign: "center", fontWeight: 700 }}>No bank by that name. Try its short name, like SBI.</div>}</div> : <>
        {sectionCap(`Popular in ${country.name}`)}
        <div data-testid="link-bank-popular" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 8px" }}>{popular.map((b, i) => tile({ ...b, ifsc: LINK_BANK_IFSC[b.name] || "" }, i))}</div>
        {india && <LinkBankCard onClick={() => go("upi")} label="Link by UPI ID instead" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}><LinkBankLogo bank={{ initials: "UPI", color: "#5F259F" }} size={36} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>Link by UPI ID instead</b><span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>name@okhdfcbank, 98…@ybl</span></span><span aria-hidden="true" style={{ color: T.inkFaint, fontWeight: 900 }}>›</span></LinkBankCard>}
        {all.length > 0 && <>{sectionCap("All banks")}<div data-testid="link-bank-all" style={{ borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{all.map(row)}</div></>}
      </>}
    </>;
  } else if (view === "verify" && bank) {
    const option = (key, icon, titleText, tag, text, steps, onPick) => <LinkBankCard testId={`link-bank-way-${key}`} onClick={onPick} label={titleText} style={{ padding: 16, boxShadow: key === "rupee" ? `inset 0 0 0 2px ${T.accent}, ${T.shadowCard}` : T.shadowCard }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{icon}</span><b style={{ flex: 1, fontSize: 15, color: T.ink }}>{titleText}</b>{tag ? <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "3px 8px", background: T.positiveSoft, color: T.positive }}>{tag}</span> : null}</div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45, marginTop: 8 }}>{text}</div><div style={{ display: "flex", gap: 6, marginTop: 10 }}>{steps.map((s, i) => <span key={s} style={{ flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: 800, color: T.inkSoft, background: T.surfaceAlt, borderRadius: 10, padding: "6px 2px" }}>{`${i + 1} ${s}`}</span>)}</div></LinkBankCard>;
    body = <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><LinkBankLogo bank={bank} size={48} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 16, color: T.ink }}>{bank.name}</b><span style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint }}>In your own name</span></span><button type="button" onClick={() => go("pick")} style={{ border: "none", background: "none", color: T.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Change</button></div>
      {sectionCap("Verify it's your account")}
      {option("rupee", "⚡", `Pay ${one} from this bank`, "Fastest", `Opens your UPI app. From your ${one} we get the account number, IFSC and the name — nothing to type. The ${one} lands in your GLOOBAL Bank.`, [`Pay ${one}`, "We read it", "Linked"], () => go("pay"))}
      {option("typed", "⌨", "Type account number & IFSC", "", `We send ${one} to the account. The bank answers with the name on it, and we check it's yours. The ${one} is ours — free for you.`, ["Type", `We send ${one}`, "Linked"], () => go("type"))}
      <LinkBankNote>🔒 Both are how banks check accounts ("penny drop"). Money only ever goes to accounts in your own name.</LinkBankNote>
    </>;
  } else if (view === "pay" && bank) {
    body = <>
      <LinkBankCard style={{ textAlign: "center", padding: 18 }}><div style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint }}>{`From your ${bank.name} account`}</div><div style={{ fontFamily: T.fontDisplay, fontSize: 40, fontWeight: 800, color: T.ink, marginTop: 4 }}>{bankMoneyFmt(1, ccy)}</div><div style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, marginTop: 2 }}>to <GloobalWordmark suffix=" Bank" /> · to verify</div></LinkBankCard>
      {sectionCap("Open with")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 9 }}>{LINK_BANK_UPI_APPS.map(([name, mark, color]) => <button key={name} type="button" data-testid={`link-bank-app-${name}`} disabled={Boolean(busy)} onClick={() => payRupee(name)} className="v2-tap" style={{ border: "none", borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, padding: "12px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: busy ? "default" : "pointer", fontFamily: "inherit", opacity: busy && busy !== name ? 0.5 : 1 }}><span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 13, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15 }}>{mark}</span><span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>{name}</span></button>)}</div>
      <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, fontWeight: 800, color: busy ? T.accent : T.inkSoft, padding: "6px 0" }}><span aria-hidden="true" className={busy ? "ab-spin" : undefined} style={{ width: 14, height: 14, borderRadius: "50%", border: `2.5px solid ${busy ? T.accent : T.line}`, borderTopColor: "transparent", display: "inline-block" }} />{busy ? `Waiting for your ${one}…` : `Pay from the ${bank.name} account you want to link — the ${one} tells us which one.`}</div>
      <LinkBankNote><b style={{ color: T.accent }}>Test mode.</b>{` No UPI app opens yet: tapping an app pays the ${one} here, as the bank would, and adds it to your GLOOBAL balance.`}</LinkBankNote>
    </>;
  } else if ((view === "paid" || view === "typed") && result && result.account) {
    const a = result.account;
    const matches = nameMatch(result.nameAtBank);
    body = <>
      <LinkBankNote tone="ok">{view === "paid" ? `✓ Got ${one} from your bank · UTR ${result.utr || "—"}` : `✓ ${one} sent to •••• ${a.last4} · the bank answered`}</LinkBankNote>
      <LinkBankKV rows={[
        ["Account", `•••• ${a.last4}`],
        a.code ? [india ? "IFSC" : "Bank code", a.code] : null,
        ["Name at the bank", result.nameAtBank],
        ["Your GLOOBAL name", myName || "—"],
        ["Result", matches || !myName ? "✓ Names match" : "✓ Checked", T.positive],
        view === "paid" ? [`Your ${one}`, "Added to GLOOBAL Bank", T.positive] : [`The ${one}`, "Ours · free for you"]
      ]} />
    </>;
    footer = <LinkBankButton testId="link-bank-continue" onClick={() => go("done")}>{`Done · ${a.bankName} •••• ${a.last4} linked`}</LinkBankButton>;
  } else if (view === "type") {
    const clean = (v) => v.replace(/[^\d]/g, "").slice(0, 18);
    const numOk = /^\d{9,18}$/.test(num);
    const sameOk = numOk && num2 === num;
    const codeOk = india ? /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code) : /^[A-Z0-9]{4,11}$/.test(code);
    const codeName = india && code.length >= 4 ? (Object.keys(LINK_BANK_IFSC).find((n) => LINK_BANK_IFSC[n] === code.slice(0, 4)) || "") : "";
    body = <>
      {bank ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}><LinkBankLogo bank={bank} size={40} /><b style={{ flex: 1, fontSize: 15, color: T.ink }}>{bank.name}</b></div> : null}
      {field("link-bank-number", "Account number", num.replace(/(\d{4})(?=\d)/g, "$1 "), (v) => setNum(clean(v)), { inputMode: "numeric", spaced: true })}
      {field("link-bank-number2", "Re-enter account number", num2.replace(/(\d{4})(?=\d)/g, "$1 "), (v) => setNum2(clean(v)), { inputMode: "numeric", spaced: true })}
      {num2.length >= num.length && num2 && !sameOk ? <LinkBankNote tone="bad">The two account numbers don't match.</LinkBankNote> : null}
      {field("link-bank-code", india ? "IFSC" : "Bank code", code, (v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11)), { spaced: true, placeholder: india ? "HDFC0001234" : "" })}
      {india && codeOk ? <LinkBankNote tone="ok">{`✓ ${codeName || IFSC_LABEL_FALLBACK(code)}`}</LinkBankNote> : null}
      <LinkBankNote>{`We send ${one} to this account. The bank answers with the name on it, and we check it's yours before saving.`}</LinkBankNote>
    </>;
    footer = <LinkBankButton testId="link-bank-save" disabled={busy || !sameOk || !codeOk} onClick={saveTyped}>{busy ? `Sending ${one}…` : `Send ${one} and link`}</LinkBankButton>;
  } else if (view === "upi") {
    const ok = /^[a-z0-9._-]{2,64}@[a-z]{2,32}$/.test(upiId.trim().toLowerCase());
    body = <>
      {field("link-bank-upi", "UPI ID", upiId, (v) => setUpiId(v.replace(/\s/g, "").slice(0, 80)), { placeholder: "name@okhdfcbank" })}
      <LinkBankNote>We check the name on this UPI ID matches yours before saving.</LinkBankNote>
    </>;
    footer = <LinkBankButton testId="link-bank-upi-save" disabled={busy || !ok} onClick={saveUpi}>{busy ? "Checking…" : "Link UPI ID"}</LinkBankButton>;
  } else if (view === "done" && result && result.account) {
    const a = result.account;
    body = <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 18, textAlign: "center" }}>
      <span aria-hidden="true" style={{ width: 76, height: 76, borderRadius: "50%", background: T.positiveSoft, color: T.positive, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 900 }}>✓</span>
      <div data-testid="link-bank-done" style={{ fontFamily: T.fontDisplay, fontSize: 21, fontWeight: 800, color: T.ink }}>{a.kind === "upi" ? `${a.upiId} is linked` : `${a.bankName} •••• ${a.last4} is linked`}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{`${a.holderName} · verified just now`}</div>
      <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>{[["add", "↙", "Add money from it"], ["send", "↗", "Send to it"]].map(([k, icon, label]) => <button key={k} type="button" onClick={() => setMoney(k)} className="v2-tap" style={{ border: "none", borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, padding: "16px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: "inherit" }}><span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 13, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 900 }}>{icon}</span><span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{label}</span></button>)}</div>
    </div>;
    footer = <LinkBankButton quiet onClick={() => { setResult(null); go("home"); }}>See your banks</LinkBankButton>;
  }

  return <div data-testid="link-bank" style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column" }}>
    <style>{`@keyframes abSpin { to { transform: rotate(360deg); } } .ab-spin { animation: abSpin 0.8s linear infinite; } @media (prefers-reduced-motion: reduce) { .ab-spin { animation: none; } }`}</style>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px", flexShrink: 0 }}><NavBackButton onClick={back} /><span style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span></div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>{body}{error ? <LinkBankNote tone="bad">{error}</LinkBankNote> : null}</div>
    {footer ? <div style={{ flexShrink: 0, padding: "10px 18px calc(14px + env(safe-area-inset-bottom, 0px))" }}>{footer}</div> : null}
    {money ? <BankMoneyScreen start={money} ccyCode={ccy} balance={balance} countryIso={country.iso} accountName={myName} onClose={() => { setMoney(null); load(); }} onToast={() => {}} onChanged={load} /> : null}
  </div>;
}

// A recognised IFSC prefix names its bank; anything else says only that the
// code is well formed — the bank's own answer is what checks it.
function IFSC_LABEL_FALLBACK(code) {
  return `IFSC ${code.slice(0, 4)} · looks right`;
}
