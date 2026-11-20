// The person check before content opens: the phone's own fingerprint or
// face, through the passkey GLOOBAL already uses, asked with user
// verification REQUIRED (the sensor must actually be used). A pass for
// people's pictures and videos (lib/viewPass.js) is given only inside the
// five minutes after it — so every view belongs to a real, accountable
// person, checked on their own phone. The fingerprint never leaves the
// phone: GLOOBAL gets a signed "yes" for this account.
//
// Helloo and GLOOBAL are two sites; a passkey belongs to one. Both ask for
// GLOOBAL's (rpID gloobalv3.netlify.app); GLOOBAL publishes Helloo as a
// related origin at /.well-known/webauthn, so the phone lets Helloo use it.
const VIEW_CHECK_MS = 5 * 60 * 1000;

function createViewCheck({ User, getWebAuthnServer, stashChallenge, consumeChallenge, rpIdFor, appOrigins, rateLimit, windowMs, now = () => Date.now() }) {
  const limit = rateLimit({ name: 'view-check', max: 60, windowMs });
  const originOf = (req) => String(req.get('origin') || '');
  const allowed = (origin) => appOrigins.includes(origin);

  // When this account's last check runs out (a Date), or null.
  async function checkedUntil(userId) {
    const u = await User.findById(userId).select('viewCheckedUntil').lean();
    const until = u && u.viewCheckedUntil ? new Date(u.viewCheckedUntil) : null;
    return until && until.getTime() > now() ? until : null;
  }

  function mount(app, requireAuth) {
    app.post('/api/view-check/options', limit, requireAuth, async (req, res) => {
      try {
        const origin = originOf(req);
        if (!allowed(origin)) return res.status(403).json({ success: false, code: 'app_not_verified', message: 'Only GLOOBAL\'s own apps can open this.' });
        const user = await User.findById(req.authUser._id);
        const passkeys = Array.isArray(user && user.passkeys) ? user.passkeys : [];
        if (!passkeys.length) return res.status(409).json({ success: false, code: 'passkey_required', message: 'Turn on fingerprint / Face ID for GLOOBAL first.' });
        const { generateAuthenticationOptions } = await getWebAuthnServer();
        const options = await generateAuthenticationOptions({
          rpID: rpIdFor(origin),
          allowCredentials: passkeys.map((p) => ({ id: p.id, transports: p.transports || [] })),
          userVerification: 'required',
        });
        await stashChallenge(user, options.challenge);
        return res.json(options);
      } catch (error) {
        console.error('View check options error:', error);
        return res.status(500).json({ success: false, message: 'Could not start fingerprint / Face ID.' });
      }
    });
    app.post('/api/view-check/verify', limit, requireAuth, async (req, res) => {
      try {
        const origin = originOf(req);
        if (!allowed(origin)) return res.status(403).json({ success: false, code: 'app_not_verified', message: 'Only GLOOBAL\'s own apps can open this.' });
        const response = req.body && req.body.response;
        if (!response) return res.status(400).json({ success: false, message: 'Try again.' });
        const user = await User.findById(req.authUser._id);
        const passkeys = Array.isArray(user && user.passkeys) ? user.passkeys : [];
        const passkey = passkeys.find((p) => p.id === response.id);
        if (!passkey) return res.status(404).json({ success: false, message: 'This phone is not the one set up for fingerprint / Face ID.' });
        const challenge = await consumeChallenge(user);
        if (!challenge) return res.status(400).json({ success: false, code: 'expired', message: 'That took too long. Try again.' });
        const { verifyAuthenticationResponse } = await getWebAuthnServer();
        const verification = await verifyAuthenticationResponse({
          response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpIdFor(origin), requireUserVerification: true,
          credential: { id: passkey.id, publicKey: passkey.publicKey, counter: passkey.counter, transports: passkey.transports || [] },
        });
        if (!verification.verified || !verification.authenticationInfo.userVerified) {
          return res.status(401).json({ success: false, message: "Fingerprint / Face ID didn't confirm it. Try again." });
        }
        passkey.counter = verification.authenticationInfo.newCounter;
        user.passkeys = passkeys;
        const until = new Date(now() + VIEW_CHECK_MS);
        user.viewCheckedUntil = until;
        await user.save();
        return res.json({ success: true, until: until.toISOString() });
      } catch (error) {
        console.error('View check verify error:', error);
        return res.status(500).json({ success: false, message: 'Could not check fingerprint / Face ID.' });
      }
    });
  }

  return { mount, checkedUntil, VIEW_CHECK_MS };
}

module.exports = { createViewCheck, VIEW_CHECK_MS };
