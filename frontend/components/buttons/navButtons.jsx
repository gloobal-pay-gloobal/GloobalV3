// src/components/buttons/navButtons.jsx
//
// The app's navigation controls, defined once.
//
// Before this file there were 29 back buttons across 11 files, and they did
// not agree with each other. Three separate mechanisms were in play — an
// inline-styled 40px circle with no border (the Dashboard and most feature
// screens), the same circle WITH a 1px border (the registration and PIN
// screens), and a `.icon-btn.circle` CSS class scoped inside Send Money —
// and two different glyphs: `ArrowLeft` on twenty of them, `ChevronLeft` on
// the other nine. So "go back" was drawn as an arrow on one screen and a
// chevron on the next, in a circle that changed size and gained or lost a
// border depending on which part of the app you were in.
//
// None of that was a decision anyone made; it is what happens when the same
// control is rewritten inline 29 times. These components are the decision.
//
// The chosen treatment is the majority one — ArrowLeft, 18px glyph, 40px
// circle, no border, surface fill lifted off the background by shadowCard.
// The border is dropped rather than kept because the shadow already does
// the separating on both backgrounds the button appears on (T.bg #F6F5FC
// and T.surface #FFFFFF), and a border on top of it read as a second,
// competing edge.
import { ArrowLeft as ArrowLeftNav, History as HistoryNav, X as XNav } from "lucide-react";

var NAV_BUTTON_SIZE = 40;
var NAV_GLYPH_SIZE = 18;

// The shared shell. `style` is merged LAST and is for placement only —
// position, insets, z-index, flex behaviour, margins. Callers must not use
// it to restyle the button's appearance; that is the whole point of the
// file. The one exception the codebase legitimately needs is a caller
// pinning the button to a corner, which is placement.
function NavIconButton({ onClick, label, disabled, style, children }) {
  return <button
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="v2-tap"
    style={{
      width: NAV_BUTTON_SIZE,
      height: NAV_BUTTON_SIZE,
      flexShrink: 0,
      borderRadius: "50%",
      border: "none",
      padding: 0,
      background: T.surface,
      boxShadow: T.shadowCard,
      color: T.ink,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1,
      ...style
    }}
  >{children}</button>;
}

// Go back. `label` is overridable only because a couple of screens describe
// where back goes ("Back to Send Money"), which is better for a screen
// reader than a bare "Back" repeated on every screen.
function NavBackButton({ onClick, label = "Back", disabled, style }) {
  return <NavIconButton onClick={onClick} label={label} disabled={disabled} style={style}><ArrowLeftNav size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton>;
}

// Open a history list. Same circle as back, same glyph everywhere — this is
// the clock-with-arrow the History screen itself is opened with, so the
// control that opens history looks the same wherever it appears (the
// Receive sheet, Send Money's header, Update ID).
function NavHistoryButton({ onClick, label = "History", disabled, style }) {
  return <NavIconButton onClick={onClick} label={label} disabled={disabled} style={style}><HistoryNav size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton>;
}

// Dismiss a full-screen sheet. Same circle again, so a header that carries
// both a history control and a close control (the Receive sheet does)
// draws them as one pair rather than two sizes.
//
// This is for SCREEN-level dismissal. The small X inside a bottom sheet is
// deliberately not this: it is chrome on a panel that only covers part of
// the screen, and matching it to a full-screen control would make it the
// heaviest thing in the sheet.
function NavCloseButton({ onClick, label = "Close", disabled, style }) {
  return <NavIconButton onClick={onClick} label={label} disabled={disabled} style={style}><XNav size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton>;
}
