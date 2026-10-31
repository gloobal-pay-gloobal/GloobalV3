// src/components/buttons/index.jsx
function CircularInButton({ onClick, disabled, size = 40 }) {
  return <button
    onClick={onClick}
    disabled={disabled}
    aria-label="Log in"
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      border: "none",
      background: disabled ? T.gradButtonDisabled : T.gradButton,
      boxShadow: disabled ? "none" : `0 8px 18px rgba(${T.accentRgb},0.32)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      color: "#fff",
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 0.3,
      flexShrink: 0,
      transition: "opacity 0.15s ease, box-shadow 0.15s ease"
    }}
  >
      IN
    </button>;
}
function SubmitButton({ onClick, disabled, label = "Submit" }) {
  return <button
    onClick={onClick}
    disabled={disabled}
    className="v2-tap"
    style={{
      marginTop: 16,
      border: "none",
      borderRadius: T.radiusMd,
      padding: "11px 30px",
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 0.2,
      color: "#fff",
      cursor: disabled ? "default" : "pointer",
      background: disabled ? T.gradButtonDisabled : T.gradButton,
      boxShadow: disabled ? "none" : `0 8px 20px rgba(${T.accentRgb},0.32)`,
      transition: "box-shadow 0.15s ease, background 0.15s ease, transform 0.1s ease"
    }}
  >{label}</button>;
}

