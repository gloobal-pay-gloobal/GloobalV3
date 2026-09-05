const mongoose = require('mongoose');

// The bytes of one project attachment.
//
// ── Why the file lives in MongoDB ────────────────────────────────────────
//
// This system had no file upload of any kind: no multer, no static file
// serving, no object-storage client, no bucket configuration. So there was
// nothing to reuse, and the choice was between adding an external storage
// provider or using the persistent store this project already has.
//
// Render's filesystem is EPHEMERAL — it is wiped on every deploy and every
// restart — so writing uploads to local disk would have looked like it
// worked and quietly lost every file, which is the one option that is worse
// than not shipping the feature. MongoDB Atlas is where everything else
// this app persists already lives, it is genuinely durable, it is backed
// up with the rest of the data, and it needs no new credential in the
// environment and therefore no new secret in the repository.
//
// The honest limits of that choice, stated rather than discovered later:
//
//   * A MongoDB document is capped at 16 MB, so the route caps an upload
//     well below that (see PROJECT_ATTACHMENT_MAX_BYTES). This is for a
//     project brief or a photograph, not a video.
//   * Bytes are served back through the API process rather than from a CDN,
//     so every download costs application memory and bandwidth. Fine at
//     this scale; not what you would build for thousands of downloads.
//
// When either of those starts to bite, the upgrade is object storage (S3,
// R2, GCS) and the shape of this collection is already the right shape for
// it: replace `data` with a bucket key and leave every other field, and
// the route contract does not change. What that would need, and does not
// exist today, is a bucket plus credentials in the server environment —
// exactly the configuration dependency that made local disk look tempting.
const ProjectAttachmentSchema = new mongoose.Schema({
  // Set once the owning Project exists. Kept so an orphaned attachment
  // (upload accepted, project deleted) is findable and removable rather
  // than becoming an untraceable blob.
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },

  // Who uploaded it. Authorization for reading and deleting the bytes is
  // decided from the PROJECT (a published project's attachment is readable
  // by anyone who can see the project); this is provenance.
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // The name as uploaded, for the download. Sanitised in the route — a
  // filename is attacker-controlled text and reaches a Content-Disposition
  // header, so path separators and control characters are stripped before
  // it is ever stored.
  filename: { type: String, required: true, trim: true, maxlength: 200 },

  // Taken from the allow-list in the route, never from what the client
  // claimed, so this can be echoed back as a Content-Type safely.
  contentType: { type: String, required: true, trim: true, maxlength: 120 },

  byteSize: { type: Number, required: true, min: 0 },

  data: { type: Buffer, required: true },
}, { timestamps: true });

module.exports = mongoose.model('ProjectAttachment', ProjectAttachmentSchema);
