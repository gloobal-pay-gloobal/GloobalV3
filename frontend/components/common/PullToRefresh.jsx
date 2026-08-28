// src/components/common/PullToRefresh.jsx
import { useState as useState33, useEffect as useEffect23, useRef as useRef19 } from "react";

// Pull-to-refresh for a scrolling screen.
//
// Wraps a scroll container and adds the gesture people already expect from
// every other app on the phone: at the very top of the list, drag down, an
// indicator appears and follows your finger, and past a threshold letting go
// runs the refresh.
//
// Three rules it does not break, because breaking any of them is worse than
// not having the gesture at all:
//
//   1. It never replaces normal scrolling. The gesture is only armed when
//      the container is ALREADY at scrollTop 0 when the finger goes down.
//      Half way down the page, a downward drag scrolls, exactly as before.
//   2. It never fights a horizontal swipe. If the finger travels further
//      sideways than down, the gesture disarms and hands the touch back.
//   3. It never lies about being finished. The spinner runs until the
//      refresh promise settles, not for a fixed interval.
//
// The pull is damped rather than linear: dragging 200px moves the indicator
// far less than 200px, which is what makes the rubber-band feel right and
// stops a long drag pushing the content off the screen.

// How far the finger must travel, in CSS pixels of DAMPED movement, before
// letting go triggers a refresh.
var GLOOBAL_PTR_THRESHOLD = 64;
// Where the indicator stops. A little past the threshold so the spinner has
// somewhere to sit while it works.
var GLOOBAL_PTR_MAX = 92;
// Resistance. 0.5 means the indicator moves half as far as the finger.
var GLOOBAL_PTR_DAMPING = 0.5;
// Below this, a touch is a tap or a scroll, not a pull. Stops the indicator
// twitching on every tap near the top of the list.
var GLOOBAL_PTR_MIN_INTENT = 6;

function PullToRefresh({ onRefresh, disabled = false, style, children }) {
  const scrollRef = useRef19(null);
  const [pull, setPull] = useState33(0);
  const [refreshing, setRefreshing] = useState33(false);
  // Everything the move handler needs that must not trigger a re-render on
  // every frame of a drag. State here would re-render the whole dashboard
  // sixty times a second while the finger moves.
  const gesture = useRef19({ armed: false, startY: 0, startX: 0, decided: false });

  const runRefresh = async () => {
    if (!onRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    // Hold the indicator at the resting position while the work runs.
    setPull(GLOOBAL_PTR_THRESHOLD);
    try {
      await onRefresh();
    } catch (e) {
      // A failed refresh is the caller's business to report — the balance
      // line has its own error state. The gesture's only job is to stop.
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  };

  const onTouchStart = (e) => {
    if (disabled || refreshing) return;
    const el = scrollRef.current;
    // Armed ONLY when already at the top. This is the whole of rule 1.
    if (!el || el.scrollTop > 0) {
      gesture.current.armed = false;
      return;
    }
    const touch = e.touches[0];
    gesture.current = { armed: true, startY: touch.clientY, startX: touch.clientX, decided: false };
  };

  const onTouchMove = (e) => {
    const g = gesture.current;
    if (!g.armed || refreshing) return;
    const touch = e.touches[0];
    const dy = touch.clientY - g.startY;
    const dx = touch.clientX - g.startX;

    // An upward drag is an ordinary scroll; let go of the gesture entirely
    // so it cannot re-arm halfway through the same touch.
    if (dy <= 0) {
      g.armed = false;
      setPull(0);
      return;
    }

    if (!g.decided) {
      if (Math.abs(dy) < GLOOBAL_PTR_MIN_INTENT && Math.abs(dx) < GLOOBAL_PTR_MIN_INTENT) return;
      // Rule 2: more sideways than down means this belongs to a carousel or
      // a horizontal list, not to us.
      if (Math.abs(dx) > Math.abs(dy)) {
        g.armed = false;
        return;
      }
      g.decided = true;
    }

    // The container scrolled under us mid-gesture (momentum from a previous
    // flick, say). Stop pulling and let it scroll.
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) {
      g.armed = false;
      setPull(0);
      return;
    }

    const damped = Math.min(dy * GLOOBAL_PTR_DAMPING, GLOOBAL_PTR_MAX);
    setPull(damped);
    // Only once this is genuinely a pull: preventing default earlier would
    // swallow taps and short scrolls. Guarded because a listener attached
    // as passive cannot preventDefault, and React attaches touchmove
    // passively by default in some builds.
    if (damped > 0 && e.cancelable) e.preventDefault();
  };

  const endGesture = () => {
    const g = gesture.current;
    g.armed = false;
    g.decided = false;
    if (refreshing) return;
    if (pull >= GLOOBAL_PTR_THRESHOLD) {
      runRefresh();
      return;
    }
    setPull(0);
  };

  // React's synthetic touchmove is passive in React 17+, so preventDefault
  // inside it is ignored and the browser scrolls anyway. The listener is
  // therefore attached directly, non-passively, to the scroll container.
  useEffect23(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e) => onTouchMove(e);
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  });

  const progress = Math.min(pull / GLOOBAL_PTR_THRESHOLD, 1);
  const ready = pull >= GLOOBAL_PTR_THRESHOLD;

  return <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{
    /* The indicator lives outside the scrolling content so it is not
       itself scrolled away by the gesture that summons it. */
  }<div
    aria-hidden={pull === 0 && !refreshing}
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: Math.max(pull, 0),
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: 2,
      opacity: pull === 0 && !refreshing ? 0 : 1,
      transition: gesture.current.armed ? "none" : "height 0.22s ease, opacity 0.22s ease"
    }}
  ><div
    style={{
      width: 30,
      height: 30,
      borderRadius: "50%",
      background: T.surface,
      boxShadow: T.shadowCard,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transform: refreshing ? "none" : `rotate(${progress * 270}deg)`,
      transition: gesture.current.armed ? "none" : "transform 0.22s ease"
    }}
  ><span
    style={{
      width: 14,
      height: 14,
      borderRadius: "50%",
      border: `2px solid ${ready || refreshing ? T.accent : T.inkFaint}`,
      borderTopColor: "transparent",
      animation: refreshing ? "spin 0.9s linear infinite" : "none"
    }}
  /></div></div><div
    ref={scrollRef}
    // A stable hook for the browser tests to aim touch events at. The
    // gesture is defined by which element is scrolled, so a test that
    // guessed at the element from its styling would pass while proving
    // nothing about the real one.
    data-gloobal-scroll="pull-to-refresh"
    onTouchStart={onTouchStart}
    onTouchEnd={endGesture}
    onTouchCancel={endGesture}
    style={{
      position: "relative",
      zIndex: 1,
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      transform: pull > 0 ? `translateY(${pull}px)` : "none",
      transition: gesture.current.armed ? "none" : "transform 0.22s ease",
      ...style
    }}
  >{children}</div></div>;
}
