const mongoose = require('mongoose');

// "Ask instead": a free, one-line request to somebody who charges (or has
// closed their door) to be allowed to message or call them. Nothing is
// delivered until they say yes; on yes the line becomes the first message.
const hellooAskSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['message', 'call'], default: 'message' },
    text: { type: String, required: true, maxlength: 120 },
    status: { type: String, enum: ['pending', 'allowed', 'declined'], default: 'pending' },
    answeredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

hellooAskSchema.index({ to: 1, status: 1, createdAt: -1 });
hellooAskSchema.index({ from: 1, createdAt: -1 });
// One open request per pair at a time.
hellooAskSchema.index({ from: 1, to: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('HellooAsk', hellooAskSchema);
