// server/lib/openHours.js
//
// Opening hours and "open right now", for the server's Open now filter.
// The block between the SHARED markers is an exact copy of the one in
// frontend/features/creator/openHours.js, so the filter and the label a
// customer reads cannot disagree; tests/open-hours.test.mjs compares them.
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

// What the profile route accepts: seven days, HH:MM times, a real IANA
// time zone. Anything else is refused rather than stored half-right.
function openHoursValidate(raw) {
  if (raw === null) return { ok: true, value: null };
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days) || raw.days.length !== 7) {
    return { ok: false, message: 'Opening hours need all seven days.' };
  }
  const tz = String(raw.tz || '').slice(0, 64);
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch (e) {
    return { ok: false, message: 'That time zone is not recognised.' };
  }
  const days = [];
  for (const d of raw.days) {
    const closed = Boolean(d && d.closed);
    const open = String((d && d.open) || '');
    const close = String((d && d.close) || '');
    if (!closed && (openHoursMinutes(open) === null || openHoursMinutes(close) === null)) {
      return { ok: false, message: 'Each open day needs an opening and a closing time.' };
    }
    days.push({ closed, open: closed ? '' : open, close: closed ? '' : close });
  }
  return { ok: true, value: { tz, days } };
}

module.exports = { OPEN_HOURS_DAYS, openHoursMinutes, openHoursLocal, openHoursClean, openHoursIsOpen, openHoursStatus, openHoursValidate };
