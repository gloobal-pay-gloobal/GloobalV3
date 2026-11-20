// Hosted only under verified GLOOBAL IDs.
//
// The founder's rule: people's data lives on the internet only inside
// GLOOBAL, and only under a verified GLOOBAL ID. So a photo, video or
// voice note is stored (hosted) only for an account that is verified:
//   - it has its GLOOBAL ID (made only after the phone number's OTP),
//   - its live face photo is on file (taken in the app at sign-up),
//   - the phone's fingerprint / Face ID is set up (a passkey).
// A shop hosts under its owner's verification. Forwarding hosts nothing new
// (it points at the original), so it needs no check of its own.
function createVerifiedId({ User, ProfilePhoto }) {
  // null when this account may host; otherwise what is missing.
  async function hostProblem(userOrId) {
    const id = userOrId && userOrId._id ? userOrId._id : userOrId;
    let u = id ? await User.findById(id).select('symbolId passkeys shopOwnerId').lean() : null;
    if (u && u.shopOwnerId) u = await User.findById(u.shopOwnerId).select('symbolId passkeys shopOwnerId').lean();
    if (!u) return { code: 'verify_id', needs: ['id'], message: 'Only a verified GLOOBAL ID can share photos and videos.' };
    const needs = [];
    if (!u.symbolId) needs.push('id');
    if (!(await ProfilePhoto.exists({ userId: u._id }))) needs.push('photo');
    if (!(Array.isArray(u.passkeys) && u.passkeys.length)) needs.push('passkey');
    if (!needs.length) return null;
    const what = needs.includes('passkey') && needs.includes('photo') ? 'your live photo and fingerprint / Face ID' : needs.includes('passkey') ? 'fingerprint / Face ID' : needs.includes('photo') ? 'your live photo' : 'a GLOOBAL ID';
    return { code: 'verify_id', needs, message: `Only a verified GLOOBAL ID can share photos, videos and voice notes. Add ${what} in GLOOBAL first.` };
  }
  // Express: refuses the upload (403 verify_id) unless the account may host.
  const requireVerifiedHost = async (req, res, next) => {
    try {
      const problem = await hostProblem(req.authUser);
      if (problem) return res.status(403).json(Object.assign({ success: false }, problem));
      return next();
    } catch (error) { return next(error); }
  };
  return { hostProblem, requireVerifiedHost };
}

module.exports = { createVerifiedId };
