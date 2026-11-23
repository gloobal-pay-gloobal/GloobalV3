// server/lib/hellooSwitch.js
//
// ── ONE SWITCH FOR HELLOO AND SOCIAL ─────────────────────────────────────
//
// GLOOBAL goes live first; Helloo (chats, calls) and Social (posts, Work)
// come later, and run on this same server. HELLOO_SOCIAL=off on Render
// turns their routes off without a deploy of new code: every request under
// them is answered 404 "not open yet", and Helloo's live socket is not
// attached. Nothing is deleted and nothing else changes — what the GLOOBAL
// app shows of them simply says they are not open. Default: on.
//
//   HELLOO_SOCIAL=off   both off
//   HELLOO=off          Helloo only (chats, calls, /api/helloo)
//   SOCIAL=off          Social only (posts, Work: /api/social, /api/work)

const OFF = new Set(['off', 'false', '0', 'no']);
const isOff = (v) => OFF.has(String(v || '').trim().toLowerCase());

function hellooSwitch(env = process.env) {
  const both = isOff(env.HELLOO_SOCIAL);
  const helloo = !(both || isOff(env.HELLOO));
  const social = !(both || isOff(env.SOCIAL));
  const closed = [];
  if (!helloo) closed.push(/^\/api\/helloo(\/|$)/);
  if (!social) closed.push(/^\/api\/(social|work)(\/|$)/);
  const middleware = (req, res, next) => {
    const path = req.path || req.url || '';
    if (closed.some((re) => re.test(path))) {
      return res.status(404).json({ success: false, code: 'not_open', message: 'This is not open yet.' });
    }
    return next();
  };
  return { helloo, social, middleware };
}

module.exports = { hellooSwitch };
