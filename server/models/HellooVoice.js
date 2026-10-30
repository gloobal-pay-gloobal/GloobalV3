const mongoose = require('mongoose');

// The audio of a Helloo voice note, kept apart from HellooMessage so a thread
// can be listed without dragging audio along. Capped by the route (2 minutes,
// 600 KB), which keeps every document far below Mongo's 16 MB limit.
const hellooVoiceSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'HellooMessage', required: true, unique: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'HellooConversation', required: true, index: true },
    mime: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HellooVoice', hellooVoiceSchema);
