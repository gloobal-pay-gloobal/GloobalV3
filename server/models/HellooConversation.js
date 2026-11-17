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
      // What the sender paid to reach the receiver with this message, when
      // it was a paid one: the chat list marks it ("Paid you 2.00").
      paidAmount: { type: Number, default: 0 },
      paidCurrency: { type: String, default: '' },
    },
    // A private chat released once for somebody who forgot its name: both
    // kept it private; `by` (who remembers) let `for` (who forgot) see it
    // once, for ten minutes, after their PIN. One release a day per chat.
    release: {
      _id: false,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      for: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      openedAt: { type: Date, default: null },
    },
    reads: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: null },
        // This member's own settings for the chat. Nobody else sees them.
        muted: { type: Boolean, default: false },
        pinned: { type: Boolean, default: false },
        // What THIS member calls the chat: "Papa", "()+", anything. Their
        // own word for it; the other person never sees it.
        savedName: { type: String, default: '', maxlength: 40 },
        // A private chat: on this member's Helloo it appears only when its
        // whole saved name is typed, and it makes no notification, count
        // or sound for them. Always has a saved name.
        private: { type: Boolean, default: false },
        // A business's paid message is shown on this member's Helloo home
        // (it is not personal). This keeps one business off it.
        offHome: { type: Boolean, default: false },
        // Which of this member's sides the chat is on, when their account
        // is both a person and a shop: 'shop' or 'self'. Empty means the
        // shop when the account has one (as before sides existed).
        side: { type: String, enum: ['', 'shop', 'self'], default: '' },
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
