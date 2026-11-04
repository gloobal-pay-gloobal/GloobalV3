// server/lib/rentProfile.js
//
// ── RENT PROFILE: WHAT AN OWNER RENTS OUT, ON GLOOBAL BAZAAR (0249) ─────
//
// The founder: "build my rent profile — what they are renting, at what cost
// and conditions, start with a name, first name and second name, so we can
// connect it to a GLOOBAL Bazaar filter of rent."
//
//   - A rent name of its own (first.second, built by the same rules as a
//     creator name) and unique across GLOOBAL: no shop name, no other rent
//     name.
//   - Listings: room / PG bed, flat / house, shop / office, parking / other;
//     photos; the same cost-and-conditions terms a connected rent carries;
//     an exact pin; available from; active, paused or rented.
//   - Anyone signed in finds active listings in Bazaar → Rent, and either
//     requests to rent (the existing rent request, terms filled in from the
//     listing) or chats with the owner first.
const express = require('express');
const mongoose = require('mongoose');
const RentProfile = require('../models/RentProfile');
const RentListing = require('../models/RentListing');
const User = require('../models/User');
const { cleanTerms } = require('./rentLink');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');

const TYPES = ['room', 'flat', 'shop', 'other'];
const PHOTO_MAX = 6;
const PHOTO_BYTES = 350 * 1024;
const LISTINGS_MAX = 20;

function km(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// A listing as the person who owns it sees it, or as anybody else does.
// The owner's mobile number is never in it.
function listingOut(l, profile, owner, { full = false, from = null } = {}) {
  const out = {
    id: String(l._id),
    type: l.type,
    title: l.title,
    count: l.count,
    rent: l.terms && l.terms.rent,
    deposit: (l.terms && l.terms.deposit) || 0,
    currency: l.currency,
    availableFrom: l.availableFrom || '',
    status: l.status,
    handle: profile ? profile.handle : '',
    thumb: (l.photos && l.photos[0]) || null,
    photoCount: (l.photos || []).length,
    location: { lat: l.location && l.location.lat, lng: l.location && l.location.lng, address: (l.location && l.location.address) || '', landmark: (l.location && l.location.landmark) || '' },
  };
  if (from && Number.isFinite(out.location.lat) && Number.isFinite(out.location.lng)) {
    out.distanceKm = Math.round(km(from, out.location) * 10) / 10;
  }
  if (full) {
    out.photos = l.photos || [];
    out.terms = l.terms;
    if (owner) out.owner = { symbolId: owner.symbolId, name: owner.fullName && !owner.nameIsMobile ? owner.fullName : (profile ? profile.handle : '') };
  }
  return out;
}

function cleanListing(body) {
  const b = body && typeof body === 'object' ? body : {};
  const type = TYPES.includes(b.type) ? b.type : null;
  if (!type) return { error: 'Pick what you are renting.' };
  const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (title.length < 3) return { error: 'Give it a name people will understand, like "Furnished room near the bus stand".' };
  const count = Math.max(1, Math.min(99, Math.round(Number(b.count) || 1)));
  const terms = cleanTerms({ ...(b.terms || {}), dueDay: (b.terms && b.terms.dueDay) || 5 });
  if (terms.error) return { error: terms.error };
  const photos = [];
  for (const p of Array.isArray(b.photos) ? b.photos.slice(0, PHOTO_MAX) : []) {
    const s = String(p || '');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(s)) return { error: 'A photo must be a picture (JPEG, PNG or WebP).' };
    if (s.length * 0.75 > PHOTO_BYTES) return { error: 'One of the photos is too big. Try again; the app makes them smaller.' };
    photos.push(s);
  }
  const loc = b.location || {};
  const lat = Number(loc.lat);
  const lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return { error: 'Put the pin where the place is.' };
  const address = String(loc.address || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (address.length < 4) return { error: 'Add the address.' };
  const availableFrom = /^\d{4}-\d{2}-\d{2}$/.test(String(b.availableFrom || '')) ? String(b.availableFrom) : '';
  return {
    v: {
      type, title, count, photos, terms: terms.t, availableFrom,
      location: { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, address, landmark: String(loc.landmark || '').replace(/\s+/g, ' ').trim().slice(0, 80) },
    },
  };
}

function registerRentProfileRoutes(app, { requireAuth, writeLimit, lookupLimit, buildHandle, brandRefusal, creatorHandleTaken }) {
  const fail = (res, status, message, code) => res.status(status).json({ success: false, message, ...(code ? { code } : {}) });
  const wrap = (label, fn) => async (req, res) => {
    try { return await fn(req, res); } catch (error) {
      if (error && error.code === 11000) return fail(res, 409, 'That name is already taken.', 'taken');
      console.error(`rent profile ${label} error:`, error);
      return fail(res, 500, 'Could not do that just now. Try again.');
    }
  };
  const listingBody = express.json({ limit: '3mb' });
  const parseListing = (req, res, next) => listingBody(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') return fail(res, 413, 'Those photos are too big together. Try fewer.');
    return fail(res, 400, 'That could not be read.');
  });

  // The name, checked: same rules as a creator name, and free of every
  // creator name and every other rent name.
  async function checkName(first, last, userId) {
    const built = buildHandle(first, last);
    if (!built.ok) return { ok: false, code: built.code, message: built.message };
    const brand = brandRefusal(built, null);
    if (brand) return { ok: false, code: brand.code, message: brand.message };
    const rent = await RentProfile.findOne({ handle: built.handle }).select('userId').lean();
    if (rent && String(rent.userId) !== String(userId)) return { ok: false, code: 'taken', message: 'That name is already taken.' };
    if (await creatorHandleTaken(built.handle, null)) return { ok: false, code: 'taken', message: 'A shop already has that name.' };
    return { ok: true, handle: built.handle };
  }

  app.get('/api/rent/name-available', lookupLimit, requireAuth, wrap('name check', async (req, res) => {
    const c = await checkName(req.query.first, req.query.last, req.authUser._id);
    return res.json({ success: true, available: c.ok, handle: c.handle || '', code: c.code || '', message: c.message || '' });
  }));

  app.get('/api/rent/profile', lookupLimit, requireAuth, wrap('mine', async (req, res) => {
    const profile = await RentProfile.findOne({ userId: req.authUser._id }).lean();
    if (!profile) return res.json({ success: true, profile: null, listings: [] });
    const rows = await RentListing.find({ profileId: profile._id }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, profile: { handle: profile.handle, since: profile.createdAt }, listings: rows.map((l) => listingOut(l, profile, req.authUser, { full: true })) });
  }));

  app.post('/api/rent/profile', writeLimit, requireAuth, wrap('name', async (req, res) => {
    const b = req.body || {};
    const c = await checkName(b.first, b.last, req.authUser._id);
    if (!c.ok) return fail(res, 409, c.message, c.code);
    const profile = await RentProfile.findOneAndUpdate({ userId: req.authUser._id }, { $set: { handle: c.handle } }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
    return res.json({ success: true, profile: { handle: profile.handle, since: profile.createdAt } });
  }));

  app.post('/api/rent/listings', writeLimit, requireAuth, parseListing, wrap('add', async (req, res) => {
    const profile = await RentProfile.findOne({ userId: req.authUser._id }).lean();
    if (!profile) return fail(res, 409, 'Pick your rent name first.');
    if ((await RentListing.countDocuments({ profileId: profile._id })) >= LISTINGS_MAX) return fail(res, 409, `${LISTINGS_MAX} listings is the most for now.`);
    const c = cleanListing(req.body);
    if (c.error) return fail(res, 400, c.error);
    const countryIso = accountCountryIso(req.authUser);
    const currency = (await localCurrencyFor(countryIso)) || 'INR';
    const l = await RentListing.create({ ...c.v, userId: req.authUser._id, profileId: profile._id, currency, countryIso, status: 'active' });
    return res.status(201).json({ success: true, listing: listingOut(l.toObject(), profile, req.authUser, { full: true }) });
  }));

  app.put('/api/rent/listings/:id', writeLimit, requireAuth, parseListing, wrap('edit', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'No such listing.');
    const l = await RentListing.findOne({ _id: req.params.id, userId: req.authUser._id });
    if (!l) return fail(res, 404, 'No such listing.');
    const c = cleanListing(req.body);
    if (c.error) return fail(res, 400, c.error);
    Object.assign(l, c.v);
    l.markModified('terms');
    await l.save();
    const profile = await RentProfile.findById(l.profileId).lean();
    return res.json({ success: true, listing: listingOut(l.toObject(), profile, req.authUser, { full: true }) });
  }));

  app.post('/api/rent/listings/:id/status', writeLimit, requireAuth, wrap('status', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'No such listing.');
    const status = String((req.body || {}).status || '');
    if (!['active', 'paused', 'rented'].includes(status)) return fail(res, 400, 'Active, paused or rented.');
    const l = await RentListing.findOneAndUpdate({ _id: req.params.id, userId: req.authUser._id }, { $set: { status } }, { new: true }).lean();
    if (!l) return fail(res, 404, 'No such listing.');
    const profile = await RentProfile.findById(l.profileId).lean();
    return res.json({ success: true, listing: listingOut(l, profile, req.authUser, { full: true }) });
  }));

  // Bazaar → Rent. Active listings, newest first, or nearest first when a
  // place is given; by type, by most rent a month, and by words.
  app.get('/api/rent/listings', lookupLimit, requireAuth, wrap('search', async (req, res) => {
    const q = req.query || {};
    const match = { status: 'active' };
    if (TYPES.includes(q.type)) match.type = q.type;
    const max = Number(q.max);
    if (max > 0) match['terms.rent'] = { $lte: max };
    const words = String(q.q || '').trim().slice(0, 60);
    const lat = Number(q.lat);
    const lng = Number(q.lng);
    const from = String(q.lat || '').trim() && String(q.lng || '').trim() && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    const radius = Math.max(0.2, Math.min(50, Number(q.km) || 0));
    const rows = await RentListing.find(match).select('-photos').sort({ createdAt: -1 }).limit(400).lean();
    const thumbs = new Map((await RentListing.find({ _id: { $in: rows.map((r) => r._id) } }, { photos: { $slice: 1 } }).lean()).map((r) => [String(r._id), r.photos || []]));
    const profiles = new Map((await RentProfile.find({ _id: { $in: [...new Set(rows.map((r) => String(r.profileId)))] } }).lean()).map((p) => [String(p._id), p]));
    const re = words ? new RegExp(words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    let out = rows.map((r) => {
      const profile = profiles.get(String(r.profileId));
      return listingOut({ ...r, photos: thumbs.get(String(r._id)) || [] }, profile, null, { from });
    }).filter((l) => !re || re.test(l.title) || re.test(l.handle) || re.test(l.location.address) || re.test(l.location.landmark));
    if (from && Number(q.km) > 0) out = out.filter((l) => Number.isFinite(l.distanceKm) && l.distanceKm <= radius);
    if (from) out.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return res.json({ success: true, listings: out.slice(0, 60) });
  }));

  app.get('/api/rent/listings/:id', lookupLimit, requireAuth, wrap('read', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'No such listing.');
    const l = await RentListing.findById(req.params.id).lean();
    const mine = l && String(l.userId) === String(req.authUser._id);
    if (!l || (l.status !== 'active' && !mine)) return fail(res, 404, 'This listing is not on GLOOBAL Bazaar any more.');
    const [profile, owner] = await Promise.all([RentProfile.findById(l.profileId).lean(), User.findById(l.userId).select('symbolId fullName nameIsMobile').lean()]);
    return res.json({ success: true, listing: { ...listingOut(l, profile, owner, { full: true }), mine } });
  }));

  // A rent name's page: its active listings.
  app.get('/api/rent/p/:handle', lookupLimit, requireAuth, wrap('page', async (req, res) => {
    const profile = await RentProfile.findOne({ handle: String(req.params.handle || '').trim() }).lean();
    if (!profile) return fail(res, 404, 'No rent profile has that name.');
    const rows = await RentListing.find({ profileId: profile._id, status: 'active' }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, profile: { handle: profile.handle, since: profile.createdAt }, listings: rows.map((l) => listingOut(l, profile, null)) });
  }));
}

// The terms a request started from a listing begins with.
async function listingTermsFor(listingId, ownerUserId) {
  if (!listingId || !mongoose.isValidObjectId(listingId)) return null;
  const l = await RentListing.findOne({ _id: listingId, userId: ownerUserId }).select('terms').lean();
  return l ? l.terms : null;
}

module.exports = { registerRentProfileRoutes, cleanListing, listingTermsFor, RENT_LISTING_PATH: /^\/api\/rent\/listings(\/[^/]+)?\/?$/i };
