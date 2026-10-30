const mongoose = require('mongoose');

// The media of a Helloo message — a voice note's audio or a photo — kept
// apart from HellooMessage so a thread can be listed without dragging bytes
// along. Capped by the route (600 KB), far below Mongo's 16 MB limit. The
// model keeps its first name so the collection already in use is reused.
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
