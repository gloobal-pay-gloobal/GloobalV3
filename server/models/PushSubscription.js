const mongoose = require('mongoose');

// One browser's Web Push subscription, as the Push API handed it to the page.
//
// The `endpoint` is the push service's own URL for one browser profile on one
// device — it is minted by the browser vendor's push service, not by us, and
// it is what webpush.sendNotification() posts to. Everything else here is
// bookkeeping around it.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    endpoint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // The two halves of the subscription's encryption material. Without both,
    // web-push cannot encrypt a payload and the send fails at the library, not
    // at the push service — so both are required rather than defaulted.
    keys: {
      p256dh: { type: String, required: true, maxlength: 255 },
      auth: { type: String, required: true, maxlength: 255 },
    },

    // Opt-in, never opt-out: a row created without an explicit choice is not
    // consenting to marketing. sendPushToUser only reads this for
    // category 'promotional'; a payment notification ignores it entirely.
    promotionalOptIn: {
      type: Boolean,
      default: false,
    },

    userAgent: {
      type: String,
      maxlength: 255,
      default: '',
    },

    // Consecutive soft failures (a 5xx from the push service, a network
    // error). Reset to 0 on every successful subscribe; the sender deletes the
    // row once it reaches 5, because a push service that has refused five
    // times in a row is not coming back for this endpoint.
    failureCount: {
      type: Number,
      default: 0,
    },

    lastSeenAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

pushSubscriptionSchema.index({ userId: 1, createdAt: -1 });

// The endpoint is unique ACROSS ALL ACCOUNTS, not per account.
//
// A push endpoint identifies a browser profile, and a browser profile can only
// be signed in to one Gloobal account at a time. If two rows could hold the
// same endpoint under different userIds, one physical browser would receive
// both accounts' payment notifications — including the balance figures of an
// account whoever is holding the phone has signed out of.
//
// So re-subscribing on a shared device must TRANSFER the endpoint, not add a
// second row: POST /api/push/subscribe upserts on { endpoint } alone and $sets
// userId to the calling token's own account. This index is what makes that the
// only possible outcome — a concurrent subscribe from a second account loses
// with E11000 rather than duplicating the device.
pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
