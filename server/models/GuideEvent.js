const mongoose = require('mongoose');

// What happened to one question in Ask GLOOBAL (0223) — so the team can see
// which questions found no answer and which answers did not help.
//
// Deliberately anonymous: no user, no account, no device. The question's
// words are kept only when they were about how GLOOBAL works; a question
// about the person's own money is counted, never written down. Numbers in
// the words are blanked before they are stored. Gone after 90 days.
const KINDS = ['answer', 'choices', 'none', 'personal', 'yes', 'no'];
const GuideEventSchema = new mongoose.Schema({
  kind: { type: String, enum: KINDS, required: true },
  text: { type: String, default: '', maxlength: 160 },
  lang: { type: String, default: '', maxlength: 12 },
  cardId: { type: String, default: '', maxlength: 40 },
  screen: { type: String, default: '', maxlength: 20 },
  at: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000) },
});
GuideEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'guide_event_expiry' });
GuideEventSchema.index({ at: -1 });
GuideEventSchema.statics.KINDS = KINDS;

module.exports = mongoose.model('GuideEvent', GuideEventSchema);
