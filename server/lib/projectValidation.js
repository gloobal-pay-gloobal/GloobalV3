// server/lib/projectValidation.js
//
// Server-side validation for Hooman Projects. The backend is the authority
// on every rule here; the frontend may check the same things for a better
// form experience, but nothing is trusted because it did.

const PROJECT_CATEGORIES = Object.freeze([
  'Infrastructure',
  'Startup',
  'Research',
  'Education',
  'Healthcare',
  'Environment',
  'Art',
  'Technology',
]);

// The founder's rule: a project summary is capped at 1000 words.
const PROJECT_SUMMARY_MAX_WORDS = 1000;
const PROJECT_TITLE_MAX_LENGTH = 140;

// Uploads. 2 MB of actual file, which is a project brief or a photograph.
// The JSON body carrying it is base64, which inflates by 4/3, so the route
// that accepts an upload raises its own body limit to ~3 MB — see server.js.
// Deliberately far below MongoDB's 16 MB document cap.
const PROJECT_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

// An allow-list, not a block-list, and the stored contentType comes from
// HERE rather than from what the client claimed — so a client cannot label
// an HTML file as an image and have it served back with a type that would
// make a browser render it.
//
// No SVG: it is an image to a user and a script container to a browser, and
// serving one back from this origin would be a stored-XSS vector. PDFs and
// raster images and plain text cover what a project brief actually needs.
const PROJECT_ATTACHMENT_TYPES = Object.freeze({
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'text/csv': 'csv',
});

// One definition of "a word", used by the check that actually enforces the
// limit. Whitespace-separated runs, with empties dropped.
//
// The frontend counts the same way (see countProjectSummaryWords in
// frontend/screens/Coverage/GloobalCoverageScreen.jsx). That duplication is
// deliberate and unavoidable — `frontend/` and `server/` are separate
// programs that share no module — but the two MUST agree, because a form
// that says "982 / 1000" and then gets rejected by the server is a worse
// experience than no counter at all. If this rule ever changes, change both.
function countWords(text) {
  const trimmed = String(text == null ? '' : text).trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

// Returns { ok: true, value } or { ok: false, message }. A message here is
// shown to a person, so it says what is wrong and what to do about it.
function validateProjectInput(input, { partial = false } = {}) {
  const out = {};

  const has = (key) => Object.prototype.hasOwnProperty.call(input || {}, key);
  const required = (key) => !partial || has(key);

  if (required('title')) {
    const title = String(input?.title || '').trim();
    if (!title) return { ok: false, message: 'Give the project a title.' };
    if (title.length > PROJECT_TITLE_MAX_LENGTH) {
      return { ok: false, message: `The title can be at most ${PROJECT_TITLE_MAX_LENGTH} characters.` };
    }
    out.title = title;
  }

  if (required('category')) {
    const category = String(input?.category || '').trim();
    if (!PROJECT_CATEGORIES.includes(category)) {
      return { ok: false, message: `Choose one of: ${PROJECT_CATEGORIES.join(', ')}.` };
    }
    out.category = category;
  }

  if (required('summary')) {
    const summary = String(input?.summary || '').trim();
    if (!summary) return { ok: false, message: 'Add a summary describing the project.' };
    const words = countWords(summary);
    if (words > PROJECT_SUMMARY_MAX_WORDS) {
      return {
        ok: false,
        message: `The summary is ${words} words. The limit is ${PROJECT_SUMMARY_MAX_WORDS}.`,
      };
    }
    // The character backstop the schema also carries. Checked here too so
    // the person gets this sentence rather than a Mongoose validation error.
    if (summary.length > 24000) {
      return { ok: false, message: 'That summary is too long to store.' };
    }
    out.summary = summary;
    out.summaryWordCount = words;
  }

  if (has('link')) {
    const link = String(input?.link || '').trim();
    if (link) {
      let parsed = null;
      try {
        parsed = new URL(link);
      } catch (e) {
        parsed = null;
      }
      // http(s) only. A javascript: or data: URL reaches an anchor href on
      // the project page, and those two are how a link becomes an exploit.
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        return { ok: false, message: 'The link must be a http:// or https:// address.' };
      }
      if (link.length > 500) return { ok: false, message: 'That link is too long.' };
      out.link = link;
    } else {
      out.link = '';
    }
  }

  if (has('status')) {
    const status = String(input?.status || '').trim();
    if (status !== 'draft' && status !== 'published') {
      return { ok: false, message: 'Status must be draft or published.' };
    }
    out.status = status;
  }

  if (partial && Object.keys(out).length === 0) {
    return { ok: false, message: 'Nothing to update.' };
  }

  return { ok: true, value: out };
}

// A filename is attacker-controlled text that ends up in a
// Content-Disposition header and in a listing. Strip everything that could
// change its meaning there: path separators (so it cannot claim a
// directory), control characters and quotes (so it cannot break out of the
// header), and leading dots (so it cannot become a hidden/dotfile name).
function sanitiseFilename(raw, fallbackExtension) {
  const base = String(raw == null ? '' : raw)
    .replace(/[\\/]/g, '_')
    // Control characters (which can inject a header break) and the two
    // quote marks (which can end a Content-Disposition filename early).
    // Written as escapes, not literal bytes: a raw NUL in source makes this
    // file binary to grep and is silently mangled by editors and diffs.
    .replace(/[\x00-\x1f\x7f"']/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 200);
  if (base) return base;
  return fallbackExtension ? `attachment.${fallbackExtension}` : 'attachment';
}

module.exports = {
  PROJECT_CATEGORIES,
  PROJECT_SUMMARY_MAX_WORDS,
  PROJECT_TITLE_MAX_LENGTH,
  PROJECT_ATTACHMENT_MAX_BYTES,
  PROJECT_ATTACHMENT_TYPES,
  countWords,
  validateProjectInput,
  sanitiseFilename,
};
