const mongoose = require('mongoose');

// One Helloo call, voice or video, between two GLOOBAL accounts.
//
//   ringing  → answered → ended     a call that happened (seconds counted
//                                   from answeredAt)
//   ringing  → missed               nobody answered within the ring time
//   ringing  → declined             the person called said no
//   ringing  → cancelled            the caller hung up before an answer
//
// The audio and video never touch the server: the two phones connect to
// each other (WebRTC) and the server only passes the handshake along.
const hellooCallSchema = new mongoose.Schema(
  {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    calleeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'HellooConversation', default: null },
    video: { type: Boolean, default: false },
    status: { type: String, enum: ['ringing', 'answered', 'ended', 'missed', 'declined', 'cancelled'], default: 'ringing' },
    // When the callee's phone got it and began to ring ("Ringing" for the
    // caller, instead of "Calling…").
    reachedAt: { type: Date, default: null },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    seconds: { type: Number, default: 0 },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // A paid call: billed per second from the caller's GLOOBAL balance —
    // the same money Ads & Earn pays into and ads are paid from. Nothing
    // is lent: it rings only when the balance covers at least a second,
    // and it ends by itself when the balance is used up (maxSeconds).
    // Settled minute by minute while it runs, and the last seconds at the
    // end, each as one ordinary payment caller → callee (lib/helloo.js).
    paid: {
      payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      payeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      perMinute: { type: Number },
      currency: { type: String },
      approvedAt: { type: Date },
      maxSeconds: { type: Number, default: 0 },
      settledSeconds: { type: Number, default: 0 },
      charged: { type: Number, default: 0 },
      // The payment being made right now (0 when none), and when it began.
      paying: { type: Number, default: 0 },
      payingSeconds: { type: Number, default: 0 },
      payingAt: { type: Date, default: null },
      refs: { type: [String], default: [] },
      // The balance ran out before the time was paid: the call was ended.
      short: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

hellooCallSchema.index({ callerId: 1, createdAt: -1 });
hellooCallSchema.index({ calleeId: 1, createdAt: -1 });
hellooCallSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('HellooCall', hellooCallSchema);
