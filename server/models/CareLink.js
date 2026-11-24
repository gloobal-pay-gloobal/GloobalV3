// A helper and the person they look after (lib/care.js).
//
// Anyone can be a helper — a parent, a big sister, a grandchild, a friend,
// a caretaker. Who they are to the person is what the helper says it is
// (`relationship`); the person's own document is what is checked. The
// first helper adds the person and may invite one more. While a link is
// active the helper can use the account fully, and every action is
// written down (CareAction).
const mongoose = require('mongoose');

const RELATIONSHIPS = ['parent', 'sibling', 'grandparent', 'grandchild', 'child', 'spouse', 'relative', 'friend', 'caretaker', 'other'];

const CareLinkSchema = new mongoose.Schema(
  {
    helper: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dependent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    relationship: { type: String, enum: RELATIONSHIPS, required: true },
    relationshipNote: { type: String, default: '', maxlength: 40 },
    // The helper who added them is first; an invited one is second.
    role: { type: String, enum: ['first', 'second'], required: true },
    status: { type: String, enum: ['invited', 'active', 'ended'], default: 'active', index: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    endedReason: { type: String, enum: ['left', 'removed', 'declined', 'handed_over', null], default: null },
  },
  { timestamps: true }
);
// One open link between the same two people.
CareLinkSchema.index({ helper: 1, dependent: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['invited', 'active'] } } });

module.exports = mongoose.models.CareLink || mongoose.model('CareLink', CareLinkSchema);
module.exports.RELATIONSHIPS = RELATIONSHIPS;
