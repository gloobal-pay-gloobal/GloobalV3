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
    kind: { type: String, enum: ['text', 'voice', 'payment', 'photo', 'video', 'call', 'order', 'sticker'], required: true },
    // A short video clip (a snap): its bytes are in the chat's media store,
    // like a photo's.
    video: { seconds: { type: Number, default: 0 }, width: { type: Number, default: 0 }, height: { type: Number, default: 0 }, mime: { type: String, default: '' }, bytes: { type: Number, default: 0 } },
    // How long a photo or clip stays: 'keep' (in the chat, may be saved),
    // 'once' (gone after the other person opens it), 'day' (gone after 24
    // hours). Empty on older messages, which behave as 'keep'.
    view: { mode: { type: String, default: '' }, openedAt: { type: Date, default: null }, expiresAt: { type: Date, default: null },
      // Whether the sender let it be saved to the other phone. Off unless
      // they turn it on: a private picture stays inside Helloo.
      save: { type: Boolean, default: false } },
    // Every time the other person's phone asked for the bytes (the last 50),
    // and how many times in all: the sender sees it was opened, and when.
    opens: { type: [{ by: mongoose.Schema.Types.ObjectId, at: Date, _id: false }], default: [] },
    openCount: { type: Number, default: 0 },
    // Taken back by the sender: the bytes are deleted and it opens for nobody.
    takenBackAt: { type: Date, default: null },
    // Forwarded: this message holds no bytes of its own. It points at the
    // ORIGINAL message (the first one sent), whose single stored copy every
    // forward opens — so passing a photo on adds nothing to storage, and
    // taking the original back closes every forward at once. Never a chain:
    // a forward of a forward points at the same original.
    mediaFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'HellooMessage', default: null, index: true },
    forwarded: { type: Boolean, default: false },
    // The sender said it may not be passed on (set on the original).
    noForward: { type: Boolean, default: false },
    // Where this media belongs. `country` is the sender's own. `countries`
    // is every country it is kept in: the sender's and, when the chat
    // crosses a border, the receiver's too — so each country holds what its
    // own people sent and received, and neither needs the other's vault.
    // `sharedWith` says exactly who it went to: which GLOOBAL ID, in which
    // country. Nobody looks without a reason; when there is one, this is
    // what says whose it is and where it may be read.
    country: { type: String, default: '', uppercase: true, maxlength: 2 },
    countries: { type: [String], default: [] },
    sharedWith: { type: [{ userId: mongoose.Schema.Types.ObjectId, gloobalId: String, country: String, _id: false }], default: [] },
    // The look the sender picked (a named filter the app draws); and who
    // saved it to their phone, so the sender is told.
    fx: { type: String, default: '', maxlength: 20 },
    savedBy: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // A sticker is only its name: the picture is drawn by the app, so
    // nothing is uploaded and nothing here can carry a file.
    sticker: {
      id: { type: String, default: '', maxlength: 40 },
      // id 'mine': the sender's own Kullu, as its few choices (never a picture).
      mood: { type: String, maxlength: 10 },
      cup: { type: String, maxlength: 7 },
      prop: { type: String, maxlength: 8 },
      words: { type: String, maxlength: 16 },
    },
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
    // An order from the shop's GLOOBAL Bazaar price list, paid for when it
    // was placed (lib/hellooOrders.js). `payment` holds the transfer; this
    // holds what was bought and the shop's answer.
    order: {
      items: [{ _id: false, itemId: { type: String, default: '' }, title: { type: String, default: '' }, qty: { type: Number, default: 1 }, price: { type: Number, default: 0 } }],
      total: { type: Number, default: 0 },
      currency: { type: String, default: '' },
      note: { type: String, default: '', maxlength: 120 },
      status: { type: String, default: '' },
      statusAt: { type: Date, default: null },
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
    // A call between the two, shown in the chat when it is over.
    call: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      video: { type: Boolean, default: false },
      status: { type: String, default: '' },
      seconds: { type: Number, default: 0 },
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

// A payment pays for one order only.
hellooMessageSchema.index(
  { 'payment.referenceId': 1 },
  { unique: true, partialFilterExpression: { kind: 'order' }, name: 'order_payment_once' }
);

// A reach payment pays for one message only.
hellooMessageSchema.index(
  { 'paid.referenceId': 1 },
  { unique: true, partialFilterExpression: { 'paid.referenceId': { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('HellooMessage', hellooMessageSchema);
