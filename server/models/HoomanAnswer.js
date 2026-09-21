const mongoose = require('mongoose');

// One Hooman Score answer. Every answer is its own row — including one per
// payment — and the score is worked out from the recent ones by
// server/lib/hoomanScore.js. Nothing here is ever read by a payment route:
// the score does not change how much anybody is paid.
//
// Some of these answers are about how a person is doing ("Are you okay?").
// They are only written after the person has agreed (see HoomanProfile), and
// DELETE /api/hooman removes every one of them. Nothing logs `value`.
const hoomanAnswerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    pillar: { type: String, required: true, enum: ['self', 'community', 'environment', 'finance'] },
    item: { type: String, required: true, maxlength: 32 },
    kind: { type: String, required: true, enum: ['yesno', 'math', 'knowledge'] },

    // "yes"/"no", the number typed for a sum, or the index of the option
    // picked for a knowledge question.
    value: { type: String, required: true, maxlength: 16 },
    // Right or wrong, for a sum or a knowledge question. Null for yes/no,
    // which has no right answer.
    correct: { type: Boolean, default: null },
    // Always computed by the server — 25 for a good answer, 10 otherwise.
    points: { type: Number, required: true, enum: [10, 25] },

    // The person's own local date when they answered (YYYY-MM-DD). The daily
    // questions rotate on it. createdAt, not this, decides the score window.
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

    // Where it was answered: the Hooman Score screen, or after a payment.
    source: { type: String, required: true, enum: ['score', 'payment'], default: 'score' },
    transactionId: { type: String, default: null, maxlength: 64 },
    questionId: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: true }
);

hoomanAnswerSchema.index({ userId: 1, createdAt: -1 });
hoomanAnswerSchema.index({ userId: 1, pillar: 1, item: 1, createdAt: -1 });

// On the score screen, answering a check-in again on the same day CORRECTS
// that day's answer rather than adding another — otherwise tapping "yes" five
// times would count five times. The route upserts; this index is what holds
// it when two requests race.
hoomanAnswerSchema.index(
  { userId: 1, pillar: 1, item: 1, day: 1 },
  { unique: true, partialFilterExpression: { source: 'score' } }
);

// After a payment, every payment counts — but each payment only once. A retry
// of the same save must not record the answer twice.
hoomanAnswerSchema.index(
  { userId: 1, transactionId: 1 },
  { unique: true, partialFilterExpression: { source: 'payment', transactionId: { $type: 'string' } } }
);

module.exports = mongoose.model('HoomanAnswer', hoomanAnswerSchema);
