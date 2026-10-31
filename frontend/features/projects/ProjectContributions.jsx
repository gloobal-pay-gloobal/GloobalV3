// src/features/projects/ProjectContributions.jsx
import { useState as useState50, useEffect as useEffect49, useCallback as useCallback41 } from "react";
import { HandCoins, Users as Users3, Check as Check8 } from "lucide-react";

// ── GIVING TO A PROJECT ─────────────────────────────────────────────────
//
// Until now a Hooman Project could be described and could name a goal, and
// nothing could be given to it. The page said so in as many words — "Zero
// because Gloobal cannot take contributions yet, not because nobody has
// given" — which was the honest thing to write under three zeroes, and is
// the line this feature exists to delete.
//
// ── THE ONE THING TO KNOW BEFORE READING ANY OF THIS ────────────────────
//
// NOTHING IN THIS FILE MOVES MONEY, and nothing in the route it talks to
// does either.
//
// Giving is an ordinary Gloobal payment to the project's owner, made on the
// Send Money screen, through the same route, PIN gate, ledger, corridor
// arithmetic and receipt as every other payment in the app. What this
// feature adds is the ATTRIBUTION — "that payment was for this project" —
// and the list that attribution makes possible.
//
// That is why the Give button below does not open a keypad. It opens Send
// Money with the project's owner already filled in. The amount, the
// currency, the PIN, the biometric prompt and the receipt are all the
// screens the person already knows, and not one line of them was rewritten
// for this. The full reasoning is in server/models/Contribution.js.

// How often the list re-reads itself when the screen asks it to.
var PROJECT_CONTRIBUTIONS_EVENT = "gloobal:projectContributions";

// Tells any mounted list for this project to refresh.
//
// Fired after a contribution is attributed, from App.jsx — which is a long
// way from this list, and not on its parent chain at all once Send Money
// has opened over the top. An event rather than a prop threaded through
// four screens, for the same reason CHOICE_LINK_EVENT is one.
function announceProjectContribution(projectId) {
  try {
    window.dispatchEvent(new CustomEvent(PROJECT_CONTRIBUTIONS_EVENT, {
      detail: { projectId: String(projectId || "") }
    }));
  } catch (e) {
    // An environment without CustomEvent is one where the list simply does
    // not auto-refresh. Nothing else depends on this.
  }
}

// The list, its totals, and whether we actually managed to read them.
//
// `failed` is separate from an empty list on purpose, and it is the whole
// reason this is a hook rather than a fetch inside the component: "nobody
// has given yet" and "we could not reach the server" look identical if you
// only have an array, and telling an owner the first when the truth is the
// second is telling them something false about their own project.
function useProjectContributions(projectId, { enabled = true } = {}) {
  const [state, setState] = useState50({
    rows: [],
    raised: 0,
    backers: 0,
    currency: "",
    nextCursor: null,
    loading: Boolean(projectId && enabled),
    failed: false
  });

  const read = useCallback41(async () => {
    if (!projectId || !enabled) return;
    setState((prev) => ({ ...prev, loading: true }));
    const page = await GloobalApi.getProjectContributions(projectId);
    setState(page
      ? {
        rows: page.contributions,
        raised: page.raised,
        backers: page.backers,
        currency: page.currency,
        nextCursor: page.nextCursor,
        loading: false,
        failed: false
      }
      // Keeps whatever was already on screen rather than blanking it: a
      // list that empties itself on one failed poll is worse than a list
      // that is briefly stale.
      : (prev) => ({ ...prev, loading: false, failed: true }));
  }, [projectId, enabled]);

  useEffect49(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await read();
    })();
    return () => { cancelled = true; };
  }, [read]);

  useEffect49(() => {
    if (!projectId) return undefined;
    const onChanged = (event) => {
      const which = event && event.detail && event.detail.projectId;
      if (!which || String(which) === String(projectId)) read();
    };
    window.addEventListener(PROJECT_CONTRIBUTIONS_EVENT, onChanged);
    return () => window.removeEventListener(PROJECT_CONTRIBUTIONS_EVENT, onChanged);
  }, [projectId, read]);

  const loadMore = async () => {
    if (!state.nextCursor || !projectId) return;
    const page = await GloobalApi.getProjectContributions(projectId, { cursor: state.nextCursor });
    if (!page) return;
    setState((prev) => ({
      ...prev,
      // Concatenated by id rather than appended blindly: a row that arrived
      // between the two reads would otherwise appear on both pages.
      rows: prev.rows.concat(page.contributions.filter(
        (row) => !prev.rows.some((held) => held.id === row.id)
      )),
      nextCursor: page.nextCursor
    }));
  };

  return { ...state, refresh: read, loadMore };
}

// A date, in the register this list wants: recent gifts read as "2 hours
// ago" because that is how somebody thinks about a thing that just
// happened, and older ones get a real date because "47 days ago" is not
// how anybody thinks about anything.
function contributionWhen(value) {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  const seconds = Math.max(0, Math.round((Date.now() - at.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 6) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return at.toLocaleDateString(void 0, { day: "numeric", month: "short", year: "numeric" });
}

// One backer's initials, for the circle beside their row.
//
// Falls back to a single glyph rather than to empty: a blank circle in a
// column of filled ones reads as a row that failed to load.
function contributionInitials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "✦";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)).toUpperCase();
}

// The button that starts a gift.
//
// Not shown to the project's own owner, and not on a draft. Both are
// refused by the server too — this is so the control is absent rather than
// present and failing, which is the difference between a page that knows
// what it is and one that finds out when you tap it.
function ProjectGiveButton({ project, onGive, tint }) {
  if (!project || project.isOwner || project.status !== "published") return null;
  return <button
    onClick={onGive}
    className="v2-tap"
    data-testid="project-give"
    style={{
      marginTop: 14,
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      border: "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      background: T.gradButton,
      color: "#fff",
      fontSize: 14.5,
      fontWeight: 800,
      fontFamily: T.fontDisplay,
      cursor: "pointer",
      boxShadow: T.shadowRaised
    }}
  ><HandCoins size={18} />
    Give to this project
  </button>;
}

// The one question asked before handing over to Send Money.
//
// There is exactly one, and it is the one that cannot be asked afterwards:
// whether this person's name may appear in the public list. Everything else
// — how much, in what currency, with what note — is asked on the payment
// screen, which already asks it well.
//
// The default is NOT to publish. A name published once cannot be
// unpublished from the screenshots other people have already taken, so the
// quiet answer is the one that survives being wrong.
function ProjectGiveSheet({ project, onClose, onContinue, tint }) {
  const [showName, setShowName] = useState50(false);
  if (!project) return null;
  return <div
    onClick={onClose}
    // ABOVE THE PROJECT PAGE, which is itself a fixed overlay at 345 — and
    // above the country picker at 360, which can be open behind it. This
    // sheet first shipped at 90 and was invisible: it rendered, it reported
    // itself visible to a test, and it was underneath the page it belonged
    // to. A sheet is only a sheet if it is on top of its own screen.
    style={{ position: "fixed", inset: 0, background: "rgba(16,12,38,0.5)", zIndex: 370, display: "flex", alignItems: "flex-end" }}
  ><div
    onClick={(e) => e.stopPropagation()}
    data-testid="project-give-sheet"
    style={{ width: "100%", background: T.bg, borderRadius: "22px 22px 0 0", padding: "20px 18px calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 14 }}
  ><div style={{ width: 40, height: 4, borderRadius: 2, background: T.line, alignSelf: "center" }} /><div><div
    style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.25 }}
  >
      Give to {project.title}
    </div><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
      You'll pay {project.ownerSymbolId ? "the project" : "the owner"} on the
      usual Send screen. The money reaches them straight away — <GloobalWordmark /> does
      not hold it and cannot return it for you.
    </div></div>{
    /* The one question. A switch rather than a checkbox: the answer
       changes what other people see, and a switch is the control this app
       uses everywhere else for "on or off, and it matters". */
  }<button
    onClick={() => setShowName((on) => !on)}
    className="v2-tap"
    data-testid="project-give-showname"
    aria-pressed={showName}
    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", border: `1px solid ${showName ? T.accent : T.line}`, background: T.surface, borderRadius: T.radiusMd, padding: "13px 14px", cursor: "pointer" }}
  ><span
    aria-hidden="true"
    style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, border: `1.5px solid ${showName ? T.accent : T.line}`, background: showName ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}
  >{showName && <Check8 size={14} color="#fff" />}</span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}
  >
        Show my name
      </span><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{showName
    ? "Everyone who opens this project sees your name beside what you gave."
    : "The list will say “Someone”. Only the project's owner sees who you are."}</span></span></button><button
    onClick={() => onContinue({ showName })}
    className="v2-tap"
    style={{ border: "none", borderRadius: T.radiusMd, padding: "15px 0", background: T.gradButton, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: T.fontDisplay, cursor: "pointer" }}
  >
      Continue
    </button><button
    onClick={onClose}
    className="v2-tap"
    style={{ border: "none", background: "none", color: T.inkSoft, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 0 2px" }}
  >
      Not now
    </button></div></div>;
}

// The list of gifts, under the project.
//
// `money` is passed in rather than chosen here: the project page already
// decided how it formats an amount (GEU lens, the viewer's own currency,
// the compact form the figures row uses), and a list that formatted money
// its own way would put two different renderings of the same currency on
// one screen.
function ProjectContributionList({ projectId, enabled = true, money, tint, accent }) {
  const feed = useProjectContributions(projectId, { enabled });
  if (!projectId || !enabled) return null;

  const heading = <div
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 22 }}
  ><span style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>
      Contributions
    </span>{feed.backers > 0 && <span
      style={{ display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, background: tint, color: accent, fontSize: 11, fontWeight: 800 }}
    ><Users3 size={12} />{feed.backers}</span>}</div>;

  // Three states, and they are three. A failed read says so instead of
  // showing the empty state, which would tell an owner nobody had given.
  const body = feed.failed
    ? <div style={{ padding: "18px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint, lineHeight: 1.5 }}>
        Couldn't load the contributions just now.{" "}
        <span
          role="button"
          tabIndex={0}
          onClick={feed.refresh}
          onKeyDown={(e) => { if (e.key === "Enter") feed.refresh(); }}
          style={{ color: accent, fontWeight: 700, cursor: "pointer" }}
        >Try again</span>
      </div>
    : feed.loading && feed.rows.length === 0
      ? <div style={{ padding: "18px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>
          Loading…
        </div>
      : feed.rows.length === 0
        ? <div style={{ padding: "20px 18px", textAlign: "center", fontSize: 12.5, color: T.inkFaint, lineHeight: 1.6 }}>
            Nobody has given yet. The first one shows up here.
          </div>
        : <div style={{ display: "flex", flexDirection: "column" }}>{feed.rows.map((row, i) => <div
            key={row.id}
            data-testid="contribution-row"
            style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
          ><span
            aria-hidden="true"
            style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: row.anonymous ? T.surfaceSunk : tint, color: row.anonymous ? T.inkFaint : accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}
          >{row.anonymous ? "✦" : contributionInitials(row.name)}</span><span
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}
          ><span style={{ display: "flex", alignItems: "baseline", gap: 7 }}><span
            style={{ fontSize: 13.5, fontWeight: 700, color: row.anonymous ? T.inkSoft : T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >{
            /* "Someone" is the withheld name, and it is not the same as a
               person who happens to have no name set — the server answers
               `anonymous` for exactly this, so the two are never confused. */
          }{row.anonymous ? "Someone" : (row.name || "GLOOBAL User")}</span>{row.isMine && <span
            style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: accent, background: tint, borderRadius: 999, padding: "2px 7px" }}
          >You</span>}</span>{row.note && <span
            style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, overflowWrap: "anywhere" }}
          >{row.note}</span>}<span style={{ fontSize: 11, color: T.inkFaint }}>{contributionWhen(row.paidAt)}</span></span><span
            style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 800, color: T.txnIn, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}
          >{money(row.amount, row.currency)}</span></div>)}{feed.nextCursor && <button
            onClick={feed.loadMore}
            className="v2-tap"
            style={{ border: "none", borderTop: `1px solid ${T.line}`, background: "none", padding: "13px 0", color: accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
          >
            Show more
          </button>}</div>;

  return <>{heading}<div
    style={{ marginTop: 9, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{body}</div></>;
}
