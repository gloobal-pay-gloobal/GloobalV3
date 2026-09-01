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

