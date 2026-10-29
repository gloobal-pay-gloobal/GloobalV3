// src/hooks/useBackClose.js
import { useEffect as useEffect8, useRef as useRef6, useCallback as useCallback3 } from "react";
import {
  X as X2
} from "lucide-react";
var __backStack = [];
var __pendingSyntheticPops = 0;
var __backHandlerInstalled = false;
function __installBackHandler() {
  if (__backHandlerInstalled || typeof window === "undefined") return;
  __backHandlerInstalled = true;
  window.addEventListener("popstate", () => {
    if (__pendingSyntheticPops > 0) {
      __pendingSyntheticPops -= 1;
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
      window.history.pushState({ __gidBack: __backStack.length }, "");
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

