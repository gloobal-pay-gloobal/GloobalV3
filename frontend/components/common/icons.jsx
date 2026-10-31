// src/components/common/icons.jsx
function EyeIcon({ open }) {
  return open ? <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" strokeWidth="2.2"><path
    d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.2 6.9C3.6 8.6 2 12 2 12a13.4 13.4 0 003.3 4"
    strokeLinecap="round"
    strokeLinejoin="round"
  /></svg>;
}
// ── THE ONE SCAN MARK ───────────────────────────────────────────────────
//
// There were two. This one — viewfinder corners with a line sweeping
// between them — sat on the dashboard tile, the camera permission screen
// and My Essentials, while lucide's ScanLine sat in My Choices and on a
// category's scan-to-pay button. Two marks for one action, in an app where
// scanning is one of four things the dashboard offers.
//
// And the founder could not read either of them: "the icon you have built
// is not understandable". He is right about why. Corners plus a line is a
// picture of a VIEWFINDER, which says "point the camera" and stops there —
// the same mark would serve a document scanner, a barcode, a face unlock.
// Nothing in it says the thing being pointed at is a Gloobal QR code.
//
// So the code goes inside the corners: three solid blocks in the
// arrangement a QR's finder patterns actually take, plus two smaller ones
// trailing off the fourth corner where a QR carries data rather than a
// finder. Solid rather than outlined because this is used at 17px in two
// places, and an outlined 3-unit square at 17px is a grey smudge.
//
// `animated` is the founder's second ask — "make it colours change after
// 3 second so user get to know". The mark cycles violet → blue → teal, a
// little under three seconds each, which is enough movement to catch an
// eye crossing the screen without the jitter of something that pulses.
// Driven by `color` on a class, with the shapes painting themselves in
// currentColor, so one keyframe moves the whole mark at once. The class is
// defined in App.jsx beside the other shared keyframes, and is explicitly
// switched OFF under prefers-reduced-motion there — the blanket
// "animation-duration: 0.001ms" that rule applies would otherwise turn a
// slow colour cycle into a strobe, which is worse than the animation.
function ScannerIcon({ size = 20, animated = false, color = "#7c3aed" }) {
  return <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    className={animated ? "scan-mark-cycle" : void 0}
    style={{ color }}
    aria-hidden="true"
    focusable="false"
  ><path
    d="M3.2 8.6V5.8A2.6 2.6 0 015.8 3.2h2.8M20.8 8.6V5.8a2.6 2.6 0 00-2.6-2.6h-2.8M3.2 15.4v2.8a2.6 2.6 0 002.6 2.6h2.8M20.8 15.4v2.8a2.6 2.6 0 01-2.6 2.6h-2.8"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  /><g fill="currentColor"><rect x="7.2" y="7.2" width="4" height="4" rx="0.9" /><rect x="12.8" y="7.2" width="4" height="4" rx="0.9" /><rect x="7.2" y="12.8" width="4" height="4" rx="0.9" /><rect x="12.8" y="12.8" width="1.8" height="1.8" rx="0.5" /><rect x="15" y="15" width="1.8" height="1.8" rx="0.5" /></g></svg>;
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
  const c = active ? T.accent : T.inkFaint;
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><path d="M4 11.5L12 4l8 7.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ProfileTabIcon({ active }) {
  const c = active ? T.accent : T.inkFaint;
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c1.6-3.8 5-5.5 8-5.5s6.4 1.7 8 5.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function AccountsTabIcon({ active }) {
  const c = active ? T.accent : T.inkFaint;
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10.5h18" strokeLinecap="round" /><path d="M7 15h4" strokeLinecap="round" /></svg>;
}
// My Choices. A luggage tag rather than a folder or a pie slice: the
// feature labels payments, it does not file them away and it does not
// divide a total up. Drawn in the same 24-box, 2-weight, two-colour idiom
// as the three tabs beside it so the row reads as one set.
function ChoicesTabIcon({ active }) {
  const c = active ? T.accent : T.inkFaint;
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={c} strokeWidth="2"><path d="M12.6 3.5H19a1.5 1.5 0 011.5 1.5v6.4a2 2 0 01-.6 1.4l-7 7a2 2 0 01-2.8 0l-5.9-5.9a2 2 0 010-2.8l7-7a2 2 0 011.4-.6z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="8" r="1.6" /></svg>;
}
function LogoutIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={T.negative} strokeWidth="2"><path d="M9 21H5a1 1 0 01-1-1V4a1 1 0 011-1h4" strokeLinecap="round" strokeLinejoin="round" /><path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ChevronRightIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={T.inkFaint} strokeWidth="2.4"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function MaskEyeIcon({ open, color }) {
  return open ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={color} strokeWidth="2.2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg> : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={color} strokeWidth="2.2"><path
    d="M3 3l18 18M10.6 10.6a3 3 0 004.24 4.24M9.9 5.1A10.6 10.6 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.2 6.9C3.6 8.6 2 12 2 12a13.4 13.4 0 003.3 4"
    strokeLinecap="round"
    strokeLinejoin="round"
  /></svg>;
}

