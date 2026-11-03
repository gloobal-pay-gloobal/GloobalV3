// server/lib/holds.js
//
// Is this account on hold? (0220) Read on every payment and bank transfer
// out, from the database — never cached — so a hold set on the staff site
// stops the very next attempt, and a lifted one frees it at once.
const AccountHold = require('../models/AccountHold');

async function activeHolds(userId) {
  if (!userId) return [];
  return AccountHold.find({ userId, liftedAt: null }).select('kind reason createdAt').lean();
}
async function onHold(userId, kinds) {
  if (!userId) return null;
  return AccountHold.findOne({ userId, kind: { $in: kinds }, liftedAt: null }).select('kind').lean();
}
// The refusal the app shows. Deliberately says what to do, not why — the
// reason is the team's, written for the team.
function holdRefusal(res, kind) {
  const message = kind === 'payouts'
    ? 'Sending to a bank is paused on this account. Contact GLOOBAL from Help & Support.'
    : 'Payments from this account are paused. Contact GLOOBAL from Help & Support.';
  return res.status(423).json({ success: false, code: 'account_on_hold', hold: kind, message });
}

module.exports = { activeHolds, onHold, holdRefusal };
