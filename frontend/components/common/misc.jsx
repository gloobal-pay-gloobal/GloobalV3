// src/components/common/misc.jsx
import { useMemo as useMemo3 } from "react";
import {
  Lock as Lock2,
  Unlock as Unlock3
} from "lucide-react";
// A padlock that agrees with itself.
//
// This drew a CLOSED padlock in both states and changed only its colour:
// red for locked, green for unlocked. A closed padlock means "locked" to
// anyone who has ever seen one, so the shape said locked while the colour
// said open — and the colour was the part carrying the meaning. On the
// Accounts tab that produced green padlocks on the three services that
// were available, which reads as the exact opposite of the truth.
//
// Now the shape carries it and the colour agrees: closed and red when
// locked, open and green when not. Colour alone was never enough anyway —
// red and green are the pair a large minority of people cannot separate,
// and this was the only signal distinguishing the two states.
function ServiceLock({ locked = true, size = 15 }) {
  const Glyph = locked ? Lock2 : Unlock3;
  return <Glyph
    size={size}
    color={locked ? T.negative : T.positive}
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  />;
}

