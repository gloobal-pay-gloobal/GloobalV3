// server/lib/guide.js
//
// ── ASK GLOOBAL: THE GUIDE (0223) ────────────────────────────────────────
//
// The app answers "how does this work?" from a guide of cards, in the
// language the person writes — English, हिन्दी, Hinglish, தமிழ் — with no AI
// service anywhere. The matching runs on the phone (frontend/features/
// support/askEngine.js); this file only hands out the cards and keeps count.
//
//   GET  /api/guide             the cards, for anyone (nothing personal in
//                               them). ?have=<version> answers "unchanged".
//   POST /api/guide/events      what happened to a question — anonymous.
//
// The staff site (Support and the founder) sees which questions found no
// answer, which answers people said did not help, and edits the cards:
//
//   GET  /api/admin/guide                 cards + questions people asked
//   PUT  /api/admin/guide/:id/draft       save a change (or a new card)
//   POST /api/admin/guide/:id/publish     send it to the app
//   POST /api/admin/guide/:id/discard     drop the change
//   POST /api/admin/guide/:id/hidden      take a card out of the app / back
//
// A card about money goes out only when a SECOND person publishes it: the
// one who wrote the change cannot. Same rule as send-backs.

const crypto = require('crypto');
const BUILT_IN = require('./guideCards');

const LANGS = ['en', 'hi', 'hl', 'ta'];
const TOPICS = ['send', 'receive', 'bank', 'essentials', 'shop', 'geu', 'account', 'help'];
const SCREENS = ['send', 'bank', 'essentials', 'shop'];
const TARGETS = ['send', 'bank', 'essentials', 'myshop', 'history', 'receive', 'scan', 'complaints', 'security', 'referral', 'notifications', 'help'];
const TOURS = ['bank-withdraw'];
const EDITORS = ['admin', 'support'];
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+){0,6}$/;

const str = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const first = (n) => String(n || '').trim().split(/\s+/)[0] || 'Someone';

// Words people typed, made safe to keep: no long numbers (amounts, phone
// numbers, account numbers), no e-mail addresses, nothing past 140 letters.
function safeText(v) {
  return str(v, 400)
    .replace(/[^\s@]+@[^\s@]+/g, '@')
    .replace(/[+]?\d[\d\s,.-]{2,}\d/g, '#')
    .replace(/\d{3,}/g, '#')
    .slice(0, 140);
}
const normQ = (t) => String(t || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{M}\p{N}#@\s]/gu, ' ').replace(/\s+/g, ' ').trim();

// A card, checked. Returns { card } or { error } in the team's words.
function cleanCard(id, raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const topic = TOPICS.includes(raw.topic) ? raw.topic : null;
  if (!topic) return { error: 'Pick what the card is about.' };
  const screens = Array.isArray(raw.screens) ? [...new Set(raw.screens.filter((s) => SCREENS.includes(s)))] : [];
  const target = raw.action && TARGETS.includes(raw.action.target) ? raw.action.target : null;
  const tour = TOURS.includes(raw.tour) ? raw.tour : null;
  const t = {};
  for (const l of LANGS) {
    const x = raw.t && raw.t[l];
    if (!x) continue;
    const q = str(x.q, 140);
    const asks = [...new Set((Array.isArray(x.asks) ? x.asks : []).map((a) => str(a, 80)).filter((a) => a.length >= 2))].slice(0, 20);
    const steps = (Array.isArray(x.steps) ? x.steps : []).map((s) => str(s, 400)).filter((s) => s.length >= 2).slice(0, 6);
    if (!q && !asks.length && !steps.length) continue;
    if (q.length < 2) return { error: `The question is missing in ${LANG_NAMES[l]}.` };
    if (!steps.length) return { error: `The answer is missing in ${LANG_NAMES[l]}.` };
    t[l] = { q, asks, steps };
  }
  if (!t.en) return { error: 'Every card needs the English version — the others can follow.' };
  return { card: { id, topic, screens, money: Boolean(raw.money), action: target ? { target } : null, tour, t } };
}
const LANG_NAMES = { en: 'English', hi: 'Hindi', hl: 'Hinglish', ta: 'Tamil' };

function createGuide({ GuideCard, GuideEvent, requireAuth, writeLimit, lookupLimit, staff }) {
  const builtIn = new Map(BUILT_IN.map((c) => [c.id, c]));
  let cache = null; // { version, cards }

  // What the app shows: the built-in set, with the team's published
  // changes in place, their new cards added, and hidden ones left out.
  async function current() {
    if (cache) return cache;
    const rows = await GuideCard.find({}).lean();
    const byId = new Map(rows.map((r) => [r.cardId, r]));
    const cards = [];
    for (const c of BUILT_IN) {
      const r = byId.get(c.id);
      if (r && r.hidden) continue;
      cards.push(r && r.live ? r.live : c);
    }
    for (const r of rows) if (!builtIn.has(r.cardId) && r.live && !r.hidden) cards.push(r.live);
    const out = cards.map((c) => ({ id: c.id, topic: c.topic, screens: c.screens || [], action: c.action || null, tour: c.tour || null, t: c.t }));
    const version = crypto.createHash('sha1').update(JSON.stringify(out)).digest('hex').slice(0, 12);
    cache = { version, cards: out };
    return cache;
  }
  const forget = () => { cache = null; };

  // Staff view of one card: what the app shows now, and any change waiting.
  function staffCard(id, row, me, stats) {
    const base = row && row.live ? row.live : builtIn.get(id) || null;
    return {
      id,
      card: base,
      origin: builtIn.has(id) ? 'built-in' : 'team',
      changed: Boolean(row && row.live && builtIn.has(id)),
      live: Boolean(base),
      hidden: Boolean(row && row.hidden),
      draft: row && row.draft ? row.draft : null,
      draftByName: row && row.draft ? first(row.draftByName) : '',
      draftAt: row && row.draft ? row.draftAt : null,
      draftMine: Boolean(row && row.draft && String(row.draftBy) === String(me)),
      needsSecond: Boolean(row && row.draft && (row.draft.money || (base && base.money))),
      publishedByName: row && row.publishedByName ? first(row.publishedByName) : '',
      publishedAt: row ? row.publishedAt : null,
      stats: stats.get(id) || { shown: 0, yes: 0, no: 0 },
    };
  }

  function mount(app) {
    // ── the app ──
    app.get('/api/guide', lookupLimit, async (req, res) => {
      try {
        const g = await current();
        res.set('Cache-Control', 'no-cache');
        if (String(req.query.have || '') === g.version) return res.json({ success: true, unchanged: true, version: g.version });
        return res.json({ success: true, version: g.version, langs: LANGS, cards: g.cards });
      } catch (error) {
        console.error('guide error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the guide just now.' });
      }
    });

    app.post('/api/guide/events', writeLimit, requireAuth, async (req, res) => {
      try {
        const list = Array.isArray(req.body && req.body.events) ? req.body.events.slice(0, 5) : [];
        const rows = [];
        for (const e of list) {
          if (!e || !GuideEvent.KINDS.includes(e.kind)) continue;
          const cardId = ID_RE.test(String(e.cardId || '')) ? String(e.cardId) : '';
          rows.push({
            kind: e.kind,
            // A question about their own money is counted, never written down.
            text: e.kind === 'personal' ? '' : safeText(e.text),
            lang: /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(String(e.lang || '')) ? String(e.lang).toLowerCase() : '',
            cardId,
            screen: SCREENS.includes(e.screen) ? e.screen : '',
            at: new Date(),
          });
        }
        if (rows.length) await GuideEvent.insertMany(rows);
        return res.json({ success: true, kept: rows.length });
      } catch (error) {
        console.error('guide events error:', error);
        return res.status(500).json({ success: false });
      }
    });

    // ── the staff site ──
    app.get('/api/admin/guide', lookupLimit, staff.requireStaff(EDITORS, 'view.guide'), async (req, res) => {
      try {
        const days = Math.min(90, Math.max(1, Number(req.query.days) || 7));
        const since = new Date(Date.now() - days * 86400000);
        const [rows, events] = await Promise.all([
          GuideCard.find({}).lean(),
          GuideEvent.find({ at: { $gte: since } }).sort({ at: -1 }).limit(20000).lean(),
        ]);
        const stats = new Map();
        const totals = { asked: 0, answer: 0, choices: 0, none: 0, personal: 0, yes: 0, no: 0 };
        const asked = new Map();
        for (const e of events) {
          totals[e.kind] = (totals[e.kind] || 0) + 1;
          if (['answer', 'choices', 'none', 'personal'].includes(e.kind)) totals.asked += 1;
          if (e.cardId) {
            const s = stats.get(e.cardId) || { shown: 0, yes: 0, no: 0 };
            if (e.kind === 'answer') s.shown += 1;
            if (e.kind === 'yes') s.yes += 1;
            if (e.kind === 'no') s.no += 1;
            stats.set(e.cardId, s);
          }
          if (!['answer', 'choices', 'none'].includes(e.kind) || !e.text) continue;
          const key = `${e.lang}|${normQ(e.text)}`;
          const q = asked.get(key) || { text: e.text, lang: e.lang, count: 0, answer: 0, choices: 0, none: 0, cards: {}, lastAt: e.at };
          q.count += 1; q[e.kind] += 1;
          if (e.cardId) q.cards[e.cardId] = (q.cards[e.cardId] || 0) + 1;
          asked.set(key, q);
        }
        const questions = [...asked.values()].map((q) => {
          const cardId = Object.entries(q.cards).sort((a, b) => b[1] - a[1])[0];
          return { text: q.text, lang: q.lang, count: q.count, answer: q.answer, choices: q.choices, none: q.none, cardId: cardId ? cardId[0] : '', lastAt: q.lastAt };
        }).sort((a, b) => (b.none - a.none) || (b.count - a.count)).slice(0, 200);
        const byId = new Map(rows.map((r) => [r.cardId, r]));
        const ids = [...BUILT_IN.map((c) => c.id), ...rows.map((r) => r.cardId).filter((id) => !builtIn.has(id))];
        const cards = ids.map((id) => staffCard(id, byId.get(id), req.staff._id, stats));
        return res.json({ success: true, days, totals, questions, cards, langs: LANGS, topics: TOPICS, screens: SCREENS, targets: TARGETS, tours: TOURS });
      } catch (error) {
        console.error('admin guide error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the guide.' });
      }
    });

    const oneCard = async (req, res, id) => {
      const row = await GuideCard.findOne({ cardId: id }).lean();
      const s = await GuideEvent.aggregate([{ $match: { cardId: id } }, { $group: { _id: '$kind', n: { $sum: 1 } } }]);
      const m = Object.fromEntries(s.map((x) => [x._id, x.n]));
      return res.json({ success: true, card: staffCard(id, row, req.staff._id, new Map([[id, { shown: m.answer || 0, yes: m.yes || 0, no: m.no || 0 }]])) });
    };

    app.put('/api/admin/guide/:id/draft', writeLimit, staff.requireStaff(EDITORS, 'guide.draft'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        if (!ID_RE.test(id) || id.length > 40) return res.status(400).json({ success: false, message: 'A card name is lower-case words joined by dashes, like bank-withdraw.' });
        const { card, error } = cleanCard(id, req.body && req.body.card);
        if (error) return res.status(400).json({ success: false, message: error });
        const row = await GuideCard.findOne({ cardId: id }).lean();
        if (req.body && req.body.isNew && (builtIn.has(id) || (row && (row.live || row.draft)))) return res.status(409).json({ success: false, message: 'There is already a card with that name.' });
        await GuideCard.updateOne({ cardId: id }, { $set: { draft: card, draftBy: req.staff._id, draftByName: req.staff.fullName || '', draftAt: new Date() } }, { upsert: true });
        staff.audit(req, req.staff._id, 'guide.draft', 'success', `Guide: change to ${id} saved`, { cardId: id, money: card.money });
        return oneCard(req, res, id);
      } catch (error) {
        console.error('guide draft error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that just now.' });
      }
    });

    app.post('/api/admin/guide/:id/publish', writeLimit, staff.requireStaff(EDITORS, 'guide.publish'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        const row = await GuideCard.findOne({ cardId: id }).lean();
        if (!row || !row.draft) return res.status(404).json({ success: false, message: 'There is no change waiting on that card.' });
        const before = row.live || builtIn.get(id) || null;
        const money = Boolean(row.draft.money || (before && before.money));
        if (money && String(row.draftBy) === String(req.staff._id)) {
          return res.status(409).json({ success: false, code: 'second_person', message: `This card is about money, so someone other than ${first(row.draftByName)} sends it out.` });
        }
        const done = await GuideCard.findOneAndUpdate({ cardId: id, draftAt: row.draftAt }, {
          $set: { live: row.draft, draft: null, draftBy: null, draftByName: '', draftAt: null, publishedBy: req.staff._id, publishedByName: req.staff.fullName || '', publishedAt: new Date() },
        }, { returnDocument: 'after' }).lean();
        if (!done) return res.status(409).json({ success: false, message: 'Someone changed this card a moment ago. Have another look.' });
        forget();
        staff.audit(req, req.staff._id, 'guide.publish', 'success', `Guide: ${id} sent to the app${money ? ` (written by ${first(row.draftByName)})` : ''}`, { cardId: id, money, draftBy: String(row.draftBy || '') });
        return oneCard(req, res, id);
      } catch (error) {
        console.error('guide publish error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that out just now.' });
      }
    });

    app.post('/api/admin/guide/:id/discard', writeLimit, staff.requireStaff(EDITORS, 'guide.discard'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        const row = await GuideCard.findOne({ cardId: id }).lean();
        if (!row || !row.draft) return res.status(404).json({ success: false, message: 'There is no change waiting on that card.' });
        if (!row.live && !builtIn.has(id) && !row.hidden) await GuideCard.deleteOne({ cardId: id });
        else await GuideCard.updateOne({ cardId: id }, { $set: { draft: null, draftBy: null, draftByName: '', draftAt: null } });
        staff.audit(req, req.staff._id, 'guide.discard', 'success', `Guide: change to ${id} dropped`, { cardId: id });
        return oneCard(req, res, id);
      } catch (error) {
        console.error('guide discard error:', error);
        return res.status(500).json({ success: false, message: 'Could not drop that just now.' });
      }
    });

    app.post('/api/admin/guide/:id/hidden', writeLimit, staff.requireStaff(EDITORS, 'guide.hide'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        const row = await GuideCard.findOne({ cardId: id }).lean();
        if (!builtIn.has(id) && !(row && row.live)) return res.status(404).json({ success: false, message: 'That card is not in the app.' });
        const hidden = Boolean(req.body && req.body.hidden);
        await GuideCard.updateOne({ cardId: id }, { $set: { hidden } }, { upsert: true });
        forget();
        staff.audit(req, req.staff._id, 'guide.hide', 'success', `Guide: ${id} ${hidden ? 'taken out of' : 'back in'} the app`, { cardId: id, hidden });
        return oneCard(req, res, id);
      } catch (error) {
        console.error('guide hide error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that just now.' });
      }
    });
  }

  return { mount, current, forget };
}

module.exports = { createGuide, safeText, cleanCard, LANGS, TOPICS, SCREENS, TARGETS };
