// server/models/StaffMember.js
//
// Someone on the GLOOBAL team who is not the founder (0216): Support,
// Finance, Risk or Tech. Added and removed by an admin from the staff site;
// the admins themselves are named on Render (ADMIN_SYMBOL_IDS) and are never
// rows here. A removed member keeps the row (removedAt) so the audit log can
// still say who did what; their sessions end at once, because every staff
// request reads the role from here, not from the token.
const mongoose = require('mongoose');

// 'projects' reviews Hooman Project applications for GLOOBAL funding
// (lib/projectReview.js).
const ROLES = ['support', 'finance', 'risk', 'tech', 'projects'];

const StaffMemberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbolId: { type: String, required: true, index: true },
  role: { type: String, enum: ROLES, required: true },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // A one-time code for making their first passkey, hashed; seven days.
  setupCodeHash: { type: String, default: null },
  setupCodeExpiresAt: { type: Date, default: null },
  removedAt: { type: Date, default: null },
  removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

StaffMemberSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { removedAt: null }, name: 'staff_active_unique' });

const StaffMember = mongoose.model('StaffMember', StaffMemberSchema);
StaffMember.ROLES = ROLES;
module.exports = StaffMember;
