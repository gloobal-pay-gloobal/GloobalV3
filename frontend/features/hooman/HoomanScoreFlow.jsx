// src/features/hooman/HoomanScoreFlow.jsx
import { useState as useState73, useEffect as useEffect69, useMemo as useMemo17, useRef as useRef42 } from "react";
// ── HOOMAN SCORE, REWORKED (0180) ─────────────────────────────────────────
//
// What changed, from the founder's choices on 1 Nov:
//   - The score shows from the FIRST answer, out of 100, in gentle words
//     ("Doing well", "Steady", "Could be easier") — never "0 out of 400"
//     until all twenty are answered, and never "Needs Work".
//   - A daily check-in of four cards, one per pillar, answered with five
//     faces. One tap answers and the next card slides in.
//   - The "7 + 5 = ?" sums no longer count toward a pillar. Once a week a
//     sum rides along as an attention check (see server/lib/hoomanScore.js).
//   - Finance is asked once a month instead of locking forever.
//   - Days in a row, a done screen that says what changed, and a gentle
//     support card when "how are you feeling" keeps coming back low.
//
// The money never moves because of anything here. The server decides what
// an answer is worth; this screen only shows it.
//
// Dashboard.jsx keeps the answers, the saving and the consent sheet (they
// were already there and already tested); this file is the screens.

// The five faces, lowest first. The server stores 1..5.
var HOOMAN_FACES = [
  { value: "1", emoji: "\u{1F61E}", label: "Not at all" },
  { value: "2", emoji: "\u{1F641}", label: "A little" },
  { value: "3", emoji: "\u{1F610}", label: "Somewhat" },
  { value: "4", emoji: "\u{1F642}", label: "Mostly" },
  { value: "5", emoji: "\u{1F604}", label: "Very much" }
];
// Same table as the server (HOOMAN_SCALE_POINTS): an answer kept on this
// phone scores exactly what the server would give it.
var HOOMAN_FACE_POINTS = { 1: 10, 2: 14, 3: 18, 4: 21, 5: 25 };

// Out of 100, in words. Mirrors hoomanWords() on the server.
function hoomanWordsFor(overall) {
  if (overall === null || overall === undefined) return null;
  if (overall >= 70) return "Doing well";
  if (overall >= 50) return "Steady";
  return "Could be easier";
}

// A pillar's score from the answers this screen holds: the share of its
// possible points earned, over the check-ins answered. Same formula as the
// server's computeHoomanScore.
function hoomanPillarScore(answers, cat) {
  const answered = cat.items.filter((it) => answers[`${cat.key}.${it.key}`]);
  if (!answered.length) return null;
  const total = answered.reduce((sum, it) => sum + Number(answers[`${cat.key}.${it.key}`].points || 0), 0);
  return Math.round(total / (answered.length * 25) * 100);
}

function hoomanOverall(answers) {
  const scores = GH_CATEGORIES.map((cat) => hoomanPillarScore(answers, cat)).filter((s) => s !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// Whole days between two YYYY-MM-DD keys.
function hoomanDaysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return null;
  const a = Date.parse(`${fromKey}T00:00:00Z`);
  const b = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

// Today's four: one check-in per pillar, the one asked longest ago (never
// asked first). Nothing answered today is asked again today, and a Finance
// check-in answered this month waits for next month.
function hoomanTodayPicks(answers, today) {
  const month = String(today).slice(0, 7);
  const picks = [];
  for (const cat of GH_CATEGORIES) {
    // One a day per pillar: a pillar answered today is done for today.
    if (cat.items.some((item) => (answers[`${cat.key}.${item.key}`] || {}).day === today)) continue;
    const open = cat.items.filter((item) => {
      const ans = answers[`${cat.key}.${item.key}`];
      if (!ans) return true;
      if (ans.day === today) return false;
      if (cat.monthly && String(ans.day || "").slice(0, 7) === month) return false;
      return true;
    });
    if (!open.length) continue;
    open.sort((x, y) => {
      const dx = (answers[`${cat.key}.${x.key}`] || {}).day || "";
      const dy = (answers[`${cat.key}.${y.key}`] || {}).day || "";
      if (dx !== dy) return dx < dy ? -1 : 1;
      return ghDailySeed(`${today}.${cat.key}.${x.key}`) % 97 - ghDailySeed(`${today}.${cat.key}.${y.key}`) % 97;
    });
    picks.push({ kind: "face", cat, item: open[0] });
  }
  return picks;
}

// The wording for today, rotating by day.
function hoomanFaceQuestion(cat, item, today) {
  const list = Array.isArray(item.faces) && item.faces.length ? item.faces : item.questions || [item.label];
  return list[ghDailySeed(`${today}.${cat.key}.${item.key}.face`) % list.length];
}

// The weekly attention sum: two small numbers and three answers to tap.
function hoomanAttentionCard(today) {
  const a = 3 + ghDailySeed(`${today}.attention.a`) % 7;
  const b = 2 + ghDailySeed(`${today}.attention.b`) % 7;
  const sum = a + b;
  const options = [sum - 1, sum, sum + 1];
  const shift = ghDailySeed(`${today}.attention.o`) % 3;
  return { kind: "attention", a, b, sum, options: options.slice(shift).concat(options.slice(0, shift)) };
}

// Who to call. Only numbers checked against the services' own sites (Nov
// 2026): India's national Tele-MANAS line, the US 988 line, and Samaritans
// in the UK. Everywhere else goes to findahelpline.com, an IASP-backed
// directory of verified local services, rather than to a number this app
// could get wrong.
var HOOMAN_HELPLINES = {
  IN: { name: "Tele-MANAS", number: "14416", tel: "14416", note: "Free, 24 hours, in Indian languages" },
  US: { name: "988 Lifeline", number: "988", tel: "988", note: "Call or text, 24 hours" },
  GB: { name: "Samaritans", number: "116 123", tel: "116123", note: "Free, 24 hours" }
};

function hoomanHelplineFor(countryIso) {
  const iso = String(countryIso || "").toUpperCase();
  if (HOOMAN_HELPLINES[iso]) return { ...HOOMAN_HELPLINES[iso], href: `tel:${HOOMAN_HELPLINES[iso].tel}` };
  return {
    name: "Find a helpline near you",
    number: null,
    href: `https://findahelpline.com/countries/${iso ? iso.toLowerCase() : ""}`,
    note: "Free, confidential services in your country"
  };
}

function HoomanSupportCard({ countryIso, onDismiss }) {
  const line = hoomanHelplineFor(countryIso);
  return <div
    data-testid="hooman-support"
    role="region"
    aria-label="Support"
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}
  ><div style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>It sounds like things are heavy right now</div><div style={{ fontSize: 13, lineHeight: 1.55, color: T.inkSoft }}>
      You don't have to carry it alone. Talking to someone can help, and these people are there to listen.
    </div><a
    href={line.href}
    target={line.number ? undefined : "_blank"}
    rel={line.number ? undefined : "noopener noreferrer"}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, textDecoration: "none", borderRadius: T.radiusMd, padding: "13px 15px", background: hexToRgba(T.positive, 0.1), color: T.ink }}
  ><span><span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{line.number ? `${line.name} \xB7 ${line.number}` : line.name}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 2 }}>{line.note}</span></span><span style={{ fontSize: 13, fontWeight: 800, color: T.positive, flexShrink: 0 }}>{line.number ? "Call" : "Open"}</span></a><div style={{ fontSize: 11.5, lineHeight: 1.5, color: T.inkFaint }}>
      If you're in danger right now, call your local emergency number. Nobody else sees this card or your answers.
    </div>{onDismiss && <button
    onClick={onDismiss}
    className="v2-tap"
    style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 700, color: T.inkSoft, cursor: "pointer" }}
  >Not now</button>}</div>;
}

// Five faces in a row. `picked` is the face already given today, if any.
function HoomanFaceRow({ onPick, picked, color }) {
  return <div><div role="group" aria-label="Your answer" style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>{HOOMAN_FACES.map((face) => {
    const on = picked === face.value;
    return <button
      key={face.value}
      onClick={() => onPick(face.value)}
      aria-label={face.label}
      aria-pressed={on}
      className="v2-tap"
      style={{
        flex: 1,
        height: 66,
        borderRadius: 18,
        border: on ? `2.5px solid ${color}` : "2.5px solid transparent",
        background: on ? hexToRgba(color, 0.12) : T.surface,
        boxShadow: T.shadowCard,
        fontSize: 30,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0
      }}
    >{face.emoji}</button>;
  })}</div><div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, fontWeight: 700, color: T.inkFaint }}><span>Not at all</span><span>Very much</span></div></div>;
}

// The card stack: one question at a time.
function HoomanCheckin({ cards, answers, today, catColor, onAnswer, onAttention, onClose, onFinished }) {
  const [index, setIndex] = useState73(0);
  const [picked, setPicked] = useState73(null);
  const timer = useRef42(null);
  useEffect69(() => () => clearTimeout(timer.current), []);
  const card = cards[index];
  const next = () => {
    setPicked(null);
    if (index + 1 >= cards.length) onFinished();
    else setIndex(index + 1);
  };
  const choose = (value) => {
    if (picked !== null) return;
    setPicked(value);
    if (card.kind === "attention") onAttention(card.a, card.b, value);
    else onAnswer(card.cat.key, card.item.key, value);
    // A beat to see the tap land, then the next card.
    timer.current = setTimeout(next, 260);
  };
  if (!card) return null;
  const color = card.kind === "attention" ? T.accent : catColor(card.cat.key);
  const Icon = card.kind === "attention" ? null : card.item.icon;
  return <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px" }}><NavBackButton onClick={onClose} label="Close the check-in" /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Today's check-in</span><span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: T.inkFaint }}>{index + 1} of {cards.length}</span></div><div aria-hidden="true" style={{ display: "flex", gap: 6, padding: "0 18px" }}>{cards.map((c, i) => <i key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: i <= index ? c.kind === "attention" ? T.accent : catColor(c.cat.key) : T.surfaceAlt }} />)}</div><div key={index} className="card-flip-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 18px 20px", gap: 18 }}><div style={{ flex: 1, borderRadius: 28, background: T.surface, boxShadow: T.shadowCard, padding: "24px 22px", display: "flex", flexDirection: "column" }}><span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 7px", borderRadius: 999, background: hexToRgba(color, 0.12), color, fontSize: 12.5, fontWeight: 800 }}><span style={{ width: 22, height: 22, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon ? <Icon size={13} color="#fff" /> : <span style={{ color: "#fff", fontSize: 12 }}>+</span>}</span>{card.kind === "attention" ? "Quick check" : `${card.cat.label} \xB7 ${card.item.label}`}</span>{card.kind === "attention" ? <div style={{ marginTop: 36, textAlign: "center", fontSize: 52, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay }}>{card.a} + {card.b} = ?</div> : <div style={{ marginTop: 26, fontSize: 27, lineHeight: 1.22, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay, textWrap: "balance" }}>{hoomanFaceQuestion(card.cat, card.item, today)}</div>}<div style={{ marginTop: "auto", fontSize: 12, lineHeight: 1.5, fontWeight: 600, color: T.inkFaint }}>{card.kind === "attention"
    ? "Tap the answer. This one checks the check-in, it isn't part of your score."
    : card.cat.monthly ? "Asked once a month. There's no wrong answer." : "There's no wrong answer. Honest ones make the score mean something."}</div></div>{card.kind === "attention" ? <div style={{ display: "flex", gap: 12 }}>{card.options.map((n) => <button
    key={n}
    onClick={() => choose(String(n))}
    aria-pressed={picked === String(n)}
    className="v2-tap"
    style={{ flex: 1, height: 70, borderRadius: 20, border: picked === String(n) ? `2.5px solid ${T.accent}` : "2.5px solid transparent", background: T.surface, boxShadow: T.shadowCard, fontSize: 26, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay, cursor: "pointer" }}
  >{n}</button>)}</div> : <HoomanFaceRow onPick={choose} picked={picked} color={color} />}<button
    onClick={next}
    className="v2-tap"
    style={{ alignSelf: "center", border: "none", background: "none", fontSize: 13, fontWeight: 700, color: T.inkFaint, cursor: "pointer", padding: 4 }}
  >Skip this one</button></div></div>;
}

// The score's own ring, with the number and its words in the middle.
function HoomanScoreRing({ answers, catColor, size = 190, empty }) {
  const order = ["community", "finance", "environment", "self"];
  const segments = order.map((key) => {
    const cat = GH_CATEGORIES.find((c) => c.key === key);
    const score = hoomanPillarScore(answers, cat);
    return { color: catColor(key), pct: (score || 0) / 100 };
  });
  const overall = hoomanOverall(answers);
  return <GHSegmentedRing size={size} thickness={16} gapDeg={4} segments={segments}>{overall === null || empty
    ? <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 18px" }}><span style={{ fontSize: 19, fontWeight: 700, color: T.ink, fontFamily: T.fontDisplay }}>No score yet</span><span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 5, lineHeight: 1.4 }}>4 quick questions get your first one</span></div>
    : <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}><span data-testid="hooman-overall" style={{ fontSize: size > 180 ? 50 : 42, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1 }}>{overall}</span><span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint, marginTop: 4 }}>out of 100 · {hoomanWordsFor(overall)}</span></div>}</GHSegmentedRing>;
}

function hoomanAgeText(day, today, monthly) {
  const days = hoomanDaysBetween(day, today);
  if (days === null) return "";
  if (monthly) return String(day).slice(0, 7) === String(today).slice(0, 7) ? "this month \xB7 asked again next month" : days <= 31 ? "last month" : `${days} days ago`;
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days >= 25 && days < 30) return `${days} days ago \xB7 fades in ${30 - days} day${30 - days === 1 ? "" : "s"}`;
  return `${days} days ago`;
}

function hoomanAnswerFace(ans) {
  if (!ans) return null;
  if (ans.type === "scale") return (HOOMAN_FACES[Number(ans.value) - 1] || {}).emoji || null;
  if (ans.type === "yesno") return ans.value === "yes" ? "✔️" : "✖️";
  return "\u{1F4D6}";
}

function HoomanPillar({ cat, answers, today, catColor, onBack, onAsk }) {
  const color = catColor(cat.key);
  const score = hoomanPillarScore(answers, cat);
  const Icon = cat.icon;
  const month = String(today).slice(0, 7);
  return <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px" }}><NavBackButton onClick={onBack} /><span style={{ width: 36, height: 36, borderRadius: 12, background: hexToRgba(color, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={color} /></span><span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{cat.label}</span><span style={{ marginLeft: "auto", fontSize: 26, fontWeight: 800, color: score === null ? T.inkFaint : color, fontFamily: T.fontDisplay }}>{score === null ? "—" : score}</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{cat.items.map((item, i) => {
    const ans = answers[`${cat.key}.${item.key}`];
    const waits = !!ans && (ans.day === today || cat.monthly && String(ans.day || "").slice(0, 7) === month);
    const ItemIcon = item.icon;
    const days = ans ? hoomanDaysBetween(ans.day, today) : null;
    const fading = !cat.monthly && days !== null && days >= 25;
    return <button
      key={item.key}
      onClick={() => !waits && onAsk(cat, item)}
      disabled={waits}
      className="v2-row"
      aria-label={`${item.label}${ans ? "" : ", not answered yet"}`}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", textAlign: "left", cursor: waits ? "default" : "pointer", opacity: fading ? 0.6 : 1 }}
    ><span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center" }}><ItemIcon size={15} color={T.inkSoft} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 700, color: T.ink }}>{item.label}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 2 }}>{ans ? hoomanAgeText(ans.day, today, cat.monthly) : "Not answered yet"}</span></span>{ans ? <span aria-hidden="true" style={{ fontSize: 22 }}>{hoomanAnswerFace(ans)}</span> : <span style={{ fontSize: 12.5, fontWeight: 800, color: T.accent, border: `1.5px solid ${T.accent}`, borderRadius: 12, padding: "6px 11px" }}>Answer</span>}</button>;
  })}</div><div style={{ fontSize: 12, lineHeight: 1.55, fontWeight: 600, color: T.inkFaint, padding: "0 4px" }}>{cat.monthly
    ? "Finance is asked once a month. Your latest answer counts for two months."
    : "Each answer counts for 30 days, then fades. Answering more often keeps the score current but can't push it up on its own."}</div></div></div>;
}

function HoomanScoreFlow({
  screen,
  setScreen,
  activePillar,
  setActivePillar,
  answers,
  extras,
  catColor,
  countryIso,
  signedIn,
  consented,
  onAnswer,
  onAttention,
  onAskToSave,
  onAskDelete,
  onOpenColors,
  onClose
}) {
  const today = ghTodayKey();
  // The floating app-map button sat on top of the pillar tiles and the
  // check-in's faces. Same event the creator screens use to stand it aside.
  // (0231) The map button is an edge tab now and stays here; this tells
  // the map where the person is instead.
  useAppMapHere("ghscore");
  // The cards for this run of the check-in, fixed when it starts so the
  // stack does not reshuffle as answers land.
  const [cards, setCards] = useState73([]);
  const [before, setBefore] = useState73(null);
  const [supportHidden, setSupportHidden] = useState73(false);
  const picks = useMemo17(() => hoomanTodayPicks(answers, today), [answers, today]);
  const overall = hoomanOverall(answers);
  const answeredCount = Object.keys(answers).filter((k) => GH_CATEGORIES.some((c) => k.startsWith(`${c.key}.`))).length;
  const totalCount = GH_CATEGORIES.reduce((s, c) => s + c.items.length, 0);
  // Support: from the server when answers are saved; on this phone, the
  // lowest face for "how are you feeling" today.
  const localLow = answers["self.mental"] && answers["self.mental"].type === "scale" && answers["self.mental"].value === "1" && answers["self.mental"].day === today;
  const showSupport = !supportHidden && (Boolean(extras && extras.support) || localLow);
  const streak = extras && Number(extras.streak) > 0 ? Number(extras.streak) : 0;

  const startCheckin = (list) => {
    const run = list || picks.slice();
    if (!list && extras && extras.attentionDue && consented) run.push(hoomanAttentionCard(today));
    if (!run.length) return;
    const snapshot = {};
    for (const cat of GH_CATEGORIES) snapshot[cat.key] = hoomanPillarScore(answers, cat);
    setBefore({ overall, pillars: snapshot });
    setCards(run);
    setScreen("checkin");
  };

  if (screen === "checkin" && cards.length) {
    return <HoomanCheckin
      cards={cards}
      answers={answers}
      today={today}
      catColor={catColor}
      onAnswer={onAnswer}
      onAttention={onAttention}
      onClose={() => setScreen("done")}
      onFinished={() => setScreen("done")}
    />;
  }

  if (screen === "items" && activePillar) {
    const cat = GH_CATEGORIES.find((c) => c.key === activePillar);
    if (cat) {
      return <HoomanPillar
        cat={cat}
        answers={answers}
        today={today}
        catColor={catColor}
        onBack={() => {
          setActivePillar(null);
          setScreen("categories");
        }}
        onAsk={(c, item) => startCheckin([{ kind: "face", cat: c, item }])}
      />;
    }
  }

  if (screen === "done") {
    const delta = before && before.overall !== null && overall !== null ? overall - before.overall : null;
    return <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "calc(26px + env(safe-area-inset-top, 0px)) 18px 26px", textAlign: "center" }}><span style={{ fontSize: 12, fontWeight: 800, color: T.accent, letterSpacing: 0.6, textTransform: "uppercase" }}>{picks.length ? "Saved for today" : "Today's check-in done"}</span><div className="gh-score-reveal"><HoomanScoreRing answers={answers} catColor={catColor} size={204} /></div>{delta !== null && delta !== 0 && <span style={{ fontSize: 13, fontWeight: 800, color: delta > 0 ? T.positive : T.inkSoft }}>{delta > 0 ? `+${delta}` : delta} today</span>}<div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>{GH_CATEGORIES.map((cat) => {
    const now = hoomanPillarScore(answers, cat);
    const was = before ? before.pillars[cat.key] : null;
    if (now === null) return null;
    const d = was === null || was === undefined ? null : now - was;
    const color = catColor(cat.key);
    return <span key={cat.key} style={{ padding: "7px 12px", borderRadius: 999, background: hexToRgba(color, 0.12), color, fontSize: 12, fontWeight: 800 }}>{cat.label} {d === null ? now : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "—"}</span>;
  })}</div>{streak > 0 && <span style={{ padding: "7px 14px", borderRadius: 999, background: hexToRgba(T.accent, 0.1), color: T.accent, fontSize: 12.5, fontWeight: 800 }}>{"\u{1F525}"} {streak} day{streak === 1 ? "" : "s"} in a row</span>}{showSupport && <div style={{ width: "100%", textAlign: "left" }}><HoomanSupportCard countryIso={countryIso} onDismiss={() => setSupportHidden(true)} /></div>}{signedIn && consented === false && <div style={{ width: "100%", textAlign: "left", borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ flex: 1 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>Keep it on your account</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 2 }}>So it's there on a new phone. Only you see it.</span></span><button
    onClick={onAskToSave}
    className="v2-tap"
    style={{ flexShrink: 0, border: `1.5px solid ${T.accent}`, background: T.surface, color: T.accent, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
  >Save</button></div>}<button
    onClick={() => setScreen("categories")}
    className="v2-tap"
    style={{ width: "100%", marginTop: "auto", border: "none", borderRadius: T.radiusMd, padding: "16px 0", background: T.accent, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: `0 10px 24px ${hexToRgba(T.accent, 0.3)}` }}
  >Done</button></div>;
  }

  // Home.
  return <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px" }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Hooman Score</span><button
    onClick={onOpenColors}
    aria-label="Change colours"
    className="v2-tap"
    style={{ marginLeft: "auto", width: 40, height: 40, borderRadius: "50%", border: "none", padding: 3, background: T.surface, boxShadow: T.shadowCard, cursor: "pointer" }}
  ><span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: `conic-gradient(${catColor("self")} 0 25%, ${catColor("community")} 0 50%, ${catColor("environment")} 0 75%, ${catColor("finance")} 0)` }} /></button></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}><div style={{ borderRadius: T.radiusXl, background: T.surface, boxShadow: T.shadowCard, padding: "24px 16px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}><HoomanScoreRing answers={answers} catColor={catColor} /><span style={{ fontSize: 12, fontWeight: 600, color: T.inkFaint }}>{overall === null ? "Your score appears after your first answer" : `From ${answeredCount} of ${totalCount} check-ins \xB7 last 30 days`}</span></div>{showSupport && <HoomanSupportCard countryIso={countryIso} onDismiss={() => setSupportHidden(true)} />}<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}><span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, background: hexToRgba(T.accent, 0.1), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{picks.length ? "☀️" : "✔️"}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{picks.length ? "Today's check-in" : "Done for today"}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 2 }}>{picks.length ? `${picks.length} question${picks.length === 1 ? "" : "s"} \xB7 about ${picks.length * 5} seconds` : "New questions tomorrow"}{streak > 0 ? ` \xB7 \u{1F525} ${streak} day${streak === 1 ? "" : "s"}` : ""}</span></span>{picks.length > 0 && <button
    onClick={() => startCheckin()}
    className="v2-tap"
    style={{ flexShrink: 0, border: "none", borderRadius: 12, padding: "10px 16px", background: T.accent, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  >Start</button>}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{GH_CATEGORIES.map((cat) => {
    const score = hoomanPillarScore(answers, cat);
    const color = catColor(cat.key);
    const Icon = cat.icon;
    const fresh = cat.items.filter((it) => answers[`${cat.key}.${it.key}`]).length;
    return <button
      key={cat.key}
      onClick={() => {
        setActivePillar(cat.key);
        setScreen("items");
      }}
      className="v2-tap"
      aria-label={`${cat.label}, ${score === null ? "not scored yet" : `${score} out of 100`}`}
      style={{ border: "none", textAlign: "left", borderRadius: 22, background: T.surface, boxShadow: T.shadowCard, padding: 14, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}
    ><span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ width: 36, height: 36, borderRadius: 12, background: hexToRgba(color, 0.14), display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={color} /></span><span style={{ fontSize: 26, fontWeight: 800, color: score === null ? T.inkFaint : color, fontFamily: T.fontDisplay }}>{score === null ? "—" : score}</span></span><span style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{cat.label}</span><span style={{ height: 6, borderRadius: 999, background: T.surfaceAlt, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${score || 0}%`, borderRadius: 999, background: color }} /></span><span style={{ fontSize: 11, fontWeight: 600, color: T.inkFaint }}>{fresh} of {cat.items.length}{cat.monthly ? " \xB7 monthly" : ""}</span></button>;
  })}</div><div data-testid="hooman-saving" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "2px 4px", textAlign: "center" }}>{signedIn && <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{consented ? "Saved to your account \xB7 only you can see it" : "Answers stay on this phone for now"}</span>}{signedIn && (consented ? <button
    onClick={onAskDelete}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 700, color: T.inkSoft, cursor: "pointer" }}
  >Delete my answers</button> : <button
    onClick={onAskToSave}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer" }}
  >Save to my account</button>)}<span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, lineHeight: 1.5 }}>It never changes your money or your Creator Share.</span></div></div></div>;
}
