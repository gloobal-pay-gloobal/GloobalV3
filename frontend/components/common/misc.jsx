// src/components/common/misc.jsx
import { useMemo as useMemo3 } from "react";
import {
  Star as Star3
} from "lucide-react";
// ── WHETHER THIS SERVICE IS LIVE YET ────────────────────────────────────
//
// A star, like the one that marks a pinned shop: HOLLOW AND RED while a
// service is not connected to a real API, SOLID AND GREEN once it is.
//
// ── IT WAS A PADLOCK, AND THE REASON IT CHANGED MATTERS LESS THAN THE
//    REASON IT KEPT TWO SIGNALS ─────────────────────────────────────────
//
// The padlock before this drew a CLOSED shape in both states and changed
// only its colour — red for locked, green for unlocked. A closed padlock
// means "locked" to anyone who has ever seen one, so the shape said locked
// while the colour said open, and the colour was the part carrying the
// meaning. On the Accounts tab that produced green padlocks on the three
// services that were available, which reads as the exact opposite of the
// truth. It was fixed by making the shape carry it too: closed and red,
// open and green.
//
// The founder asked for a star instead, and a star has no open and closed.
// Drawing it red or green and nothing else would put the whole meaning
// back into colour alone — and red and green are the pair a large minority
// of people cannot separate, which is the fault that was just removed.
//
// So the star is FILLED or not. Hollow reads as an outline waiting to be
// completed; solid reads as done, which is what it is. Colour agrees with
// the fill rather than carrying the message on its own, and the same
// difference is already doing this job on a pinned shop's mark.
function ServiceLock({ locked = true, size = 15 }) {
  return <Star3
    size={size}
    color={locked ? T.negative : T.positive}
    fill={locked ? "none" : T.positive}
    strokeWidth={locked ? 2.2 : 1.6}
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  />;
}

