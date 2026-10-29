// src/features/creator/openHoursEditor.jsx
//
// SETTING A SHOP'S OPENING HOURS.
//
// Off until the creator turns it on — a shop that never sets hours shows
// no Open/Closed line anywhere, which is better than a wrong one. On, it is
// seven rows, Monday first: a switch for open/closed and two time boxes.
// "Same every day" copies Monday's hours to the rest, which is what most
// small shops are, so the common case is one change and one tap.
//
// Times are the phone's own time picker (<input type="time">), and the
// time zone is the phone's, recorded with the hours so a customer in
// another city reads the shop's 10 pm.
import { Clock as ClockHours, Copy as Copy6 } from "lucide-react";

var OPEN_HOURS_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function OpenHoursEditor({ value, onChange }) {
  const on = Boolean(value && Array.isArray(value.days) && value.days.length === 7);
  const hours = on ? value : null;
  const setDay = (i, patch) => onChange({
    ...hours,
    days: hours.days.map((d, j) => (j === i ? { ...d, ...patch } : d))
  });
  const status = on ? openHoursLabel(hours, new Date()) : { text: "", open: null };
  const timeBox = {
    width: 92, border: `1.5px solid ${T.line}`, borderRadius: 10, background: T.bg, padding: "7px 8px",
    fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: "inherit", outline: "none", boxSizing: "border-box"
  };

  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ flex: 1, minWidth: 0 }}><span style={{
      display: "block", fontSize: 13, fontWeight: 700, color: T.ink
    }}>Show opening hours</span><span style={{
      display: "block", fontSize: 11.5, color: T.inkFaint, marginTop: 2, lineHeight: 1.45
    }}>{on
      ? (status.text ? `Customers see: ${status.text}` : "Customers see when you're open.")
      : "Off — customers see no Open or Closed line."}</span></span><ProfileToggle
      on={on}
      onToggle={() => onChange(on ? null : openHoursDefault())}
      label="Show opening hours"
    /></div>
    {on ? <>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>{hours.days.map((d, i) => <div
        key={i}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "7px 0",
          borderTop: i === 0 ? "none" : `1px solid ${T.line}`
        }}
      ><span style={{ width: 38, flexShrink: 0, fontSize: 12.5, fontWeight: 800, color: d.closed ? T.inkFaint : T.ink }}>{OPEN_HOURS_DAYS[i]}</span><ProfileToggle
        on={!d.closed}
        onToggle={() => setDay(i, d.closed
          ? { closed: false, open: d.open || "09:00", close: d.close || "21:00" }
          : { closed: true })}
        label={`Open on ${OPEN_HOURS_DAY_NAMES[i]}`}
      />{d.closed
        ? <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.inkFaint, paddingLeft: 4 }}>Closed</span>
        : <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", minWidth: 0 }}><input
          id={`hours-open-${i}`}
          type="time"
          value={d.open || ""}
          aria-label={`${OPEN_HOURS_DAY_NAMES[i]} opens at`}
          onChange={(e) => setDay(i, { open: e.target.value })}
          style={timeBox}
        /><span style={{ fontSize: 12, color: T.inkFaint, fontWeight: 700 }}>to</span><input
          id={`hours-close-${i}`}
          type="time"
          value={d.close || ""}
          aria-label={`${OPEN_HOURS_DAY_NAMES[i]} closes at`}
          onChange={(e) => setDay(i, { close: e.target.value })}
          style={timeBox}
        /></span>}</div>)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><button
        onClick={() => onChange({ ...hours, days: hours.days.map(() => ({ ...hours.days[0] })) })}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 999, padding: "8px 12px",
          background: T.accentSoft, color: T.accent, fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer"
        }}
      ><Copy6 size={13} />Same as Monday, every day</button><span style={{
        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.inkFaint, fontWeight: 600
      }}><ClockHours size={12} />Times in {hours.tz}. Late nights past midnight are fine.</span></div>
    </> : null}
  </div>;
}
