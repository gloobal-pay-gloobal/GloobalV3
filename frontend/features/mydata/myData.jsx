// src/features/mydata/myData.jsx
//
// MY DATA: everything a person has put into GLOOBAL, where each piece went,
// who can still reach it — and one tap to take it back.
//
// The idea (the founder's): the internet is made of individual people's
// data, and nobody can see their own part of it. On GLOOBAL each thing is
// stored once and every share points at it (a Helloo forward opens the
// original's one copy), so GLOOBAL can say how far each thing went, and
// "Take back" closes every pointer at once. What it cannot reach, it says:
// copies made by hand, and records the law makes GLOOBAL keep.
// The server is server/lib/mydata.js. Opened from Profile → My data.
import { useState as useStateMd, useEffect as useEffectMd, useCallback as useCallbackMd } from "react";
import {
  Image as MdPhoto, Video as MdVideo, Mic as MdVoice, FileText as MdDoc, ShoppingBag as MdShop, Megaphone as MdAd,
  MessageCircle as MdChat, Users as MdPeople, Eye as MdSeen, Globe2 as MdWorld, Undo2 as MdTakeBack, Download as MdDownload,
  Lock as MdLock, Ban as MdNoForward, ShieldCheck as MdKept, ChevronRight as MdNext, HardDrive as MdStore, Repeat2 as MdForward, RotateCcw as MdBringBack, Heart as MdLike
} from "lucide-react";

var myDataApi = {
  all: () => gloobalApiClient.get("/api/mydata"),
  exportAll: () => gloobalApiClient.get("/api/mydata/export"),
  takeBack: (type, id) => gloobalApiClient.post("/api/mydata/takeback", { type, id }),
  bringBack: (type, id) => gloobalApiClient.post("/api/mydata/bringback", { type, id }),
  takeBackAll: () => gloobalApiClient.post("/api/mydata/takeback-all", { confirm: "TAKE BACK" }),
  noForward: (id, on) => gloobalApiClient.post(`/api/helloo/messages/${encodeURIComponent(id)}/noforward`, { on }),
};
var myDataSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n || 0} B`);
var myDataDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

var MY_DATA_KINDS = {
  video: { Icon: MdVideo, tint: "#7C3AED", label: "Video" },
  photo: { Icon: MdPhoto, tint: "#0EA5E9", label: "Photo" },
  voice: { Icon: MdVoice, tint: "#F59E0B", label: "Voice note" },
  doc: { Icon: MdDoc, tint: "#64748B", label: "Document" },
  shop: { Icon: MdShop, tint: "#10B981", label: "Shop item" },
  ad: { Icon: MdAd, tint: "#EF4444", label: "Ad" },
};

function MyDataThumb({ kind, size = 46 }) {
  const k = MY_DATA_KINDS[kind] || MY_DATA_KINDS.doc;
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 14, background: `${k.tint}1f`, color: k.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><k.Icon size={Math.round(size * 0.46)} /></span>;
}
function MyDataStat({ n, label, Icon }) {
  return <div style={{ minWidth: 0, textAlign: "center" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 19, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink }}><Icon size={15} color={T.inkFaint} />{n}</div><div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, marginTop: 2 }}>{label}</div></div>;
}
var myDataCard = { background: T.surface, borderRadius: 18, boxShadow: T.shadowCard || "0 1px 2px rgba(0,0,0,0.06)", overflow: "hidden" };
var myDataReach = (it) => {
  const r = it.reach || {};
  if (it.type === "post") return [`Public · ${r.followers || 0} follower${r.followers === 1 ? "" : "s"}`, `${r.likes || 0} like${r.likes === 1 ? "" : "s"}`].join(" · ");
  if (it.type === "used" || it.type === "ad") return `Public · ${(r.seen || 0).toLocaleString("en-IN")} view${r.seen === 1 ? "" : "s"}`;
  return [`${r.chats} chat${r.chats > 1 ? "s" : ""}`, r.forwards ? `${r.forwards} forward${r.forwards > 1 ? "s" : ""}` : "", `opened ${r.seen || 0}×`].filter(Boolean).join(" · ");
};

function MyDataScreen({ onClose }) {
  const [data, setData] = useStateMd(null);
  const [err, setErr] = useStateMd("");
  const [at, setAt] = useStateMd("home");
  const [itemId, setItemId] = useStateMd("");
  const [all, setAll] = useStateMd(false);
  const [confirm, setConfirm] = useStateMd(null); // "all" | { item }
  const [busy, setBusy] = useStateMd("");
  const [gone, setGone] = useStateMd(0);
  const [note, setNote] = useStateMd("");
  const load = useCallbackMd(async () => {
    try { const r = await myDataApi.all(); setData(r); setErr(""); } catch (e) { setErr((e && e.message) || "Couldn't load your data."); }
  }, []);
  useEffectMd(() => { load(); }, [load]);
  useEffectMd(() => { if (!note) return undefined; const t = setTimeout(() => setNote(""), 2600); return () => clearTimeout(t); }, [note]);
  const items = (data && data.items) || [];
  const it = items.find((x) => x.type + x.id === itemId) || null;
  const totals = (data && data.totals) || { things: 0, bytes: 0, people: 0, public: 0, live: 0 };
  const live = items.filter((x) => !x.takenBack && !x.ended);

  const takeAll = async () => {
    setBusy("all");
    try { const r = await myDataApi.takeBackAll(); setGone(r.takenBack || 0); setConfirm(null); await load(); } catch (e) { setNote((e && e.message) || "Couldn't take everything back."); }
    setBusy("");
  };
  const takeOne = async (x) => {
    setBusy("one");
    try { await myDataApi.takeBack(x.type, x.id); setConfirm(null); setNote("Taken back"); await load(); } catch (e) { setNote((e && e.message) || "Couldn't take that back."); }
    setBusy("");
  };
  const bringOne = async (x) => {
    setBusy("bring");
    try { await myDataApi.bringBack(x.type, x.id); setNote("Brought back"); await load(); } catch (e) { setNote((e && e.message) || "Couldn't bring that back."); }
    setBusy("");
  };
  const toggleForward = async (x) => {
    setBusy("fwd");
    try { await myDataApi.noForward(x.id, !x.noForward); await load(); } catch (e) { setNote((e && e.message) || "Couldn't change that."); }
    setBusy("");
  };
  const download = async () => {
    setBusy("dl");
    try {
      const r = await myDataApi.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "gloobal-my-data.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { setNote((e && e.message) || "Couldn't prepare your data."); }
    setBusy("");
  };
  const section = (t) => <div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase", margin: "18px 4px 8px" }}>{t}</div>;
  const shown = all ? items : items.slice(0, 6);

  const home = <>
    <UsedTop onBack={onClose} title="My data" subtitle="Everything you've put into GLOOBAL, right now" />
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 28px" }}>
      {!data && !err ? <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 13, marginTop: 40 }}>Opening your data…</div> : null}
      {err ? <div style={{ ...myDataCard, padding: 16, fontSize: 13.5, color: T.inkSoft, textAlign: "center" }}>{err}<div style={{ marginTop: 10 }}><UsedChip onClick={load}>Try again</UsedChip></div></div> : null}
      {data ? <>
        {gone ? <div data-testid="mydata-gone" style={{ ...myDataCard, padding: "16px", marginBottom: 12, border: `1.5px solid ${T.positive || "#16A34A"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 36, height: 36, borderRadius: "50%", background: `${T.positive || "#16A34A"}1f`, color: T.positive || "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><MdTakeBack size={18} /></span><div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Everything is back with you</div></div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, marginTop: 8 }}>{gone} thing{gone === 1 ? "" : "s"} taken back. Nobody else can open them now — not in chats, posts, forwards, ads or links.</div>
        </div> : null}
        <div style={{ ...myDataCard, padding: "14px 10px", marginBottom: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", rowGap: 14 }}>
            <MyDataStat n={totals.things} label="things you put in" Icon={MdStore} />
            <MyDataStat n={myDataSize(totals.bytes)} label="stored once" Icon={MdLock} />
            <MyDataStat n={totals.people} label="people can reach them" Icon={MdPeople} />
            <MyDataStat n={totals.public} label="public right now" Icon={MdWorld} />
          </div>
        </div>
        {section("Your things")}
        {items.length ? <div style={myDataCard}>{shown.map((x, i) => <button key={x.type + x.id} data-testid="mydata-item" onClick={() => { setItemId(x.type + x.id); setAt("item"); }} className="v2-tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "none", textAlign: "left", cursor: "pointer", fontFamily: T.fontBody }}>
          <MyDataThumb kind={x.kind} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.title}</span>
            <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>{x.where}</span>
            <span style={{ display: "block", fontSize: 11.5, color: x.takenBack || x.ended ? T.inkFaint : T.accent, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>{x.takenBack ? "Taken back · only you" : x.ended ? "Ended" : myDataReach(x)}</span>
          </span>
          <MdNext size={16} color={T.inkFaint} style={{ flexShrink: 0 }} />
        </button>)}{items.length > 6 ? <button onClick={() => setAll(!all)} className="v2-tap" style={{ width: "100%", padding: "11px 14px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer", fontFamily: T.fontBody }}>{all ? "Show fewer" : `See all ${items.length}`}</button> : null}</div>
          : <div style={{ ...myDataCard, padding: 18, fontSize: 13, color: T.inkSoft, textAlign: "center", lineHeight: 1.5 }}>Nothing yet. Photos, clips and voice notes you send on Helloo, your posts, Used listings and ads will show here.</div>}
        {section("What GLOOBAL keeps about you")}
        <div style={myDataCard}>{(data.kept || []).map((k, i) => <div key={k.what} style={{ display: "flex", gap: 11, padding: "11px 14px", borderTop: i ? `1px solid ${T.line}` : "none" }}><MdKept size={17} color={T.inkFaint} style={{ flexShrink: 0, marginTop: 1 }} /><div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{k.what}{k.value ? <span style={{ fontWeight: 700, color: T.inkSoft }}> · {k.value}</span> : null}</div><div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, marginTop: 1 }}>{k.why}</div></div></div>)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
          <UsedButton kind="secondary" Icon={MdDownload} disabled={busy === "dl"} onClick={download}>{busy === "dl" ? "Preparing…" : "Download the list of my data"}</UsedButton>
          {live.length ? <UsedButton testid="mydata-take-all" Icon={MdTakeBack} color={T.negative || "#DC2626"} onClick={() => setConfirm("all")}>Take everything back</UsedButton> : null}
        </div>
        <div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.5, textAlign: "center", margin: "12px 8px 0" }}>GLOOBAL stores each thing once. A forward opens the same copy, so taking something back closes it everywhere on GLOOBAL — except a copy someone made by hand, like a screenshot.</div>
      </> : null}
    </div>
  </>;

  const r = (it && it.reach) || {};
  const rows = !it ? [] : it.type === "helloo"
    ? [["You sent it to", r.direct && r.direct.length ? r.direct.join(", ") : "—", MdChat], ["They passed it on", r.forwards ? `${r.forwards} time${r.forwards > 1 ? "s" : ""}, into ${r.chats - 1} more chat${r.chats - 1 === 1 ? "" : "s"}` : "Not passed on", MdForward], ["Opened", `${r.seen || 0} time${r.seen === 1 ? "" : "s"}`, MdSeen]]
    : it.type === "post"
    ? [["Who can see it", `Anyone on GLOOBAL · ${r.followers || 0} follower${r.followers === 1 ? "" : "s"} see it first`, MdWorld], ["Liked", `${r.likes || 0} time${r.likes === 1 ? "" : "s"}`, MdLike], ["Comments", String(r.comments || 0), MdChat]]
    : [["Who can see it", "Anyone on GLOOBAL", MdWorld], ["Viewed", `${(r.seen || 0).toLocaleString("en-IN")} time${r.seen === 1 ? "" : "s"}`, MdSeen]];
  const detail = it ? <>
    <UsedTop onBack={() => setAt("home")} title={(MY_DATA_KINDS[it.kind] || MY_DATA_KINDS.doc).label} subtitle={it.where} />
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 28px" }}>
      <div style={{ ...myDataCard, padding: 14, display: "flex", gap: 12, alignItems: "center", marginBottom: 4 }}>
        <MyDataThumb kind={it.kind} size={62} />
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 800, color: T.ink, wordBreak: "break-word" }}>{it.title}</div><div style={{ fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{myDataDate(it.at)} · {myDataSize(it.bytes)} · stored once</div></div>
      </div>
      {it.takenBack ? <div data-testid="mydata-item-taken" style={{ ...myDataCard, padding: "12px 14px", marginTop: 12, fontSize: 13, color: T.inkSoft, lineHeight: 1.5 }}><b style={{ color: T.ink }}>Taken back.</b> {it.type === "helloo" ? "Deleted for good: it and every forward of it open for nobody." : "Only you can see it now."}</div> : null}
      {section("How far it went")}
      <div style={{ ...myDataCard, padding: "14px 16px" }}>
        {rows.map(([k, v, Icon], i) => <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0, borderTop: i ? `1px solid ${T.line}` : "none" }}>
          <Icon size={17} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft }}>{k}</div><div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginTop: 2, lineHeight: 1.4, wordBreak: "break-word" }}>{v}</div></div>
        </div>)}
        {it.type === "helloo" ? <div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.45, marginTop: 12 }}>Who your friends sent it to is their business, so after the first step you see counts, not names.</div> : null}
      </div>
      {!it.takenBack && !it.ended ? <>
        {it.type === "helloo" && it.kind !== "voice" && it.canStopForward ? <>{section("Your control")}<div style={{ ...myDataCard, padding: "12px 16px" }}>
          <button data-testid="mydata-noforward" onClick={() => toggleForward(it)} disabled={busy === "fwd"} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: T.fontBody, textAlign: "left" }}><MdNoForward size={17} color={T.inkSoft} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>Stop passing it on</span><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>People who have it can't forward it any further.</span></span><span style={{ width: 42, height: 24, borderRadius: 12, background: it.noForward ? T.accent : T.line, position: "relative", flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: it.noForward ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff" }} /></span></button>
        </div></> : null}
        <div style={{ display: "flex", marginTop: 16 }}><UsedButton testid="mydata-take-one" Icon={MdTakeBack} color={T.negative || "#DC2626"} onClick={() => setConfirm({ item: it })}>Take this back</UsedButton></div>
      </> : it.canBringBack ? <div style={{ display: "flex", marginTop: 16 }}><UsedButton testid="mydata-bring-back" Icon={MdBringBack} disabled={busy === "bring"} onClick={() => bringOne(it)}>Bring it back</UsedButton></div> : null}
    </div>
  </> : null;

  const one = confirm && confirm.item;
  return gloobalMapPortal(<div data-testid="my-data" style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, overflow: "hidden" }}>
    {at === "item" && detail ? detail : home}
    {confirm === "all" ? <UsedSheet title="Take everything back?" onClose={() => setConfirm(null)}><div data-testid="mydata-confirm">
      <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, marginBottom: 12 }}>All {live.length} thing{live.length === 1 ? "" : "s"} come back to you. Right away:</div>
      {[["Every chat, post, forward and ad stops showing them", MdChat], [`${totals.people} ${totals.people === 1 ? "person" : "people"} in your chats can no longer open them`, MdPeople], ["Public posts and listings go private", MdWorld]].map(([t, Icon]) => <div key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: T.ink, fontWeight: 700, marginBottom: 9 }}><Icon size={16} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} />{t}</div>)}
      <div style={{ background: T.surfaceSunk, borderRadius: 14, padding: "10px 12px", margin: "6px 0 12px", fontSize: 12, color: T.inkSoft, lineHeight: 1.5 }}><b style={{ color: T.ink }}>Gone for good:</b> chat photos, clips and voice notes. <b style={{ color: T.ink }}>You can bring back:</b> posts and Used listings. <b style={{ color: T.ink }}>Ads</b> end. <b style={{ color: T.ink }}>Not reachable:</b> copies made by hand (a screenshot or a download). <b style={{ color: T.ink }}>Still kept:</b> payment records and your identity check, as the law requires.</div>
      <div style={{ display: "flex", gap: 10 }}><UsedButton kind="secondary" onClick={() => setConfirm(null)}>Not now</UsedButton><UsedButton testid="mydata-take-all-go" disabled={busy === "all"} color={T.negative || "#DC2626"} onClick={takeAll}>{busy === "all" ? "Taking back…" : "Take it all back"}</UsedButton></div>
    </div></UsedSheet> : null}
    {one ? <UsedSheet title="Take this back?" onClose={() => setConfirm(null)}><div data-testid="mydata-confirm-one">
      <div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, marginBottom: 14 }}>{one.type === "helloo" ? `It is deleted for good. ${one.reach.forwards ? `It and its ${one.reach.forwards} forward${one.reach.forwards > 1 ? "s" : ""} stop opening` : "It stops opening"} for everyone.` : one.type === "ad" ? "The ad ends now. It can't be restarted." : "Nobody but you can see it. You can bring it back later."}</div>
      <div style={{ display: "flex", gap: 10 }}><UsedButton kind="secondary" onClick={() => setConfirm(null)}>Not now</UsedButton><UsedButton testid="mydata-take-one-go" disabled={busy === "one"} color={T.negative || "#DC2626"} onClick={() => takeOne(one)}>{busy === "one" ? "Taking back…" : "Take it back"}</UsedButton></div>
    </div></UsedSheet> : null}
    {note ? <div role="status" style={{ position: "absolute", left: 16, right: 16, bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", justifyContent: "center", pointerEvents: "none" }}><span style={{ maxWidth: "100%", padding: "10px 16px", borderRadius: 999, background: T.ink, color: T.bg, fontSize: 13, fontWeight: 700 }}>{note}</span></div> : null}
  </div>, document.body);
}
