'use strict';

// Helloo calls: which old call rows still count (26 Nov). No database in
// here, so tests/helloo-calls-rules.test.mjs checks it on its own;
// lib/helloo.js reads the rows and asks.
//
// A call row stays "ringing" or "answered" until somebody ends it. Two
// ways it can be left behind:
//   * the server restarted while it rang, so its "missed" timer was lost;
//   * both phones vanished mid-call (battery, app killed, no signal), so
//     neither said "end".
// Such a row used to make the person look "on another call" to everybody
// for up to four hours. Now:
//   * a ring counts only for its ring time (plus a little grace);
//   * an answered call counts only while both people are connected to the
//     server — a phone that is not connected cannot be on a Helloo call
//     we can vouch for, so the new call rings (and if they really are on
//     one, their phone lets it go unanswered, as before);
//   * the sweep closes a ring that is past its time, and an answered call
//     whose two people have both been away on two sweeps in a row.

const RING_GRACE_MS = 15 * 1000;

// Does this live row stop a new call to one of its people ringing through?
function blocksNewRing(row, nowMs, isOnline, ringMs) {
  if (!row) return false;
  if (row.status === 'ringing') return nowMs - new Date(row.createdAt).getTime() < ringMs + RING_GRACE_MS;
  if (row.status === 'answered') return Boolean(isOnline(String(row.callerId)) && isOnline(String(row.calleeId)));
  return false;
}

// What the sweep does with a live row: 'missed' (a ring past its time),
// 'ended' (an answered call nobody has been connected to for two sweeps),
// 'watch' (both away now — look again next time), or null (leave it).
function sweepAction(row, nowMs, isOnline, ringMs, awayBefore) {
  if (!row) return null;
  if (row.status === 'ringing') return nowMs - new Date(row.createdAt).getTime() > ringMs + RING_GRACE_MS ? 'missed' : null;
  if (row.status === 'answered') {
    const away = !isOnline(String(row.callerId)) && !isOnline(String(row.calleeId));
    if (!away) return null;
    return awayBefore ? 'ended' : 'watch';
  }
  return null;
}

module.exports = { RING_GRACE_MS, blocksNewRing, sweepAction };
