// server/lib/projectSuppliers.js
//
// ── HOOMAN PROJECTS: WHICH SELLER GLOOBAL BUYS FROM ──────────────────────
//
// A project's material and tech lines (cement, steel, solar panels) are not
// paid to the applicant to spend. GLOOBAL buys them itself, from sellers on
// GLOOBAL बाज़ार near the project's site — and GLOOBAL chooses the seller,
// never the person doing the project: a road with ten cement sellers
// around it gets the cement from the one GLOOBAL picks.
//
// For each such line this ranks the sellers and says why, in words. For now
// a reviewer confirms GLOOBAL's choice with one tap (or picks another and
// says why, or marks it "no suitable seller — paid against receipts").
// Later, Hooman Intelligence picks on its own; the ranking is the same.
//
// WHO IS A CANDIDATE
//   * a listed shop GLOOBAL has not hidden, with a public, pinned address
//     (a private address is never used to measure anything)
//   * in the line's Bazaar category (its main or second one)
//   * within 25 km of the site; 50, then 100 km when fewer than three are
//     found that close
//   * NOT connected to the applicant: not the applicant, not one of their
//     own shops (or a shop of the same owner), nobody they look after or
//     who looks after them, and nobody they paid or were paid by three or
//     more times in the last 90 days. Each one left out is listed with the
//     reason, for the reviewer.
//
// HOW THEY ARE RANKED (out of 100)
//   price     30  the listed price of a matching item, against the lowest
//                 nearby. A check only: sellers quote per order later. No
//                 listed price counts as middling, not as cheapest.
//   record    20  stars from paying customers (weighted towards 3.5 until
//                 there are several), less complaints in the last year
//   distance  20  closer is better, within the radius searched
//   fit       10  sells exactly that (its sub-category), not only the
//                 category
//   share     10  Creator Share (cashback to payers), up to 7%
//   spread    10  not already picked for other projects lately — so
//                 GLOOBAL's buying is shared out, not handed to one shop
//
// Nothing here moves money; ordering and paying sellers is the next step.

const bazaar = require('./bazaar');

const RADII_KM = [25, 50, 100];
const ENOUGH = 3;                // candidates before the radius stops widening
const SHOWN = 5;                 // ranked sellers returned per line
const REGULAR_PAYMENTS = 3;      // this many payments either way = connected
const CONNECTED_DAYS = 90;
const COMPLAINT_DAYS = 365;
const SPREAD_DAYS = 90;
const MAX_SHARE = 0.07;
const WEIGHTS = { price: 30, record: 20, distance: 20, fit: 10, share: 10, spread: 10 };
const PICK_STATES = ['submitted', 'under_review', 'needs_info', 'approved', 'funding', 'paused'];
const SELLER_KINDS = ['material', 'tech'];
const DAY = 86400000;
// Words that say nothing about WHAT is bought.
const STOP = new Set(['for', 'the', 'and', 'with', 'from', 'per', 'all', 'new', 'one', 'two', 'bag', 'bags', 'piece', 'pieces', 'pcs', 'kg', 'nos', 'set', 'sets', 'road', 'work', 'site', 'house', 'school', 'building']);

const clip = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const idOf = (v) => (v == null ? '' : String(v._id || v));
const tokens = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((t) => !STOP.has(t));
const round1 = (n) => Math.round(n * 10) / 10;

// Which listed item, if any, is the thing the line buys: the one sharing
// most words with the line's name and grade, then the cheapest of those.
// Answers the item, with `hits` (how many of the line's words it shares).
function matchItem(line, items) {
  const want = Array.from(new Set([...tokens(line.label), ...tokens(line.quality)]));
  if (!want.length) return null;
  let best = null;
  for (const it of items) {
    const have = new Set(tokens(`${it.title} ${it.note || ''}`));
    const hits = want.filter((w) => have.has(w) || Array.from(have).some((h) => h.startsWith(w) || w.startsWith(h))).length;
    if (!hits) continue;
    if (!best || hits > best.hits || (hits === best.hits && it.price < best.item.price)) best = { item: it, hits };
  }
  return best ? { ...best.item, hits: best.hits } : null;
}

// Stars weighted towards 3.5 until there are several reviews, as 0..1.
function recordScore(stars, complaints) {
  const n = stars.length;
  const avg = n ? stars.reduce((a, s) => a + s, 0) / n : 0;
  const weighted = (avg * n + 3.5 * 3) / (n + 3);
  return { avg: n ? round1(avg) : null, count: n, score: Math.max(0, Math.min(1, weighted / 5 - Math.min(0.5, complaints * 0.1))) };
}

// One candidate's place, and the reason in plain words.
function scoreAll(rows, { radiusKm, wantSub }) {
  const priced = rows.filter((r) => r.unitMinor != null);
  const lowest = priced.length ? Math.min(...priced.map((r) => r.unitMinor)) : null;
  for (const r of rows) {
    const s = {
      price: r.unitMinor == null ? 0.4 : lowest > 0 ? lowest / r.unitMinor : 1,
      record: r.record.score,
      distance: Math.max(0, 1 - r.distanceKm / radiusKm),
      fit: !wantSub || r.subcategory === wantSub ? 1 : 0.4,
      share: Math.min(1, (r.cashbackRate || 0) / MAX_SHARE),
      spread: 1 / (1 + r.recentPicks),
    };
    r.signals = s;
    r.score = Math.round(Object.entries(WEIGHTS).reduce((a, [k, w]) => a + w * s[k], 0));
  }
  rows.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm || String(a.name).localeCompare(String(b.name)));
  rows.forEach((r, i) => {
    const parts = [];
    if (r.unitMinor == null && r.item) parts.push(`lists ${r.item.title}, not exactly this — will quote`);
    else if (r.unitMinor == null) parts.push('no listed price yet — will quote');
    else if (r.unitMinor === lowest) parts.push(priced.length > 1 ? `lowest listed price of ${priced.length} nearby` : 'has a listed price');
    else parts.push(`listed price ${Math.round((r.unitMinor / lowest - 1) * 100)}% above the lowest`);
    parts.push(`${r.distanceKm} km from the site`);
    parts.push(r.record.count ? `${r.record.avg}★ from ${r.record.count} review${r.record.count === 1 ? '' : 's'}` : 'no reviews yet');
    parts.push(r.complaints ? `${r.complaints} complaint${r.complaints === 1 ? '' : 's'} in a year` : 'no complaints in a year');
    if (wantSub && r.subcategory !== wantSub) parts.push('sells in this category, not this exact kind');
    if (r.cashbackRate > 0) parts.push(`gives ${Math.round(r.cashbackRate * 1000) / 10}% Creator Share`);
    parts.push(r.recentPicks ? `already picked for ${r.recentPicks} other project${r.recentPicks === 1 ? '' : 's'} lately` : 'not picked for another project lately');
    r.rank = i + 1;
    r.reason = parts.join(' · ');
  });
  return rows;
}

function createProjectSuppliers(deps) {
  const { Project, User, CreatorItem, CreatorReview, Complaint, CareLink, Transaction, review, now = () => Date.now() } = deps;
  const refuse = (res, status, message, code) => res.status(status).json({ success: false, ...(code ? { code } : {}), message });

  // Everyone the applicant is connected to, with why — never a candidate.
  async function connectionsOf(owner) {
    const ownerId = idOf(owner);
    const why = new Map();
    const mark = (id, reason) => { if (id && !why.has(String(id))) why.set(String(id), reason); };
    mark(ownerId, 'the applicant');
    if (owner.shopOwnerId) mark(owner.shopOwnerId, "the owner of the applicant's shop");
    const links = CareLink ? await CareLink.find({ status: { $in: ['invited', 'active'] }, $or: [{ helper: ownerId }, { dependent: ownerId }] }).select('helper dependent').lean() : [];
    for (const l of links) mark(idOf(l.helper) === ownerId ? l.dependent : l.helper, 'looks after the applicant, or is looked after by them');
    if (Transaction) {
      const since = new Date(now() - CONNECTED_DAYS * DAY);
      const pays = await Transaction.find({ status: 'success', createdAt: { $gte: since }, $or: [{ fromUserId: ownerId }, { toUserId: ownerId }] }).select('fromUserId toUserId').limit(5000).lean();
      const count = new Map();
      for (const t of pays) {
        const other = idOf(t.fromUserId) === ownerId ? idOf(t.toUserId) : idOf(t.fromUserId);
        if (other && other !== ownerId) count.set(other, (count.get(other) || 0) + 1);
      }
      for (const [id, n] of count) if (n >= REGULAR_PAYMENTS) mark(id, `paid or was paid by the applicant ${n} times in ${CONNECTED_DAYS} days`);
    }
    return { why, ownerId, ownerShopParent: owner.shopOwnerId ? String(owner.shopOwnerId) : '' };
  }

  // How often each seller was picked for other projects lately.
  async function recentPicks(projectId) {
    const since = now() - SPREAD_DAYS * DAY;
    const rows = await Project.find({ 'review.state': { $in: PICK_STATES.concat(['completed']) } }).select('_id plan').limit(2000).lean();
    const n = new Map();
    for (const p of rows) {
      if (String(p._id) === String(projectId)) continue;
      for (const l of p.plan || []) {
        const at = l.pick && l.pick.pickedAt ? new Date(l.pick.pickedAt).getTime() : 0;
        if (l.pick && l.pick.sellerId && at >= since) n.set(String(l.pick.sellerId), (n.get(String(l.pick.sellerId)) || 0) + 1);
      }
    }
    return n;
  }

  // The ranked sellers for one line. Answers { radiusKm, candidates,
  // excluded, note } — note says why there are none, when there are none.
  async function rankLine(project, line, ctx) {
    const site = project.site;
    if (!site || !Number.isFinite(Number(site.lat))) return { radiusKm: null, candidates: [], excluded: [], note: 'The applicant has not pinned the site yet.' };
    const box = bazaar.bazaarBoundingBox(Number(site.lat), Number(site.lng), RADII_KM[RADII_KM.length - 1]);
    const shops = await User.find({
      'creatorProfile.handle': { $type: 'string', $ne: '' },
      'creatorProfile.listed': { $ne: false },
      'creatorProfile.hiddenByGloobal': { $ne: true },
      'creatorProfile.addressPublic': true,
      'creatorProfile.addressParts.lat': { $gte: box.minLat, $lte: box.maxLat },
      'creatorProfile.addressParts.lng': { $gte: box.minLng, $lte: box.maxLng },
      $or: [{ 'creatorProfile.category': line.category }, { 'creatorProfile.category2': line.category }],
    }).select('_id symbolId shopOwnerId cashbackRate creatorProfile.handle creatorProfile.category creatorProfile.category2 creatorProfile.subcategory creatorProfile.addressParts').limit(bazaar.BAZAAR_CANDIDATE_CAP).lean();
    const all = [];
    const excluded = [];
    for (const u of shops) {
      const a = (u.creatorProfile && u.creatorProfile.addressParts) || {};
      const d = bazaar.bazaarDistanceM(Number(site.lat), Number(site.lng), Number(a.lat), Number(a.lng)) / 1000;
      if (!(d <= RADII_KM[RADII_KM.length - 1])) continue;
      const id = String(u._id);
      const name = clip(u.creatorProfile.handle, 80);
      const parent = u.shopOwnerId ? String(u.shopOwnerId) : '';
      let why = ctx.connections.why.get(id) || '';
      if (!why && parent && parent === ctx.connections.ownerId) why = "one of the applicant's own shops";
      if (!why && parent && parent === ctx.connections.ownerShopParent) why = 'a shop of the same owner as the applicant\'s';
      if (!why && parent && ctx.connections.why.has(parent)) why = `a shop of someone who ${ctx.connections.why.get(parent).replace(/^the /, 'is the ')}`;
      if (why) { excluded.push({ name, why }); continue; }
      all.push({
        sellerId: id, symbolId: u.symbolId, name, distanceKm: round1(d),
        category: u.creatorProfile.category || '', subcategory: u.creatorProfile.subcategory || '',
        area: clip([a.area, a.city].filter(Boolean).join(', '), 80),
        cashbackRate: Number(u.cashbackRate) || 0,
      });
    }
    // The smallest circle with enough sellers in it.
    let radiusKm = RADII_KM[RADII_KM.length - 1];
    for (const r of RADII_KM) {
      if (all.filter((c) => c.distanceKm <= r).length >= ENOUGH) { radiusKm = r; break; }
    }
    const rows = all.filter((c) => c.distanceKm <= radiusKm);
    if (!rows.length) {
      return { radiusKm, candidates: [], excluded, note: `No seller of this on GLOOBAL बाज़ार within ${radiusKm} km of the site. Invite one to quote, or pay it against receipts.` };
    }
    const ids = rows.map((r) => r.sellerId);
    const since = new Date(now() - COMPLAINT_DAYS * DAY);
    const [items, reviews, complaints] = await Promise.all([
      CreatorItem.find({ ownerSymbolId: { $in: rows.map((r) => r.symbolId) }, soldOut: { $ne: true } }).select('ownerSymbolId title note price currency').limit(5000).lean(),
      CreatorReview.find({ creatorUserId: { $in: ids } }).select('creatorUserId stars').limit(20000).lean(),
      Complaint.find({ receiverId: { $in: ids }, createdAt: { $gte: since } }).select('receiverId').limit(5000).lean(),
    ]);
    const found = new Map();
    for (const r of rows) {
      const mine = items.filter((it) => it.ownerSymbolId === r.symbolId && String(it.currency || '').toUpperCase() === ctx.currency);
      found.set(r.sellerId, matchItem(line, mine));
    }
    // Prices are compared only between items that are the same thing: the
    // best match anyone lists. A shop listing PPC when the line needs OPC 53
    // shows its item, but is not "cheapest" for it.
    const bestHits = Math.max(0, ...Array.from(found.values()).map((it) => (it ? it.hits : 0)));
    for (const r of rows) {
      const it = found.get(r.sellerId);
      const exact = Boolean(it && it.hits === bestHits);
      r.item = it ? { title: clip(it.title, 80), note: clip(it.note, 140), priceMinor: Math.round(Number(it.price) * 100), currency: ctx.currency, exact } : null;
      r.unitMinor = exact ? Math.round(Number(it.price) * 100) : null;
      r.estimateMinor = exact && line.quantity > 0 ? Math.round(r.unitMinor * line.quantity) : null;
      r.complaints = complaints.filter((c) => idOf(c.receiverId) === r.sellerId).length;
      r.record = recordScore(reviews.filter((v) => idOf(v.creatorUserId) === r.sellerId).map((v) => Number(v.stars) || 0), r.complaints);
      r.recentPicks = ctx.picks.get(r.sellerId) || 0;
    }
    scoreAll(rows, { radiusKm, wantSub: line.subcategory || '' });
    return {
      radiusKm,
      candidates: rows.map((r) => ({
        sellerId: r.sellerId, symbolId: r.symbolId, name: r.name, area: r.area, distanceKm: r.distanceKm,
        category: r.category, subcategory: r.subcategory, item: r.item, estimateMinor: r.estimateMinor, currency: ctx.currency,
        rating: { avg: r.record.avg, count: r.record.count }, complaints: r.complaints,
        sharePct: Math.round(r.cashbackRate * 1000) / 10, recentPicks: r.recentPicks,
        score: r.score, rank: r.rank, reason: r.reason,
      })),
      excluded,
      note: '',
    };
  }

  async function contextFor(project) {
    const owner = await User.findById(project.ownerId).select('_id shopOwnerId').lean();
    return {
      connections: await connectionsOf(owner || { _id: project.ownerId }),
      picks: await recentPicks(project._id),
      currency: String(project.goalCurrency || '').toUpperCase(),
    };
  }

  const pickOut = (p) => (p && (p.other || p.sellerId) ? {
    other: Boolean(p.other), sellerId: p.sellerId ? String(p.sellerId) : null, sellerSymbolId: p.sellerSymbolId || '', name: p.name || '',
    distanceKm: p.distanceKm == null ? null : p.distanceKm, estimateMinor: p.estimateMinor == null ? null : p.estimateMinor,
    estimateCurrency: p.estimateCurrency || '', reason: p.reason || '', rank: p.rank == null ? null : p.rank, note: p.note || '',
    pickedBy: p.pickedBy ? String(p.pickedBy) : null, pickedAt: p.pickedAt || null,
  } : null);

  // ── routes (GLOOBAL's reviewers) ──────────────────────────────────────

  async function sellers(req, res) {
    const got = await review.reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    const ctx = await contextFor(project);
    const lines = [];
    const plan = project.plan || [];
    for (let i = 0; i < plan.length; i++) {
      const l = plan[i];
      if (!SELLER_KINDS.includes(l.kind)) continue;
      const ranked = await rankLine(project, l, ctx);
      lines.push({
        index: i, label: l.label, kind: l.kind, amountMinor: l.amountMinor, quantity: l.quantity, unit: l.unit || '', quality: l.quality || '',
        category: l.category || '', subcategory: l.subcategory || '',
        pick: pickOut(l.pick),
        radiusKm: ranked.radiusKm,
        candidates: ranked.candidates.slice(0, SHOWN),
        more: Math.max(0, ranked.candidates.length - SHOWN),
        excluded: ranked.excluded,
        note: ranked.note,
      });
    }
    const site = project.site && Number.isFinite(Number(project.site.lat)) ? { lat: project.site.lat, lng: project.site.lng, label: project.site.label || '' } : null;
    return res.json({ success: true, site, currency: ctx.currency, canPick: PICK_STATES.includes(project.review.state), lines });
  }

  // Confirm GLOOBAL's choice for one line: { sellerId } (with a note when it
  // is not GLOOBAL's first choice), { other: true, note } when no seller
  // suits, or { clear: true } to undo.
  async function pick(req, res) {
    const got = await review.reviewedProject(req);
    if (!got.project) return res.status(got.status).json(got.body);
    const { project } = got;
    if (!PICK_STATES.includes(project.review.state)) return refuse(res, 409, 'Sellers are picked while the project is being reviewed or funded.');
    const n = Number(req.params.n);
    const line = Number.isInteger(n) && project.plan ? project.plan[n] : null;
    if (!line) return refuse(res, 404, 'There is no such plan line.');
    if (!SELLER_KINDS.includes(line.kind)) return refuse(res, 409, 'Only material and tech lines are bought from a seller.');
    const body = req.body || {};
    const note = clip(body.note, 300);
    const at = new Date(now());
    if (body.clear) {
      line.pick = undefined;
    } else if (body.other) {
      if (note.length < 5) return refuse(res, 400, 'Say why no seller suits, so the applicant knows how this is paid.');
      line.pick = { other: true, sellerId: null, name: '', reason: 'No suitable seller on GLOOBAL बाज़ार: paid against receipts.', note, rank: null, pickedBy: req.authUser._id, pickedAt: at };
    } else {
      const ctx = await contextFor(project);
      const ranked = await rankLine(project, line, ctx);
      const c = ranked.candidates.find((x) => x.sellerId === String(body.sellerId || ''));
      if (!c) return refuse(res, 400, 'That seller is not one GLOOBAL can buy this from: not near the site, not in this category, or connected to the applicant.', 'not_candidate');
      if (c.rank !== 1 && note.length < 5) return refuse(res, 400, "Say why not GLOOBAL's first choice.", 'note_needed');
      line.pick = {
        other: false, sellerId: c.sellerId, sellerSymbolId: c.symbolId, name: c.name, distanceKm: c.distanceKm,
        estimateMinor: c.estimateMinor, estimateCurrency: c.estimateMinor != null ? c.currency : '', reason: c.reason, rank: c.rank, note,
        pickedBy: req.authUser._id, pickedAt: at,
      };
    }
    project.markModified('plan');
    await project.save();
    return res.json({ success: true, index: n, pick: pickOut(line.pick) });
  }

  function mount(app, { requireAuth, writeLimit, lookupLimit, requireReviewer }) {
    const wrap = (fn) => async (req, res) => {
      try { return await fn(req, res); } catch (e) {
        console.error('project suppliers error:', e);
        return refuse(res, 500, 'Could not do that just now.');
      }
    };
    app.get('/api/review/projects/:id/sellers', lookupLimit, requireAuth, requireReviewer, wrap(sellers));
    app.post('/api/review/projects/:id/plan/:n/pick', writeLimit, requireAuth, requireReviewer, wrap(pick));
  }

  return { mount, rankLine, connectionsOf, contextFor, handlers: { sellers, pick } };
}

module.exports = {
  createProjectSuppliers, matchItem, recordScore, scoreAll,
  RADII_KM, ENOUGH, SHOWN, REGULAR_PAYMENTS, CONNECTED_DAYS, WEIGHTS, PICK_STATES,
};
