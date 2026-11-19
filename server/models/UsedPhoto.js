const mongoose = require('mongoose');

// The bytes of one picture of a used item. Uploaded before the listing
// exists; `item` is set when it is used, and an unused upload is removed
// after a day. Capped by the route at 700 KB.
const usedPhotoSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'UsedItem', default: null, index: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UsedPhoto', usedPhotoSchema);
