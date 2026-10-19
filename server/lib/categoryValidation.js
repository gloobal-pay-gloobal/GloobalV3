// Validation for My Choices — the categories an account puts on its own
// payments.
//
// Returns { ok: true, value } or { ok: false, message }. A message here is
// shown to a person, so it says what is wrong and what to do about it.
// Same contract as lib/projectValidation.js, deliberately: a second shape
// for the same job is how a route ends up answering 500 for a typo.

const CATEGORY_NAME_MAX_LENGTH = 40;

// Up to four words.
//
// A category's name is not shown in one place, it is shown in five: the
// tile in the grid, the label under the Send strip, the line under the
// amount box, the heading on its own screen, and inside the sentence on
// that screen's button ("Pay for Damroo Baby"). The strip label is the
// tightest of them at 62 pixels across two lines, and a name long enough
// to defeat that is a name nobody can recognise at a glance — which is
// the entire job of the strip.
//
// So the cap is here, where names are CREATED, rather than at any of the
// five. Enforcing it at a surface means every surface needs its own
// answer, and the usual answer is truncation, which names nothing.
//
// Checked at save rather than while typing, so nobody is stopped
// mid-thought; the message below says what to do about it.
const CATEGORY_NAME_MAX_WORDS = 4;

const categoryNameWords = (value) => String(value || "").trim().split(/\s+/).filter(Boolean);
const CATEGORY_ICON_MAX_LENGTH = 16;
const CATEGORY_KINDS = ['expense', 'income'];
const CATEGORY_ICON_STYLES = ['emoji', 'line', 'duotone'];
// Mirrors CHOICES_SHAPES in the client's choicesCatalog.js. A name
// the client does not know renders as the default rather than as
// nothing, but it is refused here so the two cannot drift silently.
const CATEGORY_SHAPES = ['rounded', 'soft', 'sharp', 'pill', 'leaf'];

// #rgb, #rrggbb, #rrggbbaa. Anything else is refused rather than stripped:
// a colour is not free text, and half-accepting one writes a tile nobody
// can see.
const CATEGORY_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// A budget is money, so the same rule money gets everywhere else in this
// codebase: finite, not negative, and 0 means "none" rather than "zero
// pounds allowed". Number(null) is 0 and 0 is finite, so the guard has to
// ask whether the input was SUPPLIED before it asks what it is worth.
const CATEGORY_BUDGET_MAX = 1e12;

// `strict` is for POST, where name and kind must be present. PATCH passes
// false, so a body naming only `monthlyBudget` is a valid budget edit and
// leaves the rest of the row alone.
const validateCategoryInput = (input, { strict = true } = {}) => {
  const body = input && typeof input === 'object' ? input : {};
  const out = {};
  const supplied = (key) => body[key] !== undefined && body[key] !== null;

  if (strict || supplied('name')) {
    const name = String(body.name || '').trim();
    if (!name) return { ok: false, message: 'Give this choice a name.' };
    if (name.length > CATEGORY_NAME_MAX_LENGTH) {
      return { ok: false, message: `The name can be at most ${CATEGORY_NAME_MAX_LENGTH} characters.` };
    }
    const words = categoryNameWords(name);
    if (words.length > CATEGORY_NAME_MAX_WORDS) {
      return {
        ok: false,
        message: `A choice's name is up to ${CATEGORY_NAME_MAX_WORDS} words \u2014 this one has ${words.length}.`,
      };
    }
    out.name = name;
  }

  if (strict || supplied('kind')) {
    const kind = String(body.kind || 'expense').trim().toLowerCase();
    if (!CATEGORY_KINDS.includes(kind)) {
      return { ok: false, message: 'A choice is either for money going out or money coming in.' };
    }
    out.kind = kind;
  }

  if (supplied('icon')) {
    // Truncated, not refused. An icon is decoration: a client that sends a
    // surrogate pair plus a variation selector is not doing anything wrong,
    // and a person should not be told their emoji is invalid.
    out.icon = String(body.icon || '').trim().slice(0, CATEGORY_ICON_MAX_LENGTH);
  }

  if (supplied('iconStyle')) {
    const iconStyle = String(body.iconStyle || '').trim().toLowerCase();
    if (!CATEGORY_ICON_STYLES.includes(iconStyle)) {
      return { ok: false, message: 'Pick one of the icon styles on offer.' };
    }
    out.iconStyle = iconStyle;
  }

  if (supplied('shape')) {
    const shape = String(body.shape || '').trim().toLowerCase();
    if (!CATEGORY_SHAPES.includes(shape)) {
      return { ok: false, message: 'Pick one of the shapes on offer.' };
    }
    out.shape = shape;
  }

  if (supplied('color')) {
    const color = String(body.color || '').trim();
    if (color && !CATEGORY_COLOR_PATTERN.test(color)) {
      return { ok: false, message: 'That colour is not a hex value like #FBD0DC.' };
    }
    out.color = color;
  }

  if (supplied('monthlyBudget')) {
    const budget = Number(body.monthlyBudget);
    if (!Number.isFinite(budget) || budget < 0) {
      return { ok: false, message: 'A budget is a number, and it cannot be less than nothing.' };
    }
    if (budget > CATEGORY_BUDGET_MAX) {
      return { ok: false, message: 'That budget is larger than this app can hold.' };
    }
    out.monthlyBudget = budget;
  }

  if (supplied('budgetCurrency')) {
    const currency = String(body.budgetCurrency || '').trim().toUpperCase();
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, message: 'budgetCurrency must be a three-letter code.' };
    }
    out.budgetCurrency = currency;
  }

  if (supplied('favorite')) {
    // Coerced rather than refused. A heart is a toggle; there is no input
    // a person can make here that is worth a 400 and a sentence.
    out.favorite = Boolean(body.favorite);
  }

  if (supplied('sortIndex')) {
    const sortIndex = Number(body.sortIndex);
    if (!Number.isFinite(sortIndex)) {
      return { ok: false, message: 'sortIndex must be a number.' };
    }
    out.sortIndex = sortIndex;
  }

  if (!strict && Object.keys(out).length === 0) {
    return { ok: false, message: 'Nothing to change.' };
  }

  return { ok: true, value: out };
};

// What the app gets back. The _id is stringified here, once, rather than at
// each of the four call sites — a route that forgets hands the client an
// ObjectId that stringifies differently depending on how it was serialised.
const publicCategory = (row) => ({
  id: String(row._id),
  name: row.name,
  kind: row.kind || 'expense',
  icon: row.icon || '',
  iconStyle: row.iconStyle || 'emoji',
  shape: row.shape || 'rounded',
  color: row.color || '',
  monthlyBudget: Number(row.monthlyBudget) || 0,
  budgetCurrency: row.budgetCurrency || '',
  favorite: Boolean(row.favorite),
  archived: Boolean(row.archivedAt),
  sortIndex: Number(row.sortIndex) || 0,
  createdAt: row.createdAt,
});

// The set an account starts with. Seeded on the first read rather than at
// registration, so accounts that existed before this feature get them too
// and nothing has to be backfilled.
//
// These are a starting point, not a taxonomy. Every one of them can be
// renamed, re-iconed or retired, and the app never relies on a particular
// one existing — which is why they carry no stable keys. Naming them here
// is the only place they are special.
// The ones that start out favourited are simply the first few, so a
// brand-new account opens Send with a strip that is already populated
// rather than one that says "pick some first". Nothing depends on which
// they are, and un-hearting any of them is one tap.
const DEFAULT_CATEGORIES = [
  { name: 'Baby', icon: '\u{1F476}', color: '#FBD0DC', kind: 'expense', sortIndex: 0, favorite: true },
  { name: 'Beauty', icon: '\u{1F484}', color: '#E5DEFB', kind: 'expense', sortIndex: 1, favorite: true },
  { name: 'Bill', icon: '\u{1F9FE}', color: '#DBDDE4', kind: 'expense', sortIndex: 2, favorite: true },
  { name: 'Car', icon: '\u{1F697}', color: '#A9DCEE', kind: 'expense', sortIndex: 3, favorite: true },
  { name: 'Clothing', icon: '\u{1F455}', color: '#FBDCC4', kind: 'expense', sortIndex: 4 },
  { name: 'Education', icon: '\u{1F393}', color: '#FBE7A8', kind: 'expense', sortIndex: 5 },
  { name: 'Electronics', icon: '\u{1F4F1}', color: '#A8E6E0', kind: 'expense', sortIndex: 6 },
  { name: 'Entertainment', icon: '\u{1F3AC}', color: '#F5BBD0', kind: 'expense', sortIndex: 7 },
  { name: 'Food', icon: '\u{1F354}', color: '#F9B499', kind: 'expense', sortIndex: 8 },
  { name: 'Health', icon: '\u{1FA7A}', color: '#A8E0B0', kind: 'expense', sortIndex: 9 },
  { name: 'Home', icon: '\u{1F3E0}', color: '#FBE7A8', kind: 'expense', sortIndex: 10 },
  { name: 'Insurance', icon: '\u{1F6E1}️', color: '#C5D9F5', kind: 'expense', sortIndex: 11 },
  { name: 'Salary', icon: '\u{1F4BC}', color: '#BBE8C4', kind: 'income', sortIndex: 0, favorite: true },
  { name: 'Freelance', icon: '\u{1F4BB}', color: '#C5D9F5', kind: 'income', sortIndex: 1 },
  { name: 'Interest', icon: '\u{1F4C8}', color: '#FBE7A8', kind: 'income', sortIndex: 2 },
  { name: 'Rental', icon: '\u{1F3E2}', color: '#E0D4F7', kind: 'income', sortIndex: 3 },
  { name: 'Gifts', icon: '\u{1F381}', color: '#F9C2D1', kind: 'income', sortIndex: 4 },
];

module.exports = {
  CATEGORY_NAME_MAX_LENGTH,
  CATEGORY_NAME_MAX_WORDS,
  CATEGORY_KINDS,
  CATEGORY_ICON_STYLES,
  CATEGORY_SHAPES,
  CATEGORY_BUDGET_MAX,
  DEFAULT_CATEGORIES,
  validateCategoryInput,
  publicCategory,
};
