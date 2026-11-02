// src/features/accounts/accountsOnPhone.jsx
import { useState as useState82, useEffect as useEffect77 } from "react";
import { Users as UsersPhone, Plus as PlusPhone, LogIn as LogInPhone, UserPlus as UserPlusPhone, X as XPhone, Check as CheckPhone, ChevronRight as ChevronRightPhone } from "lucide-react";

// ── ACCOUNTS ON THIS PHONE (0201) ───────────────────────────────────────
//
// A row on Profile that opens a sheet: every account that has signed in on
// this phone, the one in use marked, and Add account. Tapping another one
// signs this one out and opens the PIN screen for that one — the list holds
// no tokens (sessionStore.js), so a switch is always a sign-in.

var ACCOUNTS_PHONE_COLORS = ["#E8701E", "#2563EB", "#16A34A", "#C02670", "#7C3AED"];

function accountsPhoneInitials(name, id) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase();
  return String(id || "?").slice(0, 2);
}

// The saved list, kept current across this page and any other tab.
function useAccountsOnPhone() {
  const [list, setList] = useState82(() => gloobalAccountsList());
  useEffect77(() => {
    const again = () => setList(gloobalAccountsList());
    window.addEventListener(GLOOBAL_ACCOUNTS_EVENT, again);
    window.addEventListener("storage", again);
    return () => {
      window.removeEventListener(GLOOBAL_ACCOUNTS_EVENT, again);
      window.removeEventListener("storage", again);
    };
  }, []);
  return list;
}

// One colour per account, the same wherever it sits in the list.
function accountsPhoneColour(id) {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return ACCOUNTS_PHONE_COLORS[h % ACCOUNTS_PHONE_COLORS.length];
}

function AccountsPhoneAvatar({ account, size = 44 }) {
  return <span aria-hidden="true" style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0, color: "#fff",
    background: accountsPhoneColour(account.symbolId), display: "flex", alignItems: "center",
    justifyContent: "center", fontWeight: 900, fontSize: Math.round(size * 0.34), border: `2px solid ${T.surface}`
  }}>{accountsPhoneInitials(account.name, account.symbolId)}</span>;
}

function AccountsOnPhoneRow({ currentId, onOpen }) {
  const list = useAccountsOnPhone();
  const others = list.filter((a) => a.symbolId !== currentId).length;
  return <button
    type="button"
    data-testid="accounts-on-phone-row"
    onClick={onOpen}
    className="v2-tap"
    style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "13px 14px", border: "none", cursor: "pointer",
      borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, fontFamily: "inherit", textAlign: "left"
    }}
  ><span style={{ width: 38, height: 38, borderRadius: 12, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><UsersPhone size={18} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 14, fontWeight: 800, color: T.ink
  }}>Accounts on this phone</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>{others
    ? `${others} more · switch or add`
    : "Add another account"}</span></span><span style={{ display: "flex" }}>{list.slice(0, 3).map((a, i) => <span key={a.symbolId} style={{ marginLeft: i ? -10 : 0 }}><AccountsPhoneAvatar account={a} i={i} size={28} /></span>)}</span><ChevronRightPhone size={16} color={T.inkFaint} /></button>;
}

function AccountsOnPhoneSheet({ currentId, onClose, onSwitch, onAdd }) {
  const list = useAccountsOnPhone();
  const [adding, setAdding] = useState82(false);
  const [confirm, setConfirm] = useState82(null);
  const full = list.length >= GLOOBAL_ACCOUNTS_MAX && list.some((a) => a.symbolId === currentId);
  const current = list.find((a) => a.symbolId === currentId);
  // The floating map button stands aside while this sheet is up.
  useEffect77(() => {
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  const row = (a, i) => {
    const on = a.symbolId === currentId;
    return <div key={a.symbolId} data-testid="accounts-on-phone-item" data-current={on ? "1" : "0"} style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16,
      background: on ? T.accentSoft : T.bg, boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : "none"
    }}><AccountsPhoneAvatar account={a} i={i} /><button
      type="button"
      disabled={on}
      onClick={() => setConfirm(a)}
      aria-label={on ? `${a.name || "This account"}, in use` : `Switch to ${a.name || "this account"}`}
      style={{ flex: 1, minWidth: 0, border: "none", background: "none", padding: 0, textAlign: "left", cursor: on ? "default" : "pointer", fontFamily: "inherit" }}
    ><span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name || "GLOOBAL account"}</span><span style={{
      display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2
    }}>{a.mobileTail ? `•••• ${a.mobileTail}` : "Mobile hidden"}</span></button>{on ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, color: T.accent }}><CheckPhone size={14} />In use</span> : <button
      type="button"
      onClick={() => gloobalAccountsForget(a.symbolId)}
      aria-label={`Remove ${a.name || "this account"} from this phone`}
      style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
    ><XPhone size={14} color={T.inkFaint} /></button>}</div>;
  };
  return <div style={{ position: "fixed", inset: 0, zIndex: 430, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(6,20,26,.5)" }} /><div
    role="dialog"
    aria-modal="true"
    aria-label="Accounts on this phone"
    data-testid="accounts-on-phone-sheet"
    style={{
      position: "relative", background: T.surface, borderRadius: "26px 26px 0 0", padding: "10px 18px calc(20px + env(safe-area-inset-bottom, 0px))",
      display: "flex", flexDirection: "column", gap: 10, maxHeight: "86vh", overflowY: "auto"
    }}
  ><span style={{ width: 42, height: 5, borderRadius: 3, background: T.line, margin: "0 auto 6px" }} />{confirm ? <>{
    /* ── SWITCHING ────────────────────────────────────────────────────
       Said before it happens, because it signs this account out. */
  }<div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{`Switch to ${confirm.name || "this account"}?`}</div><div style={{
    fontSize: 13, color: T.inkSoft, fontWeight: 600, lineHeight: 1.5
  }}>{`${current && current.name ? current.name : "This account"} signs out and stays on this phone. ${confirm.name || "The other account"} opens with its own PIN.`}</div><button
    type="button"
    data-testid="accounts-switch-go"
    onClick={() => onSwitch && onSwitch(confirm)}
    style={{ marginTop: 6, height: 50, borderRadius: 16, border: "none", background: T.gradButton, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}
  >Switch and enter PIN</button><button
    type="button"
    onClick={() => setConfirm(null)}
    style={{ height: 44, borderRadius: 14, border: "none", background: "none", color: T.inkSoft, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
  >Cancel</button></> : adding ? <>{
    /* ── ADD ACCOUNT ──────────────────────────────────────────────────
       Two ways in, and this account is kept on the list either way. */
  }<div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Add account</div><div style={{
    fontSize: 12.5, color: T.inkSoft, fontWeight: 600, lineHeight: 1.45
  }}>{`${current && current.name ? current.name : "This account"} signs out and stays here — one tap from Profile to come back.`}</div>{[
    { key: "signin", title: "Sign in to an account", sub: "A GLOOBAL account you already have — GLOOBAL ID or mobile, then PIN", Icon: LogInPhone },
    { key: "create", title: "Create a new account", sub: "A new GLOOBAL ID on another mobile number", Icon: UserPlusPhone }
  ].map(({ key, title, sub, Icon }) => <button
    key={key}
    type="button"
    data-testid={`accounts-add-${key}`}
    onClick={() => onAdd && onAdd(key)}
    style={{
      display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, border: "none", background: T.bg,
      cursor: "pointer", fontFamily: "inherit", textAlign: "left"
    }}
  ><span style={{ width: 42, height: 42, borderRadius: 13, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink
  }}>{title}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.35 }}>{sub}</span></span><ChevronRightPhone size={16} color={T.inkFaint} /></button>)}<button
    type="button"
    onClick={() => setAdding(false)}
    style={{ height: 44, borderRadius: 14, border: "none", background: "none", color: T.inkSoft, fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
  >Back</button></> : <><div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Accounts on this phone</div>{list.map(row)}<button
    type="button"
    data-testid="accounts-add"
    disabled={full}
    onClick={() => setAdding(true)}
    style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, border: `2px dashed ${T.line}`,
      background: "none", cursor: full ? "default" : "pointer", fontFamily: "inherit", fontSize: 14.5, fontWeight: 800,
      color: full ? T.inkFaint : T.accent, textAlign: "left"
    }}
  ><span style={{ width: 44, height: 44, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PlusPhone size={20} color={full ? T.inkFaint : T.accent} /></span>{full ? `${GLOOBAL_ACCOUNTS_MAX} accounts saved — remove one to add another` : "Add account"}</button><div style={{
    fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center", lineHeight: 1.45, marginTop: 2
  }}>Each opens with its own PIN. Nothing is shared between them.</div></>}</div></div>;
}
