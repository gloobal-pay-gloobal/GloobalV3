// models/RentLink.js — two people connected over one rented place (0232).
//
// Before this, each side saved its own RentPlace and the two copies never
// met: a tenant could write any rent against anybody, and the owner never
// agreed to it. A link is the one record both of them share:
//
//   requested   the tenant asked to connect; waiting for the owner, who
//               accepts by sending the first terms (or declines)
//   terms       the owner sent terms (or started it themselves, with
//               terms); waiting for the tenant to accept version 1
//   connected   both agreed; each side has its RentPlace (`tenantPlaceId`,
//               `ownerPlaceId`) and rent, the extras and the due day come
//               from the ACCEPTED version of the terms
//   declined / cancelled / ended   finished; documents are deleted at once
//
// Terms are versioned and never edited in place. The owner writes a new
// version; it is in force only once the tenant accepts it — until then the
// last accepted version still is, and the place does not pay by itself.
//
// Meter readings are the owner's, for an extra charged "by meter": units ×
// the accepted rate. A reading is on the next bill if it was added after
// the last rent payment for the place, so one entered late simply rides the
// following month — no reading is ever charged twice or lost.
const mongoose = require('mongoose');

const ExtraSchema = new mongoose.Schema({
  key: { type: String, required: true },
  // included   in the rent, nothing more to pay
  // fixed      `amount` added to every month's bill
  // meter      units × `rate`, from the owner's readings
  // own        the tenant pays the provider directly; nothing here
  mode: { type: String, enum: ['included', 'fixed', 'meter', 'own'], required: true },
  amount: { type: Number, default: 0, min: 0 },
  rate: { type: Number, default: 0, min: 0 },
}, { _id: false });

const TermsSchema = new mongoose.Schema({
  rent: { type: Number, required: true, min: 1 },
  dueDay: { type: Number, required: true, min: 1, max: 28 },
  deposit: { type: Number, default: 0, min: 0 },
  extras: { type: [ExtraSchema], default: [] },
  noticeMonths: { type: Number, default: 1, min: 0, max: 12 },
  lockInMonths: { type: Number, default: 0, min: 0, max: 60 },
  lateFee: { type: Number, default: 0, min: 0 },
  lateAfterDays: { type: Number, default: 0, min: 0, max: 28 },
  yearlyIncreasePct: { type: Number, default: 0, min: 0, max: 50 },
  rules: { type: [String], default: [] },
  lines: { type: [String], default: [] },
}, { _id: false });

const RentLinkSchema = new mongoose.Schema({
  tenantUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startedBy: { type: String, enum: ['tenant', 'owner'], required: true },
  status: { type: String, enum: ['requested', 'terms', 'connected', 'declined', 'cancelled', 'ended'], required: true, index: true },
  tenantPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentPlace', default: null },
  ownerPlaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentPlace', default: null },
  currency: { type: String, required: true, uppercase: true },
  tz: { type: String, default: 'UTC' },
  // What the person who started it asked for.
  proposal: {
    name: { type: String, default: '' },
    rent: { type: Number, default: 0 },
    dueDay: { type: Number, default: 1 },
    moveIn: { type: String, default: '' }, // YYYY-MM-DD
    // 0249: the Bazaar listing this request was made from, if any.
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentListing', default: null },
  },
  terms: {
    type: [new mongoose.Schema({ v: Number, at: Date, t: TermsSchema }, { _id: false })],
    default: [],
  },
  acceptedV: { type: Number, default: 0 },
  asks: {
    type: [new mongoose.Schema({ v: Number, line: String, note: String, at: Date }, { _id: false })],
    default: [],
  },
  meter: {
    type: [new mongoose.Schema({ key: String, from: Number, to: Number, at: Date }, { _id: true })],
    default: [],
  },
  docRequests: { type: [String], default: [] },
  events: {
    type: [new mongoose.Schema({ at: Date, kind: String, by: String, v: Number }, { _id: false })],
    default: [],
  },
  endedAt: { type: Date, default: null },
}, { timestamps: true });

RentLinkSchema.index({ tenantUserId: 1, ownerUserId: 1, status: 1 });

module.exports = mongoose.model('RentLink', RentLinkSchema);
