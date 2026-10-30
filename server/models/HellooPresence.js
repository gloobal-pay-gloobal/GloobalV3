const mongoose = require('mongoose');

// When somebody was last in Helloo: written when their last open socket
// closes. "Online" itself is not stored — it is whether a socket is open
// right now, which only the running server knows.
const hellooPresenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HellooPresence', hellooPresenceSchema);
