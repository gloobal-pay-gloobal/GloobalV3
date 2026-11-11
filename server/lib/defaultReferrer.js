// The default referrer: who a new member joins under when they bring no
// referral of their own.
//
// Registration has always let people skip the referral step, and an account
// made that way had no referrer at all. With DEFAULT_REFERRER set on the
// server, such an account joins under that one member instead, exactly as if
// it had typed that member's code: same `referredBy`, same three-level
// chain, same Referral row, same rewards.
//
//   DEFAULT_REFERRER   one member, as either their GLOOBAL ID or their short
//                      referral code (the 10 letters and digits under
//                      "Invite" in the app, which is easier to paste into a
//                      settings page than the symbols of an ID).
//                      Empty or unset: nothing changes, skipping means no
//                      referrer, as before.
//
// A referral the person did type always wins. The default is used only when
// nothing was typed, or when what was typed matched nobody.

const defaultReferrerRef = (env = process.env) => String(env.DEFAULT_REFERRER || '').trim();

// Decides who the new account joins under.
//   supplied      what the person typed at the referral step ('' if skipped)
//   newSymbolId   the ID being registered (nobody refers themselves)
//   find          async (ref) => user | null, looks a member up by GLOOBAL ID
//   findDefault   async (ref) => user | null, by GLOOBAL ID or short code
// Returns { user, byDefault, missed }:
//   user       the referrer, or null for none
//   byDefault  true when `user` is the default rather than the person's choice
//   missed     true when something was typed and it matched nobody
async function resolveReferrer({ supplied, newSymbolId, find, findDefault, env = process.env }) {
  const typed = String(supplied || '').trim();
  const own = typed ? await find(typed) : null;
  if (own) return { user: own, byDefault: false, missed: false };

  const missed = Boolean(typed);
  const ref = defaultReferrerRef(env);
  if (!ref) return { user: null, byDefault: false, missed };
  const fallback = await findDefault(ref);
  // The default member's own registration (or a setting that names nobody)
  // simply has no referrer.
  if (!fallback || fallback.symbolId === String(newSymbolId || '').trim()) {
    return { user: null, byDefault: false, missed };
  }
  return { user: fallback, byDefault: true, missed };
}

module.exports = { defaultReferrerRef, resolveReferrer };
