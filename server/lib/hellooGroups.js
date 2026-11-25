'use strict';

// Helloo groups and announcement groups (25 Nov): the rules, with no
// database in them, so they can be checked on their own
// (tests/helloo-groups-rules.test.mjs). lib/helloo.js does the reading and
// writing and asks these what is allowed.
//
//   * A group: everyone in it writes. An announcement group: only its
//     admins write; members read, and can still message an admin on their
//     own (an ordinary Helloo chat, with the usual price to reach).
//   * Strangers pay to reach you on Helloo, so a group must not be a free
//     way in. Somebody is ADDED straight away only if they already know
//     the person adding them: they saved them, the two have paid each
//     other on GLOOBAL, or they let them message free (they wrote to them,
//     or chose Free for them). Anyone else gets an INVITE and is in only
//     when they say yes. Someone who blocked them, or set them to Never,
//     is not even invited. Inside a group nobody pays anybody.
//   * Joining is free. (A join price can come later.)

const GROUP_KINDS = ['group', 'announce'];
// The most members, the person who made it included.
const GROUP_MAX = { group: 256, announce: 1024 };
const NAME_MAX = 60;
const ABOUT_MAX = 300;
// The most people added or invited in one go.
const ADD_MAX = 50;
// What can be sent in a group: no money (a payment or an order is between
// two people) and no calls.
const GROUP_SEND_KINDS = ['text', 'voice', 'photo', 'video', 'sticker', 'post'];

const clean = (raw, max) => String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, max + 1);

function cleanName(raw) {
  const name = clean(raw, NAME_MAX);
  if (!name) return { ok: false, code: 'group_name', message: 'Give the group a name.' };
  if (name.length > NAME_MAX) return { ok: false, code: 'group_name', message: `A group name can be up to ${NAME_MAX} characters.` };
  return { ok: true, name };
}

function cleanAbout(raw) {
  const about = clean(raw, ABOUT_MAX);
  if (about.length > ABOUT_MAX) return { ok: false, code: 'group_about', message: `What the group is about can be up to ${ABOUT_MAX} characters.` };
  return { ok: true, about };
}

function cleanKind(raw) {
  const kind = String(raw || 'group');
  return GROUP_KINDS.includes(kind) ? kind : null;
}

const has = (list, id, sameId) => (list || []).some((x) => sameId(x && x.userId !== undefined ? x.userId : x, id));

function isAdmin(group, userId, sameId) {
  return Boolean(group && has(group.admins, userId, sameId));
}

// May this member post here? Announcement groups: admins only.
function canPost(conversation, userId, sameId) {
  const group = conversation && conversation.group;
  if (!group) return { ok: true };
  if (group.kind === 'announce' && !isAdmin(group, userId, sameId)) {
    return { ok: false, status: 403, code: 'admins_only', message: 'Only admins post in this announcement group.' };
  }
  return { ok: true };
}

function canSendKind(kind) {
  if (GROUP_SEND_KINDS.includes(kind)) return { ok: true };
  if (kind === 'payment' || kind === 'order') {
    return { ok: false, status: 400, code: 'group_no_money', message: 'Money is sent in a chat with one person, not in a group.' };
  }
  return { ok: false, status: 400, code: 'group_kind', message: 'That cannot be sent in a group.' };
}

// Who is added, who is invited, who is left out — for the people one
// member asked to bring in. `candidates`: [{ id, exists, blocked, known }],
// `known` true (they know the adder), false (they don't), or 'never'.
function place({ candidates, adderId, members, invites, kind, sameId }) {
  const max = GROUP_MAX[kind] || GROUP_MAX.group;
  const out = { add: [], invite: [], refused: [] };
  const seen = [];
  let room = max - (members || []).length;
  for (const c of (candidates || []).slice(0, ADD_MAX + 1)) {
    if (!c || !c.id || seen.some((s) => sameId(s, c.id))) continue;
    seen.push(c.id);
    if (out.add.length + out.invite.length + out.refused.length >= ADD_MAX) { out.refused.push({ id: c.id, reason: 'too_many_at_once' }); continue; }
    if (!c.exists) { out.refused.push({ id: c.id, reason: 'not_found' }); continue; }
    if (sameId(c.id, adderId)) continue;
    if (has(members, c.id, sameId)) { out.refused.push({ id: c.id, reason: 'already_in' }); continue; }
    if (has(invites, c.id, sameId)) { out.refused.push({ id: c.id, reason: 'already_invited' }); continue; }
    if (c.blocked || c.known === 'never') { out.refused.push({ id: c.id, reason: 'not_taking' }); continue; }
    if (room <= 0) { out.refused.push({ id: c.id, reason: 'group_full' }); continue; }
    room -= 1;
    if (c.known === true) out.add.push(c.id);
    else out.invite.push(c.id);
  }
  return out;
}

// When the last admin leaves, the member who has been in longest (first
// in the list) becomes admin, so a group is never left with nobody to run it.
function nextAdmin(group, members, leaverId, sameId) {
  const admins = ((group && group.admins) || []).filter((a) => !sameId(a, leaverId));
  if (admins.length) return null;
  const rest = (members || []).filter((m) => !sameId(m, leaverId));
  return rest.length ? rest[0] : null;
}

// What an announcement group or a group is called, in a sentence.
const kindWord = (kind) => (kind === 'announce' ? 'announcement group' : 'group');

module.exports = {
  GROUP_KINDS, GROUP_MAX, NAME_MAX, ABOUT_MAX, ADD_MAX, GROUP_SEND_KINDS,
  cleanName, cleanAbout, cleanKind, isAdmin, canPost, canSendKind, place, nextAdmin, kindWord,
};
