// The live photo, on the server.
//
// The app's camera check (frontend/features/identity/liveFaceCheck.jsx)
// sends the photo it took and the face descriptor it measured. This decides
// what happens to them:
//
//   * A face already on ANOTHER account is refused (409 face_taken). One
//     person, one GLOOBAL ID: the founder's "one people 4 phone 4 number 4
//     gloobal id … which is wrong".
//   * A face that doesn't match THIS account's own enrolled face needs the
//     PIN (403 different_face_needs_pin), and then waits 24 hours before it
//     goes live, with a notification at once and the change cancellable
//     until then (202, status "pending"). A stolen unlocked phone can't
//     quietly swap the face on an account.
//   * Anything else — the same person, or a first live photo — is saved and
//     becomes the account's enrolled face.
//
// The descriptor is stored only through lib/faceCrypto.js (AES-256-GCM).
// Without FACE_ENCRYPTION_KEY the photo is still saved but none of the face
// checks can run; the response says so (faceChecks: false) rather than
// pretending.
//
// What this can't do: prove the descriptor came from a camera. A modified
// client can post any numbers. The liveness work happens on the phone; this
// is the part that has to be on the server — comparing against faces the
// phone never sees.
const express = require('express');
const { cosineSimilarity } = require('./faceMatch');

const LIVE_PHOTO_PATH = /^\/api\/profile\/[^/]+\/live-photo\/?$/i;
const LIVE_PHOTO_WAIT_MS = 24 * 60 * 60 * 1000;
const LIVE_PHOTO_METHODS = ['moves', 'turns', 'speech']; // 'moves': three of six moves (current); the other two are older checks
const FACE_MIN_DIMENSIONS = 64;
const FACE_MAX_DIMENSIONS = 2048;

// The face library's own similarity (@vladmandic/human, src/face/match.ts):
// euclidean distance scaled and mapped to 0..1, where 0.5 and above is the
// same person in its own face-ID demo. Copied rather than imported: the
// server doesn't load a 2 MB browser bundle to do eight lines of arithmetic.
function humanSimilarity(a, b, { multiplier = 25, min = 0.2, max = 0.8 } = {}) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  const dist = Math.round(100 * multiplier * sum) / 100;
  if (dist === 0) return 1;
  const norm = (1 - Math.sqrt(dist) / 100 - min) / (max - min);
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}

// Scores are only comparable within one model, and each model family has
// its own scale. Unknown models fall back to cosine similarity.
function faceSimilarity(model, a, b) {
  if (String(model || '').startsWith('human-')) return humanSimilarity(a, b);
  return cosineSimilarity(a, b);
}

const envNumber = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback;
};

// Same person, for a photo change on one account.
function samePersonThreshold() {
  return envNumber('FACE_SAME_PERSON_THRESHOLD', 0.5);
}

// Same person across two DIFFERENT accounts: stricter, because a false
// match here stops an honest stranger (a lookalike, a twin) from joining.
function duplicateThreshold() {
  return envNumber('FACE_DUPLICATE_THRESHOLD', 0.6);
}

function readLivePhotoBody(body, validateProfilePhoto) {
  const photo = validateProfilePhoto(body && body.photo);
  if (!photo.ok) return { error: photo };
  const descriptor = body.descriptor;
  if (!Array.isArray(descriptor) || descriptor.length < FACE_MIN_DIMENSIONS || descriptor.length > FACE_MAX_DIMENSIONS ||
      !descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { error: { status: 400, code: 'invalid_descriptor', message: 'The face check result could not be read. Take the photo again.' } };
  }
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!model || model.length > 64) {
    return { error: { status: 400, code: 'invalid_model', message: 'The face check result could not be read. Take the photo again.' } };
  }
  const method = LIVE_PHOTO_METHODS.includes(body.method) ? body.method : 'turns';
  const pin = typeof body.pin === 'string' && /^\d{4,6}$/.test(body.pin) ? body.pin : null;
  return { photo, descriptor, model, method, pin };
}

// deps:
//   app, requireAuth, requireSelf, writeLimit, lookupLimit, credentialLimit
//   models: { User, FaceTemplate, ProfilePhoto, PendingPhotoChange }
//   faceCrypto            lib/faceCrypto.js
//   validateProfilePhoto  server.js's photo validator
//   checkPin(user, pin)   → { ok } | { ok:false, status, message, retryAfterSeconds? }
//   notify(user, { title, message, event })   best-effort
//   now()                 for tests
function createLivePhoto(deps) {
  const { models, faceCrypto } = deps;
  const { FaceTemplate, ProfilePhoto, PendingPhotoChange } = models;
  const now = deps.now || (() => Date.now());

  async function savePhoto(userId, photo) {
    const fields = { dataUrl: photo.dataUrl, mimeType: photo.mimeType, bytes: photo.bytes };
    try {
      await ProfilePhoto.updateOne({ userId }, { $set: fields }, { upsert: true });
    } catch (error) {
      if (error && error.code === 11000) await ProfilePhoto.updateOne({ userId }, { $set: fields });
      else throw error;
    }
  }

  async function saveTemplate(userId, envelope, model) {
    await FaceTemplate.findOneAndUpdate(
      { userId },
      {
        userId,
        ciphertext: envelope.ciphertext,
        iv: envelope.iv,
        authTag: envelope.authTag,
        dimensions: envelope.dimensions,
        model,
        livenessPassed: true,
        failedAttempts: 0,
        lockedUntil: null,
        enrolledAt: new Date(now()),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const decrypt = (row) => faceCrypto.decryptDescriptor({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag });

  // The best match on any OTHER account, enrolled or waiting out its 24
  // hours. A linear scan: fine for thousands of accounts. Past that this
  // wants a vector index, and the descriptors would need a different
  // protection than per-row encryption to be searchable.
  async function findOnOtherAccount(userId, model, descriptor) {
    const threshold = duplicateThreshold();
    let best = null;
    const consider = (row) => {
      if (String(row.userId) === String(userId)) return;
      let other;
      try { other = decrypt(row); } catch { return; }
      if (other.length !== descriptor.length) return;
      const score = faceSimilarity(model, descriptor, other);
      if (score >= threshold && (!best || score > best.score)) best = { userId: row.userId, score };
    };
    for (const row of await FaceTemplate.find({ model, userId: { $ne: userId } }).select('userId ciphertext iv authTag').lean()) consider(row);
    for (const row of await PendingPhotoChange.find({ model, userId: { $ne: userId } }).select('userId ciphertext iv authTag').lean()) consider(row);
    return best;
  }

  // A waiting change whose 24 hours are up becomes the photo and the face.
  // Run on every read that could show it, so nothing depends on a timer.
  async function applyDue(user) {
    if (!user) return false;
    const due = await PendingPhotoChange.findOneAndDelete({ userId: user._id, activateAt: { $lte: new Date(now()) } });
    if (!due) return false;
    await savePhoto(user._id, { dataUrl: due.dataUrl, mimeType: due.mimeType, bytes: due.bytes });
    await saveTemplate(user._id, { ciphertext: due.ciphertext, iv: due.iv, authTag: due.authTag, dimensions: due.dimensions }, due.model);
    await deps.notify(user, {
      title: 'Your new GLOOBAL photo is live',
      message: "The photo you changed 24 hours ago is now on your GLOOBAL ID. If this wasn't you, contact GLOOBAL support now.",
      event: 'photo_change_live',
    });
    return true;
  }

  const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, code, message, ...extra });

  async function postLivePhoto(req, res) {
    const user = req.authUser;
    const read = readLivePhotoBody(req.body, deps.validateProfilePhoto);
    if (read.error) return fail(res, read.error.status, read.error.code, read.error.message);

    if (!faceCrypto.isConfigured()) {
      // Liveness ran on the phone; the face comparisons can't run here.
      await savePhoto(user._id, read.photo);
      return res.json({ success: true, status: 'saved', faceChecks: false });
    }

    await applyDue(user);

    const taken = await findOnOtherAccount(user._id, read.model, read.descriptor);
    if (taken) {
      return fail(res, 409, 'face_taken',
        'This face is already on another GLOOBAL ID. Sign in to that one, or contact support if this is a mistake.');
    }

    const envelope = faceCrypto.encryptDescriptor(read.descriptor);
    const own = await FaceTemplate.findOne({ userId: user._id }).select('ciphertext iv authTag model dimensions').lean();
    let different = false;
    if (own && own.model === read.model && own.dimensions === read.descriptor.length) {
      const enrolled = decrypt(own);
      different = faceSimilarity(read.model, read.descriptor, enrolled) < samePersonThreshold();
    }

    if (different) {
      if (!read.pin) {
        return fail(res, 403, 'different_face_needs_pin',
          'This looks like a different person. Confirm with your PIN; the new photo goes live in 24 hours.');
      }
      const pin = await deps.checkPin(user, read.pin);
      if (!pin.ok) {
        if (pin.retryAfterSeconds) res.set('Retry-After', String(pin.retryAfterSeconds));
        return fail(res, pin.status || 401, 'wrong_pin', pin.message || 'That PIN is wrong.');
      }
      const activateAt = new Date(now() + LIVE_PHOTO_WAIT_MS);
      await PendingPhotoChange.findOneAndUpdate(
        { userId: user._id },
        {
          userId: user._id,
          dataUrl: read.photo.dataUrl,
          mimeType: read.photo.mimeType,
          bytes: read.photo.bytes,
          ciphertext: envelope.ciphertext,
          iv: envelope.iv,
          authTag: envelope.authTag,
          dimensions: envelope.dimensions,
          model: read.model,
          method: read.method,
          activateAt,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await deps.notify(user, {
        title: 'Your GLOOBAL photo is changing',
        message: `A new photo that looks like a different person was confirmed with your PIN. It goes live in 24 hours. If this wasn't you, open GLOOBAL and cancel it from your profile now.`,
        event: 'photo_change_pending',
      });
      return res.status(202).json({ success: true, status: 'pending', activateAt: activateAt.toISOString() });
    }

    // The same person (or a first live photo): live now. A fresh photo of
    // the enrolled face also cancels any different face still waiting —
    // the owner taking their own photo again is the clearest "not me".
    await savePhoto(user._id, read.photo);
    await saveTemplate(user._id, envelope, read.model);
    await PendingPhotoChange.deleteOne({ userId: user._id });
    return res.json({ success: true, status: 'saved', faceChecks: true });
  }

  async function getPending(req, res) {
    await applyDue(req.authUser);
    const row = await PendingPhotoChange.findOne({ userId: req.authUser._id }).select('dataUrl activateAt').lean();
    return res.json({ success: true, pending: row ? { photo: row.dataUrl, activateAt: row.activateAt } : null });
  }

  async function cancelPending(req, res) {
    const removed = await PendingPhotoChange.findOneAndDelete({ userId: req.authUser._id });
    return res.json({ success: true, cancelled: Boolean(removed) });
  }

  // Has this account a live-checked face? The old upload route asks, so a
  // gallery picture can't replace it from outside the camera check.
  async function hasLiveFace(userId) {
    return Boolean(await FaceTemplate.exists({ userId }));
  }

  return { postLivePhoto, getPending, cancelPending, applyDue, hasLiveFace, findOnOtherAccount };
}

function registerLivePhotoRoutes(app, deps) {
  const live = createLivePhoto(deps);
  // Photo (≤200 KB as base64) plus up to 2048 numbers: its own cap, since
  // the global 64 KB parser skips this path (server.js).
  const bodyParser = express.json({ limit: '400kb' });
  const parse = (req, res, next) => bodyParser(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, code: 'photo_too_large', message: 'That photo is too large.' });
    }
    return res.status(400).json({ success: false, code: 'invalid_photo', message: 'That photo could not be read.' });
  });
  const wrap = (label, fn) => async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      console.error(`live photo ${label} error:`, error);
      return res.status(500).json({ success: false, message: 'Could not save that photo right now. Try again.' });
    }
  };
  const { requireAuth, requireSelf, writeLimit, lookupLimit, credentialLimit } = deps;
  app.post('/api/profile/:symbolId/live-photo', credentialLimit, requireAuth, requireSelf('symbolId'), parse, wrap('save', live.postLivePhoto));
  app.get('/api/profile/:symbolId/live-photo/pending', lookupLimit, requireAuth, requireSelf('symbolId'), wrap('pending', live.getPending));
  app.delete('/api/profile/:symbolId/live-photo/pending', writeLimit, requireAuth, requireSelf('symbolId'), wrap('cancel', live.cancelPending));
  return live;
}

module.exports = {
  LIVE_PHOTO_PATH,
  LIVE_PHOTO_WAIT_MS,
  humanSimilarity,
  faceSimilarity,
  samePersonThreshold,
  duplicateThreshold,
  readLivePhotoBody,
  createLivePhoto,
  registerLivePhotoRoutes,
};
