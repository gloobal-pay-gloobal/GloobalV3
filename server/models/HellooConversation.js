const mongoose = require('mongoose');

// A Helloo chat between two GLOOBAL accounts.
//
// One document per PAIR, found by `pairKey` (the two account ids sorted and
// joined), so "open a chat with X" is an idempotent upsert and two people can
// never end up with two parallel threads. Groups are not in Release 1; when
// they come they get their own kind rather than bending this one.
//
// The newest message is copied onto the conversation (`last`) so the chat list
// is one query, not one per row. `reads` holds, per member, the time up to
// which they have read (unread counts are derived from it) and that member's
// own mute / pin / clear settings.
const hellooConversationSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessageAt: { type: Date, default: null },
    last: {
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      kind: { type: String, default: '' },
      preview: { type: String, default: '', maxlength: 160 },
    },
    reads: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: null },
        // This member's own settings for the chat. Nobody else sees them.
        muted: { type: Boolean, default: false },
        pinned: { type: Boolean, default: false },
        // "Clear chat" / "Delete chat": messages up to here are gone for this
        // member only. A deleted chat comes back when a new message arrives.
        clearedAt: { type: Date, default: null },
      },
    ],
  },
  { timestamps: true }
);

hellooConversationSchema.index({ members: 1, lastMessageAt: -1 });

module.exports = mongoose.model('HellooConversation', hellooConversationSchema);
