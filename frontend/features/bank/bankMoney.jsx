// src/features/bank/bankMoney.jsx
import { useState as useState74, useEffect as useEffect70, useRef as useRef43 } from "react";
// ── MONEY IN AND OUT OF GLOOBAL BANK ──────────────────────────────────────
//
// Add money (UPI, bank transfer, debit card), send money to your own bank,
// the history of both, and "Report a problem" on any of them.
//
// TEST MODE until a payment partner is connected: the balance moves for real
// and every record is real, but no UPI app opens and no outside bank is
// reached. The screens say so, every time, in a small strip at the top —
// see server/lib/bankTransfers.js for exactly what is simulated.

function bankMoneyFmt(amount, code) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : undefined, { style: "currency", currency: code || "USD", maximumFractionDigits: 2 }).format(n);
  } catch (e) {
    return `${code || ""} ${n.toFixed(2)}`;
  }
}
// HH:MM:SS, for the steps of a transfer.
function bankMoneyClock(at) {
  if (!at) return "";
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function bankMoneyTime(at) {
  if (!at) return "";
  const d = new Date(at);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
// The exact moment, to the second, 24-hour: "Sun, 2 Nov 2026 · 04:54:12".
function bankMoneyStamp(at) {
  if (!at) return "";
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  const day = d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${day} \xB7 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function bankMoneyDay(at) {
  const d = new Date(at);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}
var BANK_MONEY_STATUS = {
  credited: { label: "Credited", bg: "positiveSoft", fg: "positive" },
  processing: { label: "Processing", bg: "warnSoft", fg: "warn" },
  returned: { label: "Returned", bg: "negativeSoft", fg: "negative" },
  failed: { label: "Failed", bg: "negativeSoft", fg: "negative" }
};
var BANK_CASE_REASONS = [
  ["not_credited", "The money hasn't arrived"],
  ["wrong_amount", "The amount is wrong"],
  ["not_mine", "I didn't make this"],
  ["returned", "Why was it returned?"],
  ["other", "Something else"]
];

function BankMoneyPill({ status, text }) {
  const s = BANK_MONEY_STATUS[status] || BANK_MONEY_STATUS.processing;
  const bg = T[s.bg] || hexToRgba(T.accent, 0.12);
  const fg = T[s.fg] || T.accent;
  return <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: bg, color: fg }}>{text || s.label}</span>;
}

function BankMoneyTestStrip() {
  return <div data-testid="bank-test-mode" style={{ fontSize: 11.5, fontWeight: 700, color: T.inkSoft, background: hexToRgba(T.accent, 0.08), borderRadius: 12, padding: "8px 12px", lineHeight: 1.45 }}>
    <b style={{ color: T.accent }}>Test mode.</b> Your GLOOBAL balance really changes; no outside bank or UPI app is used yet.
  </div>;
}

function BankMoneyKV({ rows }) {
  return <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rows.filter(Boolean).map(([k, v, color], i) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 14px", borderTop: i ? `1px solid ${T.line}` : "none", fontSize: 13 }}><span style={{ color: T.inkFaint, fontWeight: 600 }}>{k}</span><b style={{ color: color || T.ink, textAlign: "right", overflowWrap: "anywhere" }}>{v}</b></div>)}</div>;
}

function BankMoneySteps({ steps }) {
  return <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px" }}>{(steps || []).map((s, i) => {
    const last = i === steps.length - 1;
    const color = s.state === "failed" ? T.negative : s.state === "waiting" ? T.accent : T.positive;
    return <div key={s.key + i} style={{ display: "flex", gap: 12 }}><span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>{s.state === "failed" ? "!" : s.state === "waiting" ? "…" : "✓"}</span>{!last && <span style={{ width: 2, flex: 1, minHeight: 22, margin: "3px 0", background: s.state === "done" ? T.positive : T.line }} />}</span><span style={{ paddingBottom: last ? 0 : 12 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{s.label}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>{[s.at ? bankMoneyClock(s.at) : "", s.detail].filter(Boolean).join(" \xB7 ")}</span></span></div>;
  })}</div>;
}

// THE REFERENCE, IN ITS OWN BOX. Twenty symbols squeezed into the right
// half of a table row wrapped onto two ragged lines; on their own, under
// the details, they read whole, with the exact date and time to the second
// and a copy button — what a person quotes when something needs checking.
// Twenty symbols read best as two lines of ten, each in two fives —
// the way a card number is grouped, so it can be read out and checked.
function bankMoneyRefLines(value) {
  const chars = Array.from(String(value || ""));
  const groups = [];
  for (let i = 0; i < chars.length; i += 5) groups.push(chars.slice(i, i + 5).join(""));
  const lines = [];
  for (let i = 0; i < groups.length; i += 2) lines.push(groups.slice(i, i + 2));
  return lines;
}
function BankMoneyRefBox({ label, value, at, atLabel, onCopy, testId }) {
  if (!value) return null;
  return <div data-testid={testId} style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkFaint }}>{label}</span>{onCopy && <button type="button" onClick={() => onCopy(value)} aria-label={`Copy ${label}`} className="v2-tap" style={{ border: "none", borderRadius: 10, padding: "6px 10px", background: hexToRgba(T.accent, 0.1), color: T.accent, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Copy</button>}</div><span data-testid={testId ? `${testId}-value` : undefined} aria-label={value} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 19, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.4 }}>{bankMoneyRefLines(value).map((line, i) => <span key={i} aria-hidden="true" style={{ display: "flex", gap: 14, whiteSpace: "nowrap" }}>{line.map((group, k) => <span key={k} style={{ letterSpacing: 4 }}>{group}</span>)}</span>)}</span>{at && <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, fontSize: 12.5 }}><span style={{ color: T.inkFaint, fontWeight: 600 }}>{atLabel || "Date and time"}</span><b data-testid={testId ? `${testId}-at` : undefined} style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}>{bankMoneyStamp(at)}</b></div>}</div>;
}

function BankMoneyButton({ children, onClick, disabled, quiet }) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="v2-tap"
    style={{ width: "100%", height: 52, borderRadius: 16, border: "none", cursor: disabled ? "default" : "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", background: quiet ? T.surface : disabled ? T.surfaceAlt : T.gradButton, color: quiet ? T.ink : disabled ? T.inkFaint : "#fff", boxShadow: quiet ? T.shadowCard : disabled ? "none" : `0 8px 18px ${hexToRgba(T.accent, 0.28)}` }}
  >{children}</button>;
}

// ── WHAT STAYS IN, ON THE SEND SCREEN (0208) ───────────────────────────
// The sum written out (balance − used = can go), the reason in one line,
// and a chip that fills in the most. Typing more turns the amount's line
// red here, before the PIN, so nobody is refused after it.
function BankEssentialsHeld({ balance, held, canGo, value, money, onMost }) {
  const over = value > canGo + 0.004;
  const row = (k, v, color, strong) => <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 14px", borderTop: strong || k !== "In your GLOOBAL Bank" ? `1px solid ${T.line}` : "none", fontSize: strong ? 14 : 13, fontWeight: strong ? 900 : 700, color: strong ? T.ink : T.inkSoft }}><span>{k}</span><b style={{ color: color || T.ink, fontWeight: 900, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{v}</b></div>;
  return <div data-testid="bank-essentials-held" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>
      {row("In your GLOOBAL Bank", money(balance))}
      {row("Used from Essentials so far", `− ${money(held)}`, "#0E7490")}
      {row("Can go to your bank", money(canGo), canGo > 0 ? "#C2410C" : T.inkFaint, true)}
    </div>
    <div role={over ? "alert" : void 0} style={{ display: "flex", gap: 9, alignItems: "flex-start", borderRadius: 14, padding: "10px 12px", background: over ? T.negativeSoft : "rgba(14,116,144,0.10)", color: over ? T.negative : "#155E75", fontSize: 12.5, fontWeight: 700, lineHeight: 1.45 }}><span aria-hidden="true">{over ? "!" : "\u21BA"}</span><span>{over
      ? (canGo > 0 ? `Only ${money(canGo)} can go to another bank right now. ` : "Nothing can go to another bank yet. ")
      : ""}{`${money(held)} stays in GLOOBAL because you already used it from Essentials. You can still pay anyone or any shop with it.`}</span></div>
    {canGo > 0 && <button type="button" onClick={onMost} className="v2-tap" data-testid="bank-send-most" style={{ alignSelf: "center", border: "none", borderRadius: 999, padding: "8px 14px", background: "rgba(194,65,12,0.12)", color: "#9A3412", fontWeight: 900, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>{`Send the most: ${money(canGo)}`}</button>}
  </div>;
}

function BankMoneyScreen({ start = "history", ccyCode = "INR", balance = 0, countryIso = "", accountName = "", onClose, onToast, onChanged }) {
  const [screen, setScreen] = useState74(start);
  const [history, setHistory] = useState74(null);
  const [accounts, setAccounts] = useState74([]);
  const [amount, setAmount] = useState74("");
  const [method, setMethod] = useState74("upi");
  const [accountId, setAccountId] = useState74(null);
  const [pinValue, setPinValue] = useState74("");
  const [busy, setBusy] = useState74(false);
  const [error, setError] = useState74("");
  const [transfer, setTransfer] = useState74(null);
  const [filter, setFilter] = useState74("all");
  const [link, setLink] = useState74({ kind: "bank", accountNumber: "", confirmNumber: "", code: "", bankName: "", upiId: "" });
  const [caseReason, setCaseReason] = useState74("not_credited");
  const [caseNote, setCaseNote] = useState74("");
  const [caseText, setCaseText] = useState74("");
  // My Essentials (0208): what this account has used stays in GLOOBAL, so
  // only the balance above it can go to an outside bank. Null until known;
  // the send screen then behaves as before and the server still checks.
  const [essentials, setEssentials] = useState74(null);
  const idem = useRef43("");
  const india = String(countryIso || "").toUpperCase() === "IN";
  const money = (n) => bankMoneyFmt(n, ccyCode);
  const copyRef = (value) => {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(value).then(() => onToast && onToast("Reference copied"), () => {});
    } catch (e) { /* it is on screen either way */ }
  };

  const loadHistory = async () => {
    try {
      setHistory(await GloobalApi.getBankTransfers());
    } catch (e) {
      setHistory((h) => h || { transfers: [], summary: { moneyIn: 0, moneyOut: 0, net: 0 }, limits: null });
    }
  };
  const loadAccounts = async () => {
    try {
      const list = await GloobalApi.getLinkedAccounts();
      setAccounts(list);
      const first = list.find((a) => a.status === "active");
      setAccountId((cur) => cur && list.some((a) => a.id === cur && a.status === "active") ? cur : first ? first.id : null);
    } catch (e) { /* the send screen says so */ }
  };
  const loadEssentials = async () => {
    try { setEssentials(await GloobalApi.getEssentials()); } catch (e) { /* the server still checks */ }
  };
  useEffect70(() => {
    loadHistory();
    loadAccounts();
    loadEssentials();
    // The floating map button stands aside, as on the other bank screens.
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  // A transfer still at the bank: look again every 3 seconds.
  useEffect70(() => {
    if (!transfer || transfer.status !== "processing" || (screen !== "onway" && screen !== "transfer")) return undefined;
    const t = setInterval(async () => {
      try {
        const fresh = await GloobalApi.getBankTransfer(transfer.ref);
        if (fresh) setTransfer(fresh);
        if (fresh && fresh.status !== "processing") {
          if (onChanged) onChanged();
          loadHistory();
        }
      } catch (e) { /* try again next tick */ }
    }, 3000);
    return () => clearInterval(t);
  }, [transfer && transfer.ref, transfer && transfer.status, screen]);

  const go = (next) => { setError(""); setScreen(next); };
  const value = Math.round(Number(amount) * 100) / 100;
  const amountOk = value > 0 && /^\d+(\.\d{1,2})?$/.test(String(amount).trim());
  // What can go out: the balance above what stays in. Without the figure
  // (offline, older server) it is the balance, as it always was.
  const held = essentials && Number(essentials.held) > 0 ? Number(essentials.held) : 0;
  const canGo = held > 0 ? Math.max(0, Math.round((Number(balance) - held) * 100) / 100) : Number(balance);

  const addMoney = async () => {
    setBusy(true);
    setError("");
    try {
      if (!idem.current) idem.current = `in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t = await GloobalApi.addMoney({ amount: value, method, idempotencyKey: idem.current });
      idem.current = "";
      setTransfer(t);
      if (onChanged) onChanged();
      loadHistory();
      go("added");
    } catch (e) {
      setError((e && e.message) || "Couldn't add money. Nothing was charged.");
    } finally {
      setBusy(false);
    }
  };
  const sendOut = async () => {
    setBusy(true);
    setError("");
    try {
      if (!idem.current) idem.current = `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const t = await GloobalApi.sendToBank({ amount: value, accountId, pin: pinValue, idempotencyKey: idem.current });
      idem.current = "";
      setPinValue("");
      setTransfer(t);
      if (onChanged) onChanged();
      loadHistory();
      loadEssentials();
      go("onway");
    } catch (e) {
      setPinValue("");
      setError((e && e.message) || "Couldn't send. Nothing was taken.");
    } finally {
      setBusy(false);
    }
  };
  const saveAccount = async () => {
    setBusy(true);
    setError("");
    try {
      const body = link.kind === "upi" ? { kind: "upi", upiId: link.upiId } : { kind: "bank", accountNumber: link.accountNumber, confirmNumber: link.confirmNumber, code: link.code, bankName: link.bankName };
      const r = await GloobalApi.linkBankAccount(body);
      if (onToast) onToast(`Saved \xB7 name at the bank: ${r.nameAtBank}`);
      await loadAccounts();
      if (r.account) setAccountId(r.account.id);
      setLink({ kind: "bank", accountNumber: "", confirmNumber: "", code: "", bankName: "", upiId: "" });
      go("send");
    } catch (e) {
      setError((e && e.message) || "Couldn't save that account.");
    } finally {
      setBusy(false);
    }
  };
  const openTransfer = async (row) => {
    setTransfer(row);
    go("transfer");
    try {
      const fresh = await GloobalApi.getBankTransfer(row.ref);
      if (fresh) setTransfer(fresh);
    } catch (e) { /* the row is enough to show */ }
  };
  const openCase = async () => {
    setBusy(true);
    try {
      const c = await GloobalApi.openTransferCase(transfer.ref, { reason: caseReason, note: caseNote.trim() });
      setTransfer((t) => ({ ...t, case: c }));
      setCaseNote("");
      go("case");
    } catch (e) {
      setError((e && e.message) || "Couldn't open a case right now.");
    } finally {
      setBusy(false);
    }
  };
  const sendCaseMessage = async () => {
    const text = caseText.trim();
    if (!text || !transfer || !transfer.case) return;
    setBusy(true);
    try {
      const c = await GloobalApi.sendTransferCaseMessage(transfer.case.ref, text);
      setTransfer((t) => ({ ...t, case: c }));
      setCaseText("");
    } catch (e) {
      setError((e && e.message) || "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  };
  const setCaseStatus = async (status) => {
    try {
      const c = await GloobalApi.setTransferCaseStatus(transfer.case.ref, status);
      setTransfer((t) => ({ ...t, case: c }));
    } catch (e) {
      setError((e && e.message) || "Couldn't update the case.");
    }
  };
  const shareReceipt = () => {
    if (!transfer) return;
    const text = [
      `GLOOBAL Bank \xB7 ${transfer.direction === "in" ? "Money added" : "Sent to your bank"}`,
      `${money(transfer.amount)} \xB7 ${(BANK_MONEY_STATUS[transfer.status] || {}).label || transfer.status}`,
      `${transfer.direction === "in" ? "From" : "To"}: ${transfer.counterpart && transfer.counterpart.label}`,
      transfer.externalRef ? `${transfer.direction === "in" ? "Reference" : "UTR"}: ${transfer.externalRef}` : "",
      `GLOOBAL reference: ${transfer.ref}`,
      `Date and time: ${bankMoneyStamp(transfer.createdAt)}`,
      transfer.testMode ? "Test mode" : ""
    ].filter(Boolean).join("\n");
    if (navigator.share) navigator.share({ title: "GLOOBAL Bank receipt", text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => onToast && onToast("Receipt copied"), () => {});
  };

  const back = () => {
    const parent = { upi: "add", details: "add", added: "history", link: "send", confirm: "send", onway: "history", transfer: "history", newcase: "transfer", case: "transfer" }[screen];
    if (parent && !(screen === "added" && start === "add") && !(screen === "onway" && start === "send")) go(parent);
    else onClose();
  };
  const titles = { add: "Add money", upi: "Pay with UPI", details: "Your account details", added: "Money added", send: "Send to your bank", link: "Add a bank account", confirm: "Confirm", onway: "On its way", history: "Bank transfers", transfer: transfer && transfer.direction === "in" ? "Money added" : "Transfer to your bank", newcase: "Report a problem", case: "Your case" };

  const ccySign = (money(0).match(/^[^\d\s.,]+/) || [ccyCode])[0];
  const amountBox = (label) => <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><span style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint }}>{label}</span><span style={{ display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}><span aria-hidden="true" style={{ fontSize: 26, fontWeight: 700, color: T.inkSoft, fontFamily: T.fontDisplay }}>{ccySign}</span><input
    id="bank-money-amount"
    inputMode="decimal"
    value={amount}
    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
    placeholder="0"
    aria-label="Amount"
    style={{ width: `${Math.max(2, String(amount).length + 1)}ch`, maxWidth: "80%", border: "none", background: "transparent", textAlign: "center", fontSize: 44, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay, outline: "none" }}
  /></span><div style={{ display: "flex", gap: 8 }}>{(ccyCode === "INR" ? [500, 1000, 2000] : [10, 50, 100]).map((n) => <button key={n} type="button" onClick={() => setAmount(String(n))} className="v2-tap" style={{ border: "none", padding: "8px 14px", borderRadius: 999, background: T.surface, boxShadow: T.shadowCard, fontWeight: 800, fontSize: 13, color: T.ink, cursor: "pointer" }}>{money(n).replace(/\.00$/, "")}</button>)}</div></div>;

  const radioRow = (key, on, onPick, icon, title, sub, extra) => <button key={key} type="button" onClick={onPick} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", textAlign: "left", cursor: "pointer" }}><span style={{ width: 40, height: 40, borderRadius: 13, background: hexToRgba(T.accent, 0.1), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{title}{extra}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>{sub}</span></span><span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: on ? `7px solid ${T.accent}` : `2px solid ${T.line}`, boxSizing: "border-box", flexShrink: 0 }} /></button>;

  let body = null;
  if (screen === "add") {
    const left = history && history.limits ? history.limits.leftToday : null;
    body = <>{amountBox(`To GLOOBAL Bank \xB7 balance ${money(balance)}`)}<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{[
      radioRow("upi", method === "upi", () => setMethod("upi"), "⚡", "UPI", "Any UPI app on this phone", <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, padding: "3px 7px", borderRadius: 99, background: T.positiveSoft, color: T.positive }}>INSTANT · FREE</span>),
      radioRow("bank", method === "bank", () => setMethod("bank"), "\u{1F3E6}", "Bank transfer", "IMPS / NEFT to your GLOOBAL account"),
      radioRow("card", method === "card", () => setMethod("card"), "\u{1F4B3}", "Debit card", "Visa, Mastercard, RuPay")
    ]}</div><div style={{ fontSize: 11.5, lineHeight: 1.5, fontWeight: 600, color: T.inkFaint, padding: "0 4px" }}>Only from an account in your own name{accountName ? <>: <b style={{ color: T.ink }}>{accountName}</b></> : ""}.{left !== null ? ` ${money(left)} left to add today.` : ""}</div></>;
  } else if (screen === "upi") {
    body = <><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 18, textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: T.inkFaint }}>Paying</div><div style={{ fontSize: 36, fontWeight: 700, fontFamily: T.fontDisplay, color: T.ink }}>{money(value)}</div><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>to GLOOBAL Bank{accountName ? ` \xB7 ${accountName}` : ""}</div></div><div style={{ borderRadius: T.radiusLg, background: hexToRgba(T.accent, 0.06), padding: 14, display: "flex", alignItems: "center", gap: 12 }}><span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${hexToRgba(T.accent, 0.3)}`, borderTopColor: T.accent, animation: "pureSpin 1s linear infinite" }} /><span><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>Waiting for your UPI app…</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>In test mode no app opens. Approve below as if you'd entered your UPI PIN.</span></span></div></>;
  } else if (screen === "details") {
    body = <><div style={{ fontSize: 12.5, lineHeight: 1.5, fontWeight: 600, color: T.inkSoft, padding: "0 4px" }}>Send money by IMPS or NEFT from any bank account in your name. It lands in GLOOBAL Bank.</div><BankMoneyKV rows={[["Name", accountName || "You"], ["Account number", "Given by our partner bank"], [india ? "IFSC" : "Bank code", "Given by our partner bank"], ["Bank", "Our partner bank"]]} /><div style={{ fontSize: 12, lineHeight: 1.5, fontWeight: 600, color: T.inkSoft, background: hexToRgba(T.accent, 0.06), borderRadius: 14, padding: 14 }}>Other banks can't send to a GLOOBAL ID, so a partner bank will give your account a normal account number{india ? " and IFSC" : ""}. Until then, use the button below to act as the bank in test mode.</div></>;
  } else if (screen === "added" && transfer) {
    body = <><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 6 }}><span style={{ width: 70, height: 70, borderRadius: "50%", background: T.positiveSoft, color: T.positive, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900 }}>{"✓"}</span><span style={{ fontSize: 36, fontWeight: 700, fontFamily: T.fontDisplay, color: T.positive }}>+{money(transfer.amount)}</span><span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft }}>added to GLOOBAL Bank</span></div><BankMoneyKV rows={[["New balance", money(transfer.balanceAfter)], ["From", transfer.counterpart && transfer.counterpart.label], ["Reference", transfer.externalRef], ["Fee", "Free", T.positive]]} /><BankMoneyRefBox testId="bank-ref" label="GLOOBAL reference" value={transfer.ref} at={transfer.settledAt || transfer.createdAt} atLabel="Added on" onCopy={copyRef} /></>;
  } else if (screen === "send") {
    body = <>{amountBox(held > 0 ? `From GLOOBAL Bank \xB7 can go out ${money(canGo)}` : `From GLOOBAL Bank \xB7 available ${money(balance)}`)}{held > 0 && <BankEssentialsHeld balance={balance} held={held} canGo={canGo} value={amountOk ? value : 0} money={money} onMost={() => setAmount(String(canGo))} />}<div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkFaint, padding: "0 4px" }}>To</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{accounts.filter((a) => a.status === "active").map((a) => radioRow(a.id, accountId === a.id, () => setAccountId(a.id), a.kind === "upi" ? "⚡" : "\u{1F3E6}", a.label, `${a.holderName} \xB7 verified`))}<button type="button" onClick={() => go("link")} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", textAlign: "left", cursor: "pointer" }}><span style={{ width: 40, height: 40, borderRadius: 13, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>+</span><span><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>Add a bank account</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>In your own name</span></span></button></div><BankMoneyKV rows={[["Speed", "Instant (IMPS)"], ["Fee", "Free", T.positive], ["Arrives", "Usually within 2 minutes"]]} /></>;
  } else if (screen === "link") {
    const field = (key, label, props = {}) => <label key={key} style={{ display: "block", background: T.surface, borderRadius: 14, padding: "10px 14px", boxShadow: T.shadowCard }}><span style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.inkFaint }}>{label}</span><input id={`bank-link-${key}`} value={link[key]} onChange={(e) => setLink((l) => ({ ...l, [key]: e.target.value }))} style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontSize: 15.5, fontWeight: 700, color: T.ink, marginTop: 2 }} {...props} /></label>;
    const ifscBank = india && /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(link.code.trim());
    body = <><div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 14, padding: 4, gap: 4 }}>{[["bank", "Bank account"], ["upi", "UPI ID"]].map(([k, l]) => <button key={k} type="button" onClick={() => setLink((x) => ({ ...x, kind: k }))} style={{ flex: 1, border: "none", borderRadius: 11, padding: "9px 4px", fontWeight: 800, fontSize: 13, cursor: "pointer", background: link.kind === k ? T.surface : "transparent", color: link.kind === k ? T.ink : T.inkSoft }}>{l}</button>)}</div>{link.kind === "upi" ? field("upiId", "UPI ID", { placeholder: "name@bank", autoCapitalize: "off" }) : <>{field("accountNumber", "Account number", { inputMode: "numeric" })}{field("confirmNumber", "Re-enter account number", { inputMode: "numeric" })}{field("code", india ? "IFSC" : "Bank code", { autoCapitalize: "characters", placeholder: india ? "HDFC0001234" : "" })}{ifscBank && <div style={{ fontSize: 11.5, fontWeight: 700, color: T.positive, padding: "0 4px" }}>{"✓"} IFSC looks right</div>}{!india && field("bankName", "Bank name")}</>}<div style={{ fontSize: 11.5, lineHeight: 1.5, fontWeight: 600, color: T.inkFaint, padding: "0 4px" }}>We check the account holder's name with the bank before saving. Money only goes to accounts in your own name.</div></>;
  } else if (screen === "confirm") {
    const acct = accounts.find((a) => a.id === accountId);
    body = <><BankMoneyKV rows={[["Send", money(value)], ["To", acct ? `${acct.label} \xB7 ${acct.holderName}` : ""], ["Fee", "Free", T.positive], ["Balance after", money(Number(balance) - value)]]} /><div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkSoft, marginTop: 6 }}>Enter your GLOOBAL PIN</div><div aria-label={`${pinValue.length} digits entered`} style={{ display: "flex", gap: 12, justifyContent: "center" }}>{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < pinValue.length ? T.ink : T.line }} />)}</div><div style={{ marginTop: "auto" }}><BankKeypad onDigit={(d) => setPinValue((p) => (p.length < 6 ? p + d : p))} onDelete={() => setPinValue((p) => p.slice(0, -1))} /></div></>;
  } else if ((screen === "onway" || screen === "transfer") && transfer) {
    const out = transfer.direction === "out";
    body = <><div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><span style={{ fontSize: 34, fontWeight: 700, fontFamily: T.fontDisplay, color: transfer.status === "returned" ? T.inkFaint : out ? T.ink : T.positive }}>{out ? "−" : "+"}{money(transfer.amount)}</span><BankMoneyPill status={transfer.status} text={transfer.status === "processing" ? "Processing \xB7 usually within 2 minutes" : transfer.status === "returned" ? "Returned \xB7 back in your balance" : undefined} /></div><BankMoneySteps steps={transfer.steps} /><BankMoneyKV rows={[[out ? "From" : "To", "GLOOBAL Bank"], [out ? "To" : "From", `${transfer.counterpart.label}${transfer.counterpart.holderName ? ` \xB7 ${transfer.counterpart.holderName}` : ""}`], transfer.counterpart.code ? [india ? "IFSC" : "Bank code", transfer.counterpart.code] : null, [out ? "UTR" : "Reference", transfer.externalRef], ["Fee", "Free", T.positive]]} /><BankMoneyRefBox testId="bank-ref" label="GLOOBAL reference" value={transfer.ref} at={transfer.createdAt} atLabel={out ? "Sent on" : "Added on"} onCopy={copyRef} />{transfer.case && <button type="button" onClick={() => go("case")} className="v2-tap" style={{ border: "none", borderRadius: 14, padding: "12px 14px", background: hexToRgba(T.accent, 0.08), color: T.ink, textAlign: "left", cursor: "pointer", fontWeight: 800, fontSize: 13.5 }}>Your case · {transfer.case.status === "resolved" ? "solved" : transfer.case.status === "escalated" ? "with our payments team" : "we're on it"} {"›"}</button>}</>;
  } else if (screen === "newcase" && transfer) {
    body = <><div style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, padding: "0 4px" }}>About {transfer.direction === "in" ? "money added" : "your transfer"} of <b style={{ color: T.ink }}>{money(transfer.amount)}</b> · {bankMoneyDay(transfer.createdAt)} {bankMoneyTime(transfer.createdAt)}</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{BANK_CASE_REASONS.filter(([k]) => k !== "returned" || transfer.status === "returned").map(([k, l], i) => <button key={k} type="button" onClick={() => setCaseReason(k)} className="v2-row" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, color: T.ink }}>{l}<span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: caseReason === k ? `7px solid ${T.accent}` : `2px solid ${T.line}`, boxSizing: "border-box" }} /></button>)}</div><textarea id="bank-case-note" value={caseNote} onChange={(e) => setCaseNote(e.target.value.slice(0, 280))} placeholder="Anything else we should know (optional)" rows={3} style={{ width: "100%", boxSizing: "border-box", borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, padding: 12, fontSize: 14, fontFamily: "inherit", color: T.ink, resize: "none" }} /><div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, padding: "0 4px", lineHeight: 1.5 }}>The case carries every reference of this transfer, so you don't need to find them.</div></>;
  } else if (screen === "case" && transfer && transfer.case) {
    const c = transfer.case;
    body = <><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>About {money(transfer.amount)}</span><BankMoneyPill status={c.status === "resolved" ? "credited" : c.status === "escalated" ? "returned" : "processing"} text={c.status === "resolved" ? "Solved" : c.status === "escalated" ? "With our payments team" : "We're on it"} /></div><BankMoneyRefBox testId="bank-case-ref" label="Case reference" value={c.ref} at={c.createdAt} atLabel="Opened on" onCopy={copyRef} /><div data-testid="bank-case-messages" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{c.messages.map((m, i) => <div key={i} style={{ alignSelf: m.from === "you" ? "flex-end" : "flex-start", maxWidth: "86%", borderRadius: 16, padding: "10px 12px", background: m.from === "you" ? T.accent : T.surface, color: m.from === "you" ? "#fff" : T.ink, boxShadow: T.shadowCard, fontSize: 13.5, lineHeight: 1.45 }}>{m.from === "gloobal" && <span style={{ display: "block", fontSize: 11, fontWeight: 800, color: T.accent, marginBottom: 3 }}>GLOOBAL</span>}{m.text}<span style={{ display: "block", fontSize: 10.5, opacity: 0.7, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{bankMoneyStamp(m.at)}</span></div>)}</div>{c.status !== "resolved" ? <div style={{ display: "flex", gap: 8 }}><input id="bank-case-text" value={caseText} onChange={(e) => setCaseText(e.target.value.slice(0, 600))} placeholder="Write to us" style={{ flex: 1, minWidth: 0, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, padding: "12px 14px", fontSize: 14, color: T.ink, outline: "none" }} /><button type="button" onClick={sendCaseMessage} disabled={busy || !caseText.trim()} className="v2-tap" style={{ border: "none", borderRadius: 14, padding: "0 16px", background: caseText.trim() ? T.accent : T.surfaceAlt, color: caseText.trim() ? "#fff" : T.inkFaint, fontWeight: 800, cursor: "pointer" }}>Send</button></div> : null}</>;
  } else if (screen === "history") {
    const rows = (history && history.transfers || []).filter((r) => filter === "all" || (filter === "in" && r.direction === "in") || (filter === "out" && r.direction === "out") || r.status === filter);
    const s = history && history.summary || { moneyIn: 0, moneyOut: 0, net: 0 };
    const groups = [];
    for (const r of rows) {
      const day = bankMoneyDay(r.createdAt);
      if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day, rows: [] });
      groups[groups.length - 1].rows.push(r);
    }
    body = <><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard }}><div style={{ padding: "12px 14px 4px", fontSize: 14, fontWeight: 800, color: T.ink }}>{new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>{[["Money in", s.moneyIn, T.positive], ["Money out", s.moneyOut, T.ink], ["Net", s.net, T.ink]].map(([l, v, col], i) => <div key={l} style={{ padding: "8px 8px 12px", textAlign: "center", borderLeft: i ? `1px solid ${T.line}` : "none" }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}>{l}</span><b data-testid={`bank-summary-${i}`} style={{ fontSize: 15.5, fontFamily: T.fontDisplay, color: col }}>{l === "Net" && v > 0 ? "+" : ""}{money(v)}</b></div>)}</div></div><div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none" }}>{[["all", "All"], ["in", "Money in"], ["out", "Money out"], ["processing", "Processing"], ["returned", "Returned"]].map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} style={{ flexShrink: 0, border: "none", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", background: filter === k ? T.ink : T.surface, color: filter === k ? T.bg : T.inkSoft, boxShadow: T.shadowCard }}>{l}</button>)}</div>{history === null ? <div style={{ textAlign: "center", fontSize: 13, color: T.inkFaint, padding: 20 }}>Loading…</div> : !groups.length ? <div style={{ textAlign: "center", fontSize: 13, color: T.inkFaint, padding: 20 }}>No bank transfers {filter === "all" ? "this month" : "here"} yet.</div> : groups.map((g) => <div key={g.day} style={{ display: "flex", flexDirection: "column", gap: 6 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkFaint, padding: "4px 4px 0" }}>{g.day}</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{g.rows.map((r, i) => <button key={r.ref} type="button" onClick={() => openTransfer(r)} className="v2-row" data-testid="bank-transfer-row" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", textAlign: "left", cursor: "pointer" }}><span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, background: r.direction === "in" ? T.positiveSoft : hexToRgba(T.accent, 0.12), color: r.direction === "in" ? T.positive : T.accent }}>{r.direction === "in" ? "↙" : "↗"}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{r.direction === "in" ? "From " : "To "}{r.counterpart && r.counterpart.label}</span><span style={{ display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint }}>{(r.method || "").toUpperCase()} · {bankMoneyTime(r.createdAt)}</span><BankMoneyPill status={r.status} text={r.status === "returned" && r.returnReason ? `Returned \xB7 ${r.returnReason.toLowerCase()}` : undefined} /></span><b style={{ fontSize: 14, color: r.status === "returned" ? T.inkFaint : r.direction === "in" ? T.positive : T.ink }}>{r.direction === "in" ? "+" : "−"}{money(r.amount)}</b></button>)}</div></div>)}</>;
  }

  let footer = null;
  if (screen === "add") footer = <BankMoneyButton disabled={!amountOk || busy} onClick={() => (method === "upi" ? go("upi") : method === "bank" ? go("details") : addMoney())}>{busy ? "One moment…" : `Add ${amountOk ? money(value) : "money"} →`}</BankMoneyButton>;
  else if (screen === "upi") footer = <BankMoneyButton disabled={busy} onClick={addMoney}>{busy ? "One moment…" : "Approve (test UPI)"}</BankMoneyButton>;
  else if (screen === "details") footer = <BankMoneyButton disabled={busy || !amountOk} onClick={addMoney}>{busy ? "One moment…" : `I've sent ${amountOk ? money(value) : ""} (test)`}</BankMoneyButton>;
  else if (screen === "added") footer = <div style={{ display: "flex", gap: 10 }}><BankMoneyButton quiet onClick={shareReceipt}>Share receipt</BankMoneyButton><BankMoneyButton onClick={() => { setAmount(""); go("history"); }}>Done</BankMoneyButton></div>;
  else if (screen === "send") footer = <BankMoneyButton disabled={!amountOk || !accountId || value > Number(balance) || value > canGo + 0.004} onClick={() => go("confirm")}>{value > Number(balance) ? "More than your balance" : value > canGo + 0.004 ? (canGo > 0 ? `The most you can send is ${money(canGo)}` : "Nothing can go out yet") : "Continue →"}</BankMoneyButton>;
  else if (screen === "link") footer = <BankMoneyButton disabled={busy} onClick={saveAccount}>{busy ? "Checking with the bank…" : "Save account"}</BankMoneyButton>;
  else if (screen === "confirm") footer = <BankMoneyButton disabled={busy || pinValue.length < 4} onClick={sendOut}>{busy ? "Sending…" : `Send ${money(value)}`}</BankMoneyButton>;
  else if (screen === "onway") footer = <BankMoneyButton onClick={() => { setAmount(""); go("history"); }}>Done</BankMoneyButton>;
  else if (screen === "transfer" && transfer) footer = <div style={{ display: "flex", gap: 10 }}><BankMoneyButton quiet onClick={() => (transfer.case ? go("case") : go("newcase"))}>{transfer.case ? "Your case" : "Report a problem"}</BankMoneyButton><BankMoneyButton onClick={shareReceipt}>Share receipt</BankMoneyButton></div>;
  else if (screen === "newcase") footer = <BankMoneyButton disabled={busy} onClick={openCase}>{busy ? "Opening…" : "Open a case"}</BankMoneyButton>;
  else if (screen === "case" && transfer && transfer.case) footer = transfer.case.status === "resolved" ? <BankMoneyButton quiet onClick={() => setCaseStatus("open")}>Open it again</BankMoneyButton> : <BankMoneyButton quiet onClick={() => setCaseStatus("resolved")}>Mark as solved</BankMoneyButton>;
  else if (screen === "history") footer = <div style={{ display: "flex", gap: 10 }}><BankMoneyButton quiet onClick={() => { setAmount(""); go("send"); }}>Send to bank</BankMoneyButton><BankMoneyButton onClick={() => { setAmount(""); go("add"); }}>Add money</BankMoneyButton></div>;

  return <div data-testid="bank-money" style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px", flexShrink: 0 }}><NavBackButton onClick={back} /><span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{titles[screen]}</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 14px", display: "flex", flexDirection: "column", gap: 12 }}><BankMoneyTestStrip />{body}{error && <div role="alert" style={{ fontSize: 13, fontWeight: 700, color: T.negative, background: T.negativeSoft, borderRadius: 12, padding: "10px 12px" }}>{error}</div>}</div>{footer && <div style={{ flexShrink: 0, padding: "10px 18px calc(14px + env(safe-area-inset-bottom, 0px))" }}>{footer}</div>}</div>;
}
