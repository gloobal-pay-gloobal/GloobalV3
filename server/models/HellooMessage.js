const mongoose = require('mongoose');

// One message in a Helloo chat.
//
//   text     — `text`
//   voice    — `voice` (seconds, mime); the audio itself is in HellooVoice so
//              listing a thread never pulls audio bytes
//   photo    — `photo` (size, type); the picture is in HellooVoice too
//   payment  — `payment` (what the payer sent, and what arrived), copied from a real GLOOBAL Transaction the sender
//              made to the other member. The server looks the transaction up
//              by referenceId and refuses anything that is not a successful
//              payment between these two people, so a payment bubble is never
//              something a client merely claimed.
//
// `clientId` makes a send idempotent: the app retries with the same id after a
// timeout or a cold start, and the second arrival returns the first message
// instead of posting it twice.
const hellooMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'HellooConversation', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['text', 'voice', 'payment', 'photo'], required: true },
    clientId: { type: String, required: true, maxlength: 80 },
    text: { type: String, default: '', maxlength: 4000 },
    voice: {
      seconds: { type: Number, default: 0 },
      mime: { type: String, default: '' },
      bytes: { type: Number, default: 0 },
    },
    // A photo: the picture itself is in HellooVoice (the chat's media store),
    // `text` holds an optional caption.
    photo: {
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
      mime: { type: String, default: '' },
      bytes: { type: Number, default: 0 },
    },
    // The message this one answers, copied at the time so the quote still
    // reads if the original is deleted later.
    replyTo: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      from: { type: mongoose.Schema.Types.ObjectId, default: null },
      kind: { type: String, default: '' },
      preview: { type: String, default: '' },
    },
    // "Delete for me": hidden from these members only.
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // "Delete for everyone": the content is wiped and both people see
    // "This message was deleted".
    deletedAt: { type: Date, default: null },
    // Paid to reach: the GLOOBAL transfer (payMethod "helloo-reach") the
    // sender made to the receiver for this one message, in the receiver's
    // currency. Checked against the real Transaction before it is stored.
    paid: {
      referenceId: { type: String, default: '' },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: '' },
    },
    payment: {
      referenceId: { type: String, default: '' },
      amount: { type: Number, default: 0 },
      currency: { type: String, default: '' },
      // What the other side received, when it crossed a currency.
      destAmount: { type: Number, default: 0 },
      destCurrency: { type: String, default: '' },
      note: { type: String, default: '' },
      toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      // "giveback": the receiver returning part of what a sender paid to
      // reach them (payMethod "helloo-giveback"); "" for an ordinary payment.
      purpose: { type: String, default: '' },
      percent: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

hellooMessageSchema.index({ conversationId: 1, createdAt: -1 });
hellooMessageSchema.index({ conversationId: 1, from: 1, clientId: 1 }, { unique: true });
// A payment can be posted into a chat once.
hellooMessageSchema.index(
  { conversationId: 1, 'payment.referenceId': 1 },
  { unique: true, partialFilterExpression: { kind: 'payment' } }
);

// A reach payment pays for one message only.
hellooMessageSchema.index(
  { 'paid.referenceId': 1 },
  { unique: true, partialFilterExpression: { 'paid.referenceId': { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('HellooMessage', hellooMessageSchema);
