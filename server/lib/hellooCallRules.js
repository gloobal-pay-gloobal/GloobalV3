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
//   * the sweep closes a ring that is past its time. It never closes an
//     answered call (26 Nov): two people out of the app can both lose the
//     server for a while — a phone may drop the connection in the
//     background — while the call itself goes on phone to phone.

const RING_GRACE_MS = 15 * 1000;

// Does this live row stop a new call to one of its people ringing through?
function blocksNewRing(row, nowMs, isOnline, ringMs) {
  if (!row) return false;
  if (row.status === 'ringing') return nowMs - new Date(row.createdAt).getTime() < ringMs + RING_GRACE_MS;
  if (row.status === 'answered') return Boolean(isOnline(String(row.callerId)) && isOnline(String(row.calleeId)));
  return false;
}

// What the sweep does with a live row: 'missed' for a ring past its time,
// otherwise null — an answered call is left to the two phones to end.
function sweepAction(row, nowMs, ringMs) {
  if (!row) return null;
  if (row.status === 'ringing') return nowMs - new Date(row.createdAt).getTime() > ringMs + RING_GRACE_MS ? 'missed' : null;
  return null;
}

module.exports = { RING_GRACE_MS, blocksNewRing, sweepAction };
