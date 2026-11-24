// tests/mem-models.mjs — in-memory stand-ins for Mongoose models, for
// tests that run the real server modules without a database. (The same
// helper the PayLater flow test grew; shared from here for new tests.)
import { createRequire } from "node:module";
const require = createRequire(new URL("../server/package.json", import.meta.url));
const mongoose = require("mongoose");

const same = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
function match(doc, q) {
  return Object.entries(q || {}).every(([k, c]) => {
    if (k === "$expr") return doc.amount > (doc.claimed || 0);
    if (k === "$or") return c.some((x) => match(doc, x));
    const v = k.split(".").reduce((o, part) => (o == null ? undefined : o[part]), doc);
    if (c && typeof c === "object" && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === "$lt") return v < x;
        if (op === "$gt") return v > x;
        if (op === "$gte") return v >= x;
        if (op === "$lte") return v <= x;
        if (op === "$ne") return !same(v, x);
        if (op === "$in") return x.some((y) => same(v, y));
        if (op === "$exists") return (v !== undefined) === x;
        if (op === "$type") return typeof v === x;
        throw new Error("op " + op);
      });
    }
    return same(v, c);
  });
}
const val = (doc, e) => {
  if (typeof e === "number") return e;
  if (typeof e === "string") return e.startsWith("$") ? doc[e.slice(1)] : e;
  if (e && e.$subtract) return (val(doc, e.$subtract[0]) || 0) - (val(doc, e.$subtract[1]) || 0);
  if (e && e.$ifNull) { const x = val(doc, e.$ifNull[0]); return x == null ? val(doc, e.$ifNull[1]) : x; }
  throw new Error("expr " + JSON.stringify(e));
};
function model(defaults = {}) {
  const rows = [];
  const wrap = (r) => Object.assign(r, { save: async () => r });
  const q = (list, one) => {
    let out = list;
    const api = {
      select: () => api, lean: () => api, session: () => api,
      sort: (s) => { const [[k, d]] = Object.entries(s); out = [...out].sort((a, b) => (a[k] > b[k] ? d : a[k] < b[k] ? -d : 0)); return api; },
      limit: (n) => { out = out.slice(0, n); return api; },
      then: (a, b) => Promise.resolve(one ? out[0] || null : out).then(a, b),
    };
    return api;
  };
  const apply = (r, u) => { for (const [k, v] of Object.entries(u.$set || {})) r[k] = v; for (const [k, n] of Object.entries(u.$inc || {})) r[k] = Math.round(((r[k] || 0) + n) * 1e6) / 1e6; };
  const m = {
    rows,
    find: (f = {}) => q(rows.filter((r) => match(r, f))),
    findOne: (f = {}) => q(rows.filter((r) => match(r, f)), true),
    findById: (id) => q(rows.filter((r) => same(r._id, id)), true),
    create: async (list) => (Array.isArray(list) ? list : [list]).map((d) => { const r = wrap({ _id: new mongoose.Types.ObjectId(), ...defaults, ...d }); rows.push(r); return r; }),
    updateOne: async (f, u, o = {}) => {
      let r = rows.find((x) => match(x, f));
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), ...defaults, ...(u.$setOnInsert || {}) }); rows.push(r); }
      if (!r) return { matchedCount: 0 };
      apply(r, u); return { matchedCount: 1 };
    },
    findOneAndUpdate: async (f, u, o = {}) => {
      const r = rows.find((x) => match(x, f));
      if (!r) return null;
      const before = { ...r }; apply(r, u);
      return o.returnDocument === "before" ? before : r;
    },
    aggregate: (pipe) => {
      const run = async () => {
        let list = rows;
        const out = [];
        for (const st of pipe) {
          if (st.$match) list = list.filter((r) => match(r, st.$match));
          if (st.$group) {
            const groups = new Map();
            for (const r of list) {
              const id = st.$group._id === null ? null : val(r, st.$group._id);
              const key = String(id);
              if (!groups.has(key)) groups.set(key, { _id: id });
              for (const [name, spec] of Object.entries(st.$group)) { if (name === "_id") continue; groups.get(key)[name] = (groups.get(key)[name] || 0) + (val(r, spec.$sum) || 0); }
            }
            out.push(...groups.values());
          }
        }
        return out;
      };
      const api = { session: () => api, then: (a, b) => run().then(a, b) };
      return api;
    },
  };
  return m;
}

// For a model built with `new Model(doc)` and doc.save().
function modelClass(defaults = {}) {
  const m = model(defaults);
  function Doc(d) { Object.assign(this, { _id: new mongoose.Types.ObjectId() }, JSON.parse(JSON.stringify(defaults)), d); }
  Doc.prototype.set = function set(k, v) { if (v === undefined) delete this[k]; else this[k] = v; };
  Doc.prototype.save = async function save() { if (!m.rows.includes(this)) m.rows.push(this); return this; };
  Doc.prototype.markModified = function markModified() {};
  Object.assign(Doc, m);
  Doc.exists = (f) => { const api = { session: () => api, then: (a, b) => Promise.resolve(m.rows.some((r) => match(r, f)) ? { _id: 1 } : null).then(a, b) }; return api; };
  Doc.countDocuments = async (f) => m.rows.filter((r) => match(r, f)).length;
  return Doc;
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };

export { same, match, model, modelClass, stub, require, mongoose };
