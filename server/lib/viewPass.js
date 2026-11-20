// The view pass: nothing a person shared opens for someone unknown.
//
// The founder's rule: a photo, video, post or file on GLOOBAL never becomes
// an open web link that anyone can click inside WhatsApp, Telegram or a
// browser. Every picture route that serves people's content (Social posts
// and ads, Used listings) asks for a pass; a pass is given only to a
// signed-in GLOOBAL account (GET /api/social/pass), names that account,
// and lasts 15 minutes. A link copied out of the app stops opening within
// 15 minutes, and while it opens it opens as a known person.
// (Pay QRs are the exception: they exist so people can pay you.)
//
// Signed with an HMAC key derived from the server's auth secret — never
// the auth key itself, so a pass can never stand in for a sign-in.
const crypto = require('crypto');

const PASS_MS = 15 * 60 * 1000;
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function createViewPass({ secret, now = () => Date.now() }) {
  if (!secret) throw new Error('view pass needs a secret');
  const key = crypto.createHmac('sha256', String(secret)).update('gloobal-view-pass-v1').digest();
  const sign = (body) => b64u(crypto.createHmac('sha256', key).update(body).digest());
  return {
    PASS_MS,
    // A pass for this account, valid until expiresAt.
    issue(userId) {
      const exp = now() + PASS_MS;
      const body = b64u(JSON.stringify({ u: String(userId), e: exp }));
      return { pass: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
    },
    // The account a pass belongs to, or null (forged, altered or expired).
    check(pass) {
      const s = String(pass || '');
      const dot = s.indexOf('.');
      if (dot < 1) return null;
      const body = s.slice(0, dot); const mac = s.slice(dot + 1);
      const want = sign(body);
      if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
      try {
        const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        if (!p || !p.u || !(Number(p.e) > now())) return null;
        return String(p.u);
      } catch (e) { return null; }
    },
  };
}

// Express: the request must carry a live pass (?v=) for an account that
// still exists. Sets req.viewerId.
function requireViewPass(viewPass, User) {
  return async (req, res, next) => {
    try {
      const userId = viewPass.check(req.query.v);
      const exists = userId && (await User.exists({ _id: userId }));
      if (!exists) return res.status(401).json({ success: false, code: 'sealed', message: 'Sealed on GLOOBAL. Open it in GLOOBAL or Helloo to see it.' });
      req.viewerId = userId;
      return next();
    } catch (error) { return next(error); }
  };
}

module.exports = { createViewPass, requireViewPass, PASS_MS };
