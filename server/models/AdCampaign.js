const mongoose = require('mongoose');

// One ad on GLOOBAL (lib/ads.js). It is a STANDING INSTRUCTION, approved
// once with the advertiser's PIN: "pay each person who watches this in full
// their own price, never more than maxPerView, until `budget` is spent".
// The money stays in the advertiser's own GLOOBAL balance and goes straight
// to each viewer through the ordinary payment route — GLOOBAL holds none of
// it. `spent` is reserved before each payment and given back if it fails.
const adCampaignSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    media: { id: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialMedia', required: true }, kind: { type: String, enum: ['photo', 'video'], required: true } },
    // How long it must be watched to count, in seconds.
    seconds: { type: Number, required: true, min: 5, max: 60 },
    topics: { type: [String], default: [] },
    // Only for people within `km` of this point (a tea stall wants the
    // street, not the country). Empty: everyone in the currency.
    near: { lat: { type: Number, default: null }, lng: { type: Number, default: null }, km: { type: Number, default: 0 } },
    // Hashtags the advertiser chose (lower-case, no #): a person browsing
    // Ads by one of them is shown only ads that carry it.
    hashtags: { type: [String], default: [] },
    // Spread over a number of days: 0 is "until the budget is used". With
    // days, no more than budget / days is paid in one day (the advertiser's
    // day, by `tz` minutes), and the ad ends at `endsAt` with whatever is
    // left never taken.
    days: { type: Number, default: 0, min: 0, max: 30 },
    endsAt: { type: Date, default: null },
    tz: { type: Number, default: 0 },
    dayKey: { type: String, default: '' },
    daySpent: { type: Number, default: 0, min: 0 },
    currency: { type: String, required: true, uppercase: true },
    maxPerView: { type: Number, required: true, min: 0.1, max: 7 },
    budget: { type: Number, required: true, min: 1 },
    spent: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
    // Of those, how many watched to the end.
    fullViews: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'paused', 'ended'], default: 'active', index: true },
    // Why it stopped by itself: 'short' (the balance could not cover a
    // view), 'done' (budget used), 'time' (its days are over). Empty when
    // the advertiser did it.
    stopReason: { type: String, default: '' },
    // When the PIN approved it. No payment is ever made without this.
    mandateAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
adCampaignSchema.index({ status: 1, currency: 1, maxPerView: -1 });

module.exports = mongoose.model('AdCampaign', adCampaignSchema);
