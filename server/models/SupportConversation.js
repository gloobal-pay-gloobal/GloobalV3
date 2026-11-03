// server/models/SupportConversation.js
//
// One question somebody asked GLOOBAL from Help & Support in the app (0216),
// and everything said about it since: by them, by the team, and the team's
// own notes (internal, never shown to them).
const mongoose = require('mongoose');

const TOPICS = ['payment', 'bank', 'essentials', 'shop', 'account', 'other'];
const STATUSES = ['new', 'open', 'waiting', 'done'];

const MessageSchema = new mongoose.Schema({
  from: { type: String, enum: ['customer', 'staff', 'system'], required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // The first name a person sees beside a reply ("Priya, GLOOBAL Support").
  authorName: { type: String, default: '', maxlength: 60 },
  text: { type: String, required: true, maxlength: 2000 },
  internal: { type: Boolean, default: false },
  at: { type: Date, default: Date.now },
}, { _id: true });

const SupportConversationSchema = new mongoose.Schema({
  ref: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  side: { type: String, enum: ['person', 'shop'], default: 'person' },
  topic: { type: String, enum: TOPICS, default: 'other' },
  status: { type: String, enum: STATUSES, default: 'new', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  passedTo: { type: String, enum: [null, 'finance', 'risk', 'admin'], default: null, index: true },
  // The payment it is about, when the person picked one (0218).
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  messages: { type: [MessageSchema], default: [] },
  firstReplyAt: { type: Date, default: null },
  lastActivityAt: { type: Date, default: Date.now, index: true },
  customerUnread: { type: Number, default: 0 },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

const SupportConversation = mongoose.model('SupportConversation', SupportConversationSchema);
SupportConversation.TOPICS = TOPICS;
SupportConversation.STATUSES = STATUSES;
module.exports = SupportConversation;
