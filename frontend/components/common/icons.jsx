// src/components/common/icons.jsx
function EyeIcon({ open }) {
  return open ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.2"><path
    d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.2 6.9C3.6 8.6 2 12 2 12a13.4 13.4 0 003.3 4"
    strokeLinecap="round"
    strokeLinejoin="round"
  /></svg>;
}
// A moving scan-line, not a static one — the bracket corners stay
// fixed (that's the "viewfinder" itself) while the line inside sweeps
// up and down via a plain CSS keyframe animation, same technique as
// every other animated icon in this file (no JS interval needed).
function ScannerIcon({ size = 20, animated = false }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M4 8V6a2 2 0 012-2h2M20 8V6a2 2 0 00-2-2h-2M4 16v2a2 2 0 002 2h2M20 16v2a2 2 0 01-2 2h-2" strokeLinecap="round" strokeLinejoin="round" />{animated ? <><style>{`@keyframes scannerLineSweep { 0%, 100% { transform: translateY(-5px); opacity: 0.35; } 50% { transform: translateY(5px); opacity: 1; } }`}</style><line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" style={{ animation: "scannerLineSweep 1.6s ease-in-out infinite", transformOrigin: "12px 12px" }} /></> : <path d="M4 12h16" strokeLinecap="round" />}</svg>;
}
function AddBankIcon({ size = 20 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M3 10l9-6 9 6M4 10v8M20 10v8M9 10v8M15 10v8M2 19h20" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ReceiveIcon({ size = 20 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M12 4v13M7 12l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 20h14" strokeLinecap="round" /></svg>;
}
function SendIcon({ size = 20 }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" /><path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function HomeTabIcon({ active }) {
  const c = active ? "#7c3aed" : "#9a94ad";
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><path d="M4 11.5L12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ProfileTabIcon({ active }) {
  const c = active ? "#7c3aed" : "#9a94ad";
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.6-3.8 5-5.5 8-5.5s6.4 1.7 8 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function AccountsTabIcon({ active }) {
  const c = active ? "#7c3aed" : "#9a94ad";
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18" strokeLinecap="round" /><path d="M7 15h4" strokeLinecap="round" /></svg>;
}
// My Choices. A luggage tag rather than a folder or a pie slice: the
// feature labels payments, it does not file them away and it does not
// divide a total up. Drawn in the same 24-box, 2-weight, two-colour idiom
// as the three tabs beside it so the row reads as one set.
function ChoicesTabIcon({ active }) {
  const c = active ? "#7c3aed" : "#9a94ad";
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><path d="M12.6 3.5H19a1.5 1.5 0 011.5 1.5v6.4a2 2 0 01-.6 1.4l-7 7a2 2 0 01-2.8 0l-5.9-5.9a2 2 0 010-2.8l7-7a2 2 0 011.4-.6z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="8" r="1.6" /></svg>;
}
function LogoutIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e14848" strokeWidth="2"><path d="M9 21H5a1 1 0 01-1-1V4a1 1 0 011-1h4" strokeLinecap="round" strokeLinejoin="round" /><path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ChevronRightIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#c3bfe0" strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function MaskEyeIcon({ open, color }) {
  return open ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={color} strokeWidth="2.2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={color} strokeWidth="2.2"><path
    d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.2 6.9C3.6 8.6 2 12 2 12a13.4 13.4 0 003.3 4"
    strokeLinecap="round"
    strokeLinejoin="round"
  /></svg>;
}

