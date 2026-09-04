// src/utils/creatorShare.js
var CREATOR_SHARE_BUCKETS = ["0\u20131%", "1\u20132%", "2\u20133%", "3\u20134%", "4\u20135%", "5\u20136%", "6\u20137%"];
// The single-account view: this person's own rate, 100% in its bucket.
//
// Still the fallback when the platform figures cannot be fetched. It is not
// a projection and not an example — it is one real choice, and the screen
// says as much beneath it.
function computeCreatorShareDistribution(myShareRate) {
  const bucketIndex = Math.min(Math.floor(myShareRate), CREATOR_SHARE_BUCKETS.length - 1);
  return CREATOR_SHARE_BUCKETS.map((range, i) => ({ range, pct: i === bucketIndex ? 100 : 0 }));
}

// The platform-wide view: how everyone has actually set their rate.
//
// `distribution` is what GET /api/creator-share/distribution returned, or
// null when it could not be reached. Null falls back to the single-account
// shape above, so the screen degrades to a smaller truth rather than to a
// made-up one.
//
// The bucket LABELS come from CREATOR_SHARE_BUCKETS rather than from the
// server, so the bars can never be labelled with ranges the server and the
// screen disagree about.
function creatorShareDistributionRows(distribution, myShareRate) {
  if (!distribution || !Array.isArray(distribution.buckets) || distribution.totalUsers <= 0) {
    return computeCreatorShareDistribution(myShareRate);
  }
  return CREATOR_SHARE_BUCKETS.map((range, i) => {
    const bucket = distribution.buckets[i];
    return {
      range,
      pct: bucket ? Number(bucket.pct) || 0 : 0,
      users: bucket ? Number(bucket.users) || 0 : 0
    };
  });
}

// ── The My Share screen ──────────────────────────────────────────────────
//
// The rate is a percentage of an incoming payment. Everything the screen
// shows about it — the bar, the three amounts — is derived here rather than
// in the JSX, because the screen has to be able to state ONE arithmetic and
// the easiest way to break that is to compute it twice.

// The rates worth one tap. 2% is the default, and the ends of the range are
// on the list because "share nothing" and "share the most I can" are real
// answers somebody may want without dragging for them.
var MY_SHARE_PRESETS = [0, 1, 2, 5, 7];

// The slider steps by 0.01, so a preset is "selected" over a hairline band
// around it rather than on exact equality — otherwise 1.999999999 from a
// float would un-highlight a chip the person just pressed.
function myShareIsPreset(rate, preset) {
  return Math.abs(Number(rate) - Number(preset)) < 0.005;
}

// The example payment the preview is stated on. Round and large enough that
// the shared amount is a clean number at every preset.
var MY_SHARE_PREVIEW_BASE = 1000;

// Payment, their cut, your remainder — in that order, and always summing
// back to the payment ON SCREEN, which is the only place the sum is read.
//
// The rounding is not cosmetic. 2.36% of 1,000 is 23.599999999999998 in
// binary floating point, and the remainder is 976.4000000000001; printed
// at two decimals those are fine, but the moment the currency has none
// (¥, and a third of the currencies this app supports) rounding the two
// legs INDEPENDENTLY can land them a whole unit apart from the payment —
// three numbers on one card that visibly do not add up.
//
// So the share is rounded to the currency's own minor unit first, and the
// remainder is derived by subtracting the ROUNDED share. The two legs then
// reconcile by construction, in any currency, at any rate.
function myShareSplitRows(rate, base, currency) {
  const decimals = typeof currencyDecimals === "function" ? currencyDecimals(currency) : 2;
  const step = Math.pow(10, decimals);
  const total = Number(base) || 0;
  const share = Math.round(total * ((Number(rate) || 0) / 100) * step) / step;
  return [
    { key: "payment", label: "Payment", amount: total },
    { key: "share", label: "They get", amount: share },
    { key: "keep", label: "You keep", amount: total - share }
  ];
}

// How wide the two halves of the split bar are, as percentages.
//
// This is the one thing on the screen that can lie without looking wrong.
// The mock drew the shared half at the SLIDER's position — 2% sat 29% along
// a 0–7% track, so a bar captioned "on a 1,000 payment" showed a fifth of
// the money going back when a fiftieth does. The bar is a picture of the
// money, so it is drawn from the money.
//
// `minGivePct` exists only so a set-but-tiny rate is still a visible
// hairline instead of nothing; it is deliberately small enough that it
// cannot be mistaken for a quantity, and it is not applied at 0, where
// nothing is shared and nothing should be drawn.
function myShareBarWidths(rate, minGivePct) {
  const pct = Math.min(100, Math.max(0, Number(rate) || 0));
  if (pct === 0) return { keep: 100, give: 0 };
  const give = Math.max(pct, Number(minGivePct) || 0);
  return { keep: 100 - give, give };
}

