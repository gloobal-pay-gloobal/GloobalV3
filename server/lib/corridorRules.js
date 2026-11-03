// server/lib/corridorRules.js
//
// Controls on payments between two countries (0221). Read from the database
// on every cross-border payment — a pause set on the staff site stops the
// very next one, and lifting it frees it at once.
const CorridorRule = require('../models/CorridorRule');

async function ruleFor(from, to) {
  if (!from || !to || from === to) return null;
  return CorridorRule.findOne({ from: String(from).toUpperCase(), to: String(to).toUpperCase(), liftedAt: null }).lean();
}
// What the app is told when a payment meets a rule. Says what is
// happening and what to do — never the team's reason.
function refusal(res, rule, toName, amountText) {
  if (rule.paused) return res.status(423).json({ success: false, code: 'corridor_paused', message: `Payments to ${toName} are paused for now. Try again later.` });
  return res.status(400).json({ success: false, code: 'corridor_cap', cap: rule.cap, capCurrency: rule.capCurrency, message: `Payments to ${toName} are limited to ${amountText} each for now.` });
}
module.exports = { ruleFor, refusal };
