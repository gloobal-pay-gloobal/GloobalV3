// src/components/common/iconTile.jsx
//
// THE ICON IN THE BOX, THE NAME UNDER IT.
//
// "I want icon inside, name outside, and this thing everywhere." One
// component for every tile in the app that is an icon with a name —
// Accounts' PayLater / My Assets / My Essentials / About Us, the bills
// row, Pay & Services' quick pay and travel, the bazaar categories, the
// setup screen's pickers. The box holds the picture and nothing else; the
// name sits underneath, outside it, the way a phone's home screen does.
//
// One shape everywhere is the point. The tiles had drifted into five
// layouts — name inside a white card, inside a coloured card, beside the
// icon, under it inside the border — and a person learns one.
function IconTile({
  label,
  onClick,
  ariaLabel,
  children,
  // The box: its side in px, or "100%" to fill the column as a square.
  box = 64,
  radius = 20,
  background,
  selected = false,
  badge = null,
  dimmed = false,
  labelColor,
  disabled = false,
  role,
  ariaChecked,
  ariaPressed,
  labelLines = 2,
  labelSize = 12,
  // With box="100%": a fixed height instead of a square, for a wide box.
  boxHeight = null
}) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel || label}
    aria-pressed={ariaPressed}
    aria-checked={ariaChecked}
    role={role}
    className="v2-tap"
    style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 7, minWidth: 0, width: "100%",
      border: "none", background: "none", padding: 0, cursor: onClick && !disabled ? "pointer" : "default",
      fontFamily: "inherit", opacity: dimmed ? 0.5 : 1
    }}
  ><span style={{
    position: "relative", flexShrink: 0,
    width: box, height: box === "100%" ? (boxHeight || "auto") : box, aspectRatio: box === "100%" && !boxHeight ? "1" : undefined,
    maxWidth: "100%", borderRadius: radius,
    background: background || T.surface,
    // A tinted box is its own surface and needs no lift; a plain white
    // one keeps the card shadow so it still reads as a box on the page.
    boxShadow: selected ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${T.accent}` : (background ? "none" : T.shadowCard),
    display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
    transition: "box-shadow 0.15s ease, transform 0.15s ease"
  }}>{children}{badge ? <span style={{ position: "absolute", top: 6, right: 6, zIndex: 2, display: "flex" }}>{badge}</span> : null}</span>{label ? <span style={{
    maxWidth: "100%", fontSize: labelSize, fontWeight: 700, lineHeight: 1.25, textAlign: "center",
    color: labelColor || (selected ? T.accent : T.ink),
    display: "-webkit-box", WebkitLineClamp: labelLines, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere"
  }}>{label}</span> : null}</button>;
}
