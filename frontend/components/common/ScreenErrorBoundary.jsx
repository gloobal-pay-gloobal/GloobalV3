// src/components/common/ScreenErrorBoundary.jsx
import { Component as ReactComponent } from "react";

// A full-screen view that throws during render used to take the whole
// app down with it — the user saw a blank page and no way back. This
// boundary contains the failure to the one screen, keeps the close
// control working, and logs the real error to the console so the cause
// is still diagnosable rather than swallowed.
class ScreenErrorBoundary extends ReactComponent {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[Gloobal] ${this.props.name || "Screen"} crashed:`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const label = this.props.name || "This screen";
    return <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: T.surface,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
        fontFamily: "inherit"
      }}
    ><div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{label} is unavailable</div><div style={{ fontSize: 13, color: "#64748b", maxWidth: 280, lineHeight: 1.5 }}>
        Something went wrong opening this screen. The rest of the app is unaffected.
      </div>{this.props.onClose && <button
      onClick={this.props.onClose}
      className="v2-tap"
      style={{
        marginTop: 4,
        padding: "11px 22px",
        borderRadius: 999,
        border: "none",
        background: T.accent,
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer"
      }}
    >Go back</button>}</div>;
  }
}
