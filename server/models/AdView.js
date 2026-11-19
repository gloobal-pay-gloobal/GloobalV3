const mongoose = require('mongoose');

// One person watching one ad. Unique per (campaign, viewer): a GLOOBAL ID
// is paid for an ad once, ever. `price` is the viewer's own price, fixed
// when they start. started → paying → paid, or back to started / failed.
const adViewSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    price: { type: Number, required: true, min: 0.1, max: 7 },
    currency: { type: String, required: true, uppercase: true },
    status: { type: String, enum: ['started', 'paying', 'paid', 'failed'], default: 'started' },
    startedAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    referenceId: { type: String, default: '' },
    tries: { type: Number, default: 0 },
    // Whether this view's price is counted in the campaign's spent figure.
    reserved: { type: Boolean, default: false },
    // Interested / not for me — told to the advertiser as a count only.
    liked: { type: Boolean, default: null },
  },
  { timestamps: true }
);
adViewSchema.index({ campaign: 1, viewer: 1 }, { unique: true });
adViewSchema.index({ viewer: 1, status: 1, paidAt: -1 });
adViewSchema.index({ viewer: 1, startedAt: -1 });

module.exports = mongoose.model('AdView', adViewSchema);
