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
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    seconds: { type: Number, default: 0 },
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

hellooCallSchema.index({ callerId: 1, createdAt: -1 });
hellooCallSchema.index({ calleeId: 1, createdAt: -1 });
hellooCallSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('HellooCall', hellooCallSchema);
