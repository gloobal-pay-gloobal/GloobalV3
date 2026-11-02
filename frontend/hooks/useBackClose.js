// src/hooks/useBackClose.js
import { useEffect as useEffect8, useRef as useRef6, useCallback as useCallback3 } from "react";
import {
  X as X2
} from "lucide-react";
var __backStack = [];
var __pendingSyntheticPops = 0;
var __backHandlerInstalled = false;
// Who is waiting for the app's own history moves to finish (backStackCloseAll).
var __backSettledWaiters = [];
// How many history entries this app has pushed on top of the page it
// started on, read back from each entry's own state. backStackCloseAll goes
// back by exactly this many, so it can never step off the app's first page
// (0204: going back by the size of the stack once did, when an entry had
// already lost its history step).
var __gidDepth = 0;
function __backSettled() {
  const waiting = __backSettledWaiters.splice(0);
  for (const done of waiting) done();
}
function __installBackHandler() {
  if (__backHandlerInstalled || typeof window === "undefined") return;
  __backHandlerInstalled = true;
  __gidDepth = (window.history.state && Number(window.history.state.__gidDepth)) || 0;
  window.addEventListener("popstate", (e) => {
    __gidDepth = (e && e.state && Number(e.state.__gidDepth)) || 0;
    if (__pendingSyntheticPops > 0) {
      __pendingSyntheticPops -= 1;
      if (__pendingSyntheticPops === 0) __backSettled();
      return;
    }
    const top = __backStack.pop();
    if (top) top.fire();
  });
}
// `options.unwind`: when the thing is closed by the app itself rather than
// by Back (a lookup that finished, a tap outside), take its history entry
// back off too. Without it, the entry stays behind and the person's next
// Back press does nothing at all — which is how the dashboard's pay box
// felt broken (0145). Opt-in, so no existing screen changes behaviour.
// ── CLOSE EVERYTHING, AS IF BACK HAD BEEN PRESSED FOR EACH (0204) ─────
//
// The app map opens a screen from wherever the person is. It used to open
// it ON TOP of whatever was already up, so Coverage could sit over GLOOBAL
// Bank over Referral, and Back walked down through all of them — the
// founder: "even if it's open it will open many in parallel when I do back
// back then I got to see them".
//
// This closes every screen that registered here, newest first, and takes
// all their history entries off in one move, so the next screen opened is
// the only one, and Back from it goes home. It resolves once the browser
// has finished moving, because a screen opened before then would have its
// own new history entry taken off by that same move.
function backStackCloseAll() {
  const entries = __backStack.splice(0).reverse();
  for (const entry of entries) {
    try { entry.fire(); } catch (e) { /* one screen's close must not stop the rest */ }
  }
  const steps = Math.min(entries.length, __gidDepth);
  if (!steps || typeof window === "undefined") return Promise.resolve(0);
  __pendingSyntheticPops += 1;
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(entries.length); } };
    __backSettledWaiters.push(finish);
    // A browser that never answers must not leave the map hanging.
    setTimeout(finish, 900);
    window.history.go(-steps);
  });
}
// Resolves once the app's own history moves have all landed — the map
// closing itself, for one — so the next move is not raced against them.
function backStackWhenSettled() {
  if (__pendingSyntheticPops <= 0 || typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => { if (!finished) { finished = true; resolve(); } };
    __backSettledWaiters.push(finish);
    setTimeout(finish, 900);
  });
}
function useBackClose(isOpen, onClose, options) {
  const unwind = Boolean(options && options.unwind);
  __installBackHandler();
  const onCloseRef = useRef6(onClose);
  onCloseRef.current = onClose;
  const entryRef = useRef6(null);
  useEffect8(() => {
    if (!isOpen) return;
    const entry = { fire: () => onCloseRef.current() };
    entryRef.current = entry;
    __backStack.push(entry);
    if (typeof window !== "undefined") {
      __gidDepth += 1;
      window.history.pushState({ __gidBack: __backStack.length, __gidDepth }, "");
    }
    return () => {
      const idx = __backStack.indexOf(entry);
      if (idx !== -1) {
        __backStack.splice(idx, 1);
        // Still in the stack means nobody pressed Back for it: the app
        // closed it. With `unwind`, its history entry goes too.
        if (unwind && typeof window !== "undefined") {
          __pendingSyntheticPops += 1;
          window.history.back();
        }
      }
      entryRef.current = null;
    };
  }, [isOpen]);
  const requestClose = useCallback3(() => {
    const entry = entryRef.current;
    const idx = __backStack.indexOf(entry);
    if (idx !== -1) {
      __backStack.splice(idx, 1);
      __pendingSyntheticPops += 1;
      if (typeof window !== "undefined") window.history.back();
    }
    onCloseRef.current();
  }, []);
  return requestClose;
}

