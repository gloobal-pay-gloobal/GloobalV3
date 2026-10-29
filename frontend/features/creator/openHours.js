// src/features/creator/openHours.js
//
// OPENING HOURS, AND WHETHER A SHOP IS OPEN RIGHT NOW.
//
// Seven days, Monday first, each { closed, open: "09:00", close: "22:00" },
// in the SHOP's time zone — a customer in another city reading "closes
// 10 pm" needs the shop's 10 pm, not their own. A close earlier than the
// open runs past midnight (a dhaba open 18:00–02:00). 00:00–00:00 is open
// all day.
//
// ── THIS BLOCK IS SHARED, BYTE FOR BYTE ─────────────────────────────────
// server/lib/openHours.js carries an identical copy between the two
// SHARED markers, so the server's "Open now" filter and this screen's
// "Open · closes 10 pm" can never disagree. tests/open-hours.test.mjs
// compares the two.
// ── SHARED BEGIN ──
var OPEN_HOURS_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function openHoursMinutes(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Monday-first weekday and minutes since midnight, in `tz`.
function openHoursLocal(now, tz) {
  const parts = {};
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz || "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  } catch (e) {
    return null;
  }
  const day = OPEN_HOURS_DAYS.indexOf(parts.weekday);
  if (day < 0) return null;
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function openHoursClean(hours) {
  const h = hours && typeof hours === "object" ? hours : null;
  if (!h || !Array.isArray(h.days) || h.days.length !== 7) return null;
  const days = h.days.map((d) => {
    const open = openHoursMinutes(d && d.open);
    const close = openHoursMinutes(d && d.close);
    return { closed: Boolean(d && d.closed) || open === null || close === null, open, close };
  });
  if (days.every((d) => d.closed)) return null;
  return { tz: String(h.tz || "UTC"), days };
}

// Is `minutes` on `day` inside that day's hours, or inside the previous
// day's hours that ran past midnight?
function openHoursIsOpen(days, day, minutes) {
  const d = days[day];
  if (!d.closed) {
    if (d.open === d.close) return true;
    if (d.open < d.close && minutes >= d.open && minutes < d.close) return true;
    if (d.open > d.close && minutes >= d.open) return true;
  }
  const prev = days[(day + 6) % 7];
  if (!prev.closed && prev.open > prev.close && minutes < prev.close) return true;
  return false;
}

// { known, open, closesAt?, opensAt?, opensDay? } — minutes, and a day
// index when the next opening is not today.
function openHoursStatus(hours, now) {
  const h = openHoursClean(hours);
  if (!h) return { known: false, open: false };
  const local = openHoursLocal(now || new Date(), h.tz);
  if (!local) return { known: false, open: false };
  const { day, minutes } = local;
  if (openHoursIsOpen(h.days, day, minutes)) {
    const d = h.days[day];
    const prev = h.days[(day + 6) % 7];
    if (!d.closed && d.open === d.close) return { known: true, open: true, allDay: true };
    // Still in last night's late hours, or in today's.
    const inPrev = !prev.closed && prev.open > prev.close && minutes < prev.close
      && !(!d.closed && d.open <= minutes && (d.open > d.close || minutes < d.close));
    return { known: true, open: true, closesAt: inPrev ? prev.close : d.close };
  }
  for (let ahead = 0; ahead < 8; ahead++) {
    const idx = (day + ahead) % 7;
    const d = h.days[idx];
    if (d.closed) continue;
    if (ahead === 0 && d.open <= minutes) continue;
    return { known: true, open: false, opensAt: d.open, opensDay: ahead === 0 ? null : (ahead === 1 ? "tomorrow" : OPEN_HOURS_DAYS[idx]) };
  }
  return { known: true, open: false };
}
// ── SHARED END ──

// "10 pm", "9:30 am", "12 noon"-free: what a shop sign says.
function openHoursClock(minutes) {
  if (minutes === null || minutes === undefined) return "";
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h24 < 12 ? "am" : "pm"}`;
}

// The line a customer reads: "Open · closes 10 pm", "Closed · opens 9 am",
// "Closed · opens Mon 9 am", "Open 24 hours". Empty when no hours are set
// — no line is better than a guess.
function openHoursLabel(hours, now) {
  const s = openHoursStatus(hours, now);
  if (!s.known) return { text: "", open: null };
  if (s.open) return { text: s.allDay ? "Open 24 hours" : `Open · closes ${openHoursClock(s.closesAt)}`, open: true };
  if (s.opensAt === undefined) return { text: "Closed", open: false };
  return { text: `Closed · opens ${s.opensDay ? `${s.opensDay} ` : ""}${openHoursClock(s.opensAt)}`, open: false };
}

// A week a new shop starts from: every day 9 am to 9 pm.
function openHoursDefault() {
  let tz = "UTC";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { /* keep UTC */ }
  return { tz, days: OPEN_HOURS_DAYS.map(() => ({ closed: false, open: "09:00", close: "21:00" })) };
}
