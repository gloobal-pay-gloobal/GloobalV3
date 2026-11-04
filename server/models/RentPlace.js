// models/RentPlace.js — a place rent moves for, saved by one account (0195).
//
// Two kinds, from the account's own point of view:
//
//   live       a place I live in: I pay rent here, to `counterpartySymbolId`,
//              `amount` on `dueDay` of every month — by itself (mode auto)
//              or after a reminder (mode ask)
//   creating   a place I am creating (my room, my flat, my shop space): rent
//              comes to me here, from `counterpartySymbolId`, expected on
//              `dueDay`; nothing is ever pulled from them, I just see whether
//              it arrived and can send a reminder
//
// A place holds no money. Every rupee that moves is an ordinary Transaction
// carrying `metadata.rentPlaceId`, which is also how "paid this month" and
// the history on a place's page are counted: from real payments, never from
// a flag set here.
//
// `mandateAt` is when the owner approved paying by itself with their PIN.
// The auto-settle job refuses a place without one, and changing the amount,
// the day or the payee clears it, so the PIN is asked again for the new
// instruction.
const mongoose = require('mongoose');

const RentPlaceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['live', 'creating'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    counterpartySymbolId: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    // 1..28, so every month has it.
    dueDay: { type: Number, required: true, min: 1, max: 28 },
    // live only. 'auto' pays by itself on the day; 'ask' reminds.
    mode: { type: String, enum: ['auto', 'ask'], default: 'ask' },
    remindDaysBefore: { type: Number, default: 2, min: 0, max: 10 },
    // The IANA zone the owner set the place in, so "the 1st" is their 1st.
    tz: { type: String, default: 'UTC' },
    active: { type: Boolean, default: true },
    mandateAt: { type: Date, default: null },
    // 0232: a place made by a connection (lib/rentLink.js). Its rent and
    // day follow the terms both people accepted, and its monthly figure is
    // the bill: rent plus the extras.
    linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentLink', default: null },
    // Months (YYYY-MM) the auto job has already tried, with the outcome, so
    // a short balance is reported once and a success is never repeated.
    attempts: {
      type: [new mongoose.Schema({ month: String, at: Date, outcome: String, referenceId: String }, { _id: false })],
      default: [],
    },
    reminders: {
      type: [new mongoose.Schema({ month: String, at: Date, kind: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

RentPlaceSchema.index({ userId: 1, active: 1 });
RentPlaceSchema.index({ kind: 1, mode: 1, active: 1, dueDay: 1 });

module.exports = mongoose.model('RentPlace', RentPlaceSchema);
