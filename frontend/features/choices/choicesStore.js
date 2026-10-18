// src/features/choices/choicesStore.js
import { useSyncExternalStore as useSyncExternalStore4 } from "react";

// ── ONE SET OF CHOICES, READ BY EVERY SCREEN ───────────────────────────
//
// The categories and the tag map are needed by four places at once: the
// strip above the Send button, the grid, a category's own screen, and the
// badge on a history row. Threading them down as props would mean passing
// the same two values through Dashboard, SendMoney and the history list —
// components with no interest in either — and a screen reached by a path
// nobody updated would then show a stale set, or none.
//
// So this is the same shape geuLens.js uses and for the same reason: a tiny
// store outside React, with useSyncExternalStore keeping every subscriber on
// one value in one render rather than a frame apart.
//
// Nothing here is money. A failed load leaves the app entirely usable with
// no categories shown, and a failed tag leaves a correct, untagged payment.
// That is the whole point of keeping this off the money path, and every
// catch below is written to preserve it.

// The snapshot handed out before anything has loaded, and the one a server
// render gets. A FROZEN SINGLETON, because useSyncExternalStore compares
// snapshots by reference: returning a fresh `{}` from getSnapshot on every
// call is the classic way to spin it into an infinite render loop.
var CHOICES_EMPTY = Object.freeze({
  status: "idle",
  categories: [],
  tags: Object.freeze({}),
  monthStart: null,
  error: null
});

var choicesState = CHOICES_EMPTY;
var choicesListeners = new Set();
// Guards the auto-load on first subscribe. Without it, four components
// mounting in the same tick would each fire the same pair of requests.
var choicesLoading = false;

function choicesSnapshot() {
  return choicesState;
}

function choicesServerSnapshot() {
  return CHOICES_EMPTY;
}

function choicesEmit(next) {
  choicesState = next;
  choicesListeners.forEach(function (listener) {
    try {
      listener();
    } catch (error) {
      // A throwing subscriber must not stop the rest from being told.
      if (typeof console !== "undefined") console.error("Choices listener failed:", error);
    }
  });
}

function choicesSubscribe(listener) {
  choicesListeners.add(listener);
  // First subscriber kicks off the load. Later ones join the result.
  if (choicesState.status === "idle" && !choicesLoading) choicesLoad();
  return function () {
    choicesListeners.delete(listener);
  };
}

// Reference id -> category id, built from the server's tag list. Built as a
// plain object rather than a Map so it can be read straight from render
// without a hook and compared cheaply.
function choicesTagMap(tags) {
  const map = {};
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (tag && tag.referenceId) map[tag.referenceId] = String(tag.categoryId || "");
  }
  return map;
}

// Both reads, together, because a grid cannot draw a correct tile from one
// of them. `force` re-reads after a change that the optimistic path cannot
// fully predict — a create, mostly, where only the server knows the new id.
async function choicesLoad(force) {
  if (choicesLoading) return choicesState;
  if (!force && choicesState.status === "ready") return choicesState;
  choicesLoading = true;
  if (choicesState.status === "idle") {
    choicesEmit(Object.assign({}, choicesState, { status: "loading", error: null }));
  }

  try {
    const monthStart = choicesMonthStartISO(new Date());
    // Settled, not all: a tag list that fails must not cost the person
    // their categories, and vice versa. Each half degrades on its own.
    const [listed, tagged] = await Promise.allSettled([
      GloobalApi.getCategories(monthStart),
      GloobalApi.getCategoryTags(2000)
    ]);

    const categories =
      listed.status === "fulfilled" && Array.isArray(listed.value.categories)
        ? listed.value.categories
        : choicesState.categories;
    const tags =
      tagged.status === "fulfilled" ? choicesTagMap(tagged.value) : choicesState.tags;

    // Only a failed CATEGORY read is an error worth showing. The tag map
    // failing degrades to unbadged rows, which is a quiet loss, not a
    // broken screen.
    const failed = listed.status === "rejected" ? listed.reason : null;

    choicesEmit({
      status: failed && categories.length === 0 ? "error" : "ready",
      categories,
      tags,
      monthStart,
      error: failed ? String((failed && failed.message) || failed) : null
    });
  } catch (error) {
    choicesEmit(Object.assign({}, choicesState, {
      status: choicesState.categories.length > 0 ? "ready" : "error",
      error: String((error && error.message) || error)
    }));
  } finally {
    choicesLoading = false;
  }
  return choicesState;
}

// Dropped on sign-out. Categories are per account, and leaving one
// account's set in memory for the next person to sign in on the same device
// would show them somebody else's spending labels.
function choicesReset() {
  choicesLoading = false;
  choicesEmit(CHOICES_EMPTY);
}

async function choicesCreate(payload) {
  const created = await GloobalApi.createCategory(payload);
  if (created) {
    choicesEmit(Object.assign({}, choicesState, {
      status: "ready",
      categories: choicesState.categories.concat([created])
    }));
  }
  return created;
}

async function choicesUpdate(id, payload) {
  const updated = await GloobalApi.updateCategory(id, payload);
  if (updated) {
    choicesEmit(Object.assign({}, choicesState, {
      categories: choicesState.categories.map((row) => (String(row.id) === String(id) ? updated : row))
    }));
  }
  return updated;
}

// Archiving and deleting look identical from here: either way the category
// leaves the grid. The result says which happened so the caller can tell the
// person the truth rather than guess.
async function choicesRemove(id) {
  const result = await GloobalApi.removeCategory(id);
  choicesEmit(Object.assign({}, choicesState, {
    categories: choicesState.categories.filter((row) => String(row.id) !== String(id))
  }));
  return result;
}

// Optimistic, and rolled back on failure.
//
// Filing a payment is a label on something that has already happened, so the
// badge appearing instantly is honest — there is no pending state for a
// person to misread as "the payment is still going". If the write fails the
// badge goes back to exactly what it was, including to a DIFFERENT category
// if the row was already filed under one.
async function choicesTag(referenceId, categoryId) {
  const ref = String(referenceId || "");
  if (!ref) return null;
  const before = choicesState.tags;
  const previous = before[ref];

  choicesEmit(Object.assign({}, choicesState, {
    tags: Object.assign({}, before, { [ref]: String(categoryId || "") })
  }));

  try {
    return await GloobalApi.tagTransaction(ref, categoryId);
  } catch (error) {
    const rolled = Object.assign({}, choicesState.tags);
    if (previous === undefined) delete rolled[ref];
    else rolled[ref] = previous;
    choicesEmit(Object.assign({}, choicesState, { tags: rolled }));
    throw error;
  }
}

async function choicesUntag(referenceId) {
  const ref = String(referenceId || "");
  if (!ref) return false;
  const previous = choicesState.tags[ref];
  const rolled = Object.assign({}, choicesState.tags);
  delete rolled[ref];
  choicesEmit(Object.assign({}, choicesState, { tags: rolled }));

  try {
    return await GloobalApi.untagTransaction(ref);
  } catch (error) {
    if (previous !== undefined) {
      choicesEmit(Object.assign({}, choicesState, {
        tags: Object.assign({}, choicesState.tags, { [ref]: previous })
      }));
    }
    throw error;
  }
}

// Filing a payment that was just made, without making the caller wait or
// care. Used by the send flow: the payment has already committed by the
// time this runs, and a label that fails to stick must never surface as a
// failed payment. So it swallows, and the person can file the row from its
// category screen afterwards.
function choicesTagQuietly(referenceId, categoryId) {
  if (!referenceId || !categoryId) return;
  Promise.resolve()
    .then(function () {
      return choicesTag(referenceId, categoryId);
    })
    .catch(function (error) {
      if (typeof console !== "undefined") console.error("Could not file that payment:", error);
    });
}

// ── Selectors ──────────────────────────────────────────────────────────

// Live categories of one kind, in the person's own order. Archived ones are
// excluded everywhere a category can be CHOSEN; they still resolve by id so
// an already-filed payment keeps its label.
function choicesOfKind(state, kind) {
  const want = kind === "income" ? "income" : "expense";
  const rows = (state && Array.isArray(state.categories) ? state.categories : []).filter(
    (row) => row && !row.archived && (row.kind || "expense") === want
  );
  // Favourites first, then the person's own order, then name. The strip
  // above the Send button takes the first few of exactly this list, so
  // hearting something is also how it gets there — one rule, not a
  // separate "pinned" collection that could disagree with the grid.
  return rows.sort((a, b) => {
    const byHeart = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
    if (byHeart !== 0) return byHeart;
    const byIndex = (Number(a.sortIndex) || 0) - (Number(b.sortIndex) || 0);
    return byIndex !== 0 ? byIndex : String(a.name || "").localeCompare(String(b.name || ""));
  });
}

// How many of them the Send strip offers. Four fits a narrow phone beside
// the "All" tile without the row becoming a scroll nobody notices.
var CHOICES_STRIP_COUNT = 4;

// Hearting is optimistic and rolled back on failure, like tagging: it is a
// preference, it shows instantly, and if the write fails the heart goes
// back to what it was rather than lying about having been saved.
async function choicesToggleFavorite(category) {
  const id = category && category.id;
  if (!id) return null;
  const before = Boolean(category.favorite);
  const next = !before;

  choicesEmit(Object.assign({}, choicesState, {
    categories: choicesState.categories.map((row) =>
      String(row.id) === String(id) ? Object.assign({}, row, { favorite: next }) : row)
  }));

  try {
    return await GloobalApi.updateCategory(id, { favorite: next });
  } catch (error) {
    choicesEmit(Object.assign({}, choicesState, {
      categories: choicesState.categories.map((row) =>
        String(row.id) === String(id) ? Object.assign({}, row, { favorite: before }) : row)
    }));
    throw error;
  }
}

function choicesById(state, id) {
  const want = String(id || "");
  if (!want) return null;
  const rows = state && Array.isArray(state.categories) ? state.categories : [];
  return rows.find((row) => String(row.id) === want) || null;
}

// The category a given history row is filed under, or null. Takes the row
// rather than the reference so callers read naturally at a list.
function choicesForRow(state, row) {
  const ref = row && row.txnId;
  if (!ref || !state) return null;
  return choicesById(state, state.tags[ref]);
}

function useChoices() {
  return useSyncExternalStore4(choicesSubscribe, choicesSnapshot, choicesServerSnapshot);
}
