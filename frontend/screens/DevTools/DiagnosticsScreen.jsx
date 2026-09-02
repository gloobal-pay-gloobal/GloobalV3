// src/screens/DevTools/DiagnosticsScreen.jsx
import { useState as useState18 } from "react";
import { ArrowLeft as ArrowLeft6, Activity as Activity2, Database, PlayCircle, History as History7, RefreshCw as RefreshCw5, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";


// src/screens/DevTools/DiagnosticsScreen.jsx
var STATUS_STYLE = {
  pass: { color: T.positive, bg: T.positiveSoft, icon: CheckCircle2, label: "Pass" },
  warn: { color: "#B45309", bg: "#FEF3C7", icon: AlertTriangle, label: "Warn" },
  fail: { color: T.negative, bg: T.negativeSoft, icon: XCircle, label: "Fail" }
};
function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.warn;
  const Icon = s.icon;
  return <span
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold"
    style={{ color: s.color, background: s.bg }}
    role="status"
  ><Icon size={13} aria-hidden="true" />{s.label}</span>;
}
function SectionCard({ icon: Icon, title, subtitle, children, actions }) {
  return <section
    className="rounded-2xl p-4 mb-3"
    style={{ background: T.surface, boxShadow: T.shadowCard, border: `1px solid ${T.line}` }}
    aria-label={title}
  ><div className="flex items-center justify-between mb-2.5"><div className="flex items-center gap-2">{Icon && <Icon size={16} style={{ color: T.accent }} aria-hidden="true" />}<h2 className="text-[14.5px] font-bold" style={{ color: T.ink }}>{title}</h2></div>{actions}</div>{subtitle && <p className="text-[12.5px] mb-2.5" style={{ color: T.inkSoft }}>{subtitle}</p>}{children}</section>;
}
function HealthSection({ health }) {
  return <SectionCard icon={Activity2} title="System health" subtitle={`Checked at ${formatClockTime(health.generatedAt)} \xB7 ${health.recordCount} ledger record(s)`} actions={<StatusPill status={health.overall} />}><ul className="flex flex-col gap-2">{health.checks.map((c) => <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl px-3 py-2" style={{ background: T.surfaceAlt }}><div className="min-w-0"><p className="text-[13px] font-semibold" style={{ color: T.ink }}>{c.label}</p><p className="text-[12px] leading-snug" style={{ color: T.inkSoft }}>{c.detail}</p></div><StatusPill status={c.status} /></li>)}</ul></SectionCard>;
}
function AccountsSection({ accounts, ledgerStats: ledgerStats2 }) {
  return <SectionCard icon={Database} title="Chart of accounts" subtitle={`${ledgerStats2.totalRecords} record(s) posted \xB7 kinds: ${ledgerStats2.byKind.map((k) => `${k.kind} (${k.count})`).join(", ") || "\u2014"}`}><div className="overflow-x-auto -mx-1" style={{ scrollbarWidth: "none" }}><table className="w-full text-left" style={{ borderCollapse: "collapse" }}><thead><tr>{["Account", "Type", "Balance", "Entries"].map((h) => <th key={h} className="text-[11px] uppercase tracking-wide font-semibold px-2 py-1.5" style={{ color: T.inkFaint }}>{h}</th>)}</tr></thead><tbody>{accounts.map((a) => <tr key={a.accountId} style={{ borderTop: `1px solid ${T.line}` }}><td className="px-2 py-2 text-[12.5px] font-mono" style={{ color: T.ink }}>{a.accountId}</td><td className="px-2 py-2 text-[12px]" style={{ color: T.inkSoft }}>{a.type}</td><td className="px-2 py-2 text-[12.5px] font-semibold" style={{ color: T.ink }}>{a.currency} {a.balance.toFixed(2)}</td><td className="px-2 py-2 text-[12px]" style={{ color: T.inkSoft }}>{a.historyCount}</td></tr>)}</tbody></table></div></SectionCard>;
}
function TimeTravelSection({ timeline }) {
  const [index, setIndex] = useState18(timeline.length - 1);
  const clampedIndex = Math.min(Math.max(index, 0), Math.max(timeline.length - 1, 0));
  const point = timeline[clampedIndex];
  if (timeline.length === 0) {
    return <SectionCard icon={History7} title="Time travel" subtitle="No ledger records yet."><p className="text-[12.5px]" style={{ color: T.inkFaint }}>
          Post a transaction to see the timeline.
        </p></SectionCard>;
  }
  return <SectionCard icon={History7} title="Time travel" subtitle={`Scrub through every posted record \u2014 showing #${point.sequence}: "${point.memo}"`}><input
    type="range"
    min={0}
    max={timeline.length - 1}
    value={clampedIndex}
    onChange={(e) => setIndex(Number(e.target.value))}
    className="w-full mb-3"
    aria-label={`Ledger sequence, ${clampedIndex + 1} of ${timeline.length}`}
  /><p className="text-[11.5px] mb-2" style={{ color: T.inkFaint }}>{new Date(point.postedAt).toLocaleString()}</p><div className="grid grid-cols-2 gap-2">{point.snapshot.map((row) => <div key={row.accountId} className="rounded-xl px-3 py-2" style={{ background: T.surfaceSunk }}><p className="text-[10.5px] font-mono truncate" style={{ color: T.inkFaint }}>{row.accountId}</p><p className="text-[13.5px] font-bold" style={{ color: T.ink }}>{row.currency} {row.balance.toFixed(2)}</p></div>)}</div></SectionCard>;
}
function ReplaySection() {
  const { result, running, run } = useReplayCheck();
  return <SectionCard
    icon={RefreshCw5}
    title="Replay verification"
    subtitle="Re-posts every ledger record into a fresh store and confirms the balances match — proves the ledger is deterministic."
    actions={result && <StatusPill status={result.ok ? "pass" : "fail"} />}
  ><button
    onClick={run}
    disabled={running}
    className="px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-all disabled:opacity-60"
    style={{ background: T.gradButton }}
  >{running ? "Replaying\u2026" : "Run replay check"}</button>{result && <p className="text-[12px] mt-2.5" style={{ color: T.inkSoft }}>{result.recordsReplayed}/{result.recordsTotal} records replayed cleanly · chain {result.chainValid ? "valid" : "invalid"} · provenance {result.provenanceChainValid ? "valid" : "invalid"} · disputes {result.disputeChainValid ? "valid" : "invalid"}{result.mismatches.length > 0 && ` \xB7 ${result.mismatches.length} balance mismatch(es)`}</p>}</SectionCard>;
}
function StressTestSection() {
  const { report, running, error, run } = useStressTest();
  return <SectionCard
    icon={PlayCircle}
    title="Financial simulator & stress test"
    subtitle="Runs transaction storms, duplicate-submission, offline-recovery, and flaky-network scenarios against a disposable sandbox core — never the live ledger above."
    actions={report && <StatusPill status={report.overall} />}
  ><button
    onClick={() => run({})}
    disabled={running}
    className="px-3.5 py-2 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-all disabled:opacity-60"
    style={{ background: T.gradButton }}
  >{running ? "Running\u2026" : "Run stress test"}</button>{error && <p className="text-[12px] mt-2.5" style={{ color: T.negative }}>{error}</p>}{report && <ul className="flex flex-col gap-2 mt-3">{report.scenarios.map((s) => <li key={s.scenario} className="rounded-xl px-3 py-2 flex items-center justify-between" style={{ background: T.surfaceAlt }}><div><p className="text-[13px] font-semibold" style={{ color: T.ink }}>{s.scenario}</p><p className="text-[11.5px]" style={{ color: T.inkSoft }}>{Object.entries(s).filter(([k]) => !["scenario", "health", "replay", "seed", "rejectionsByCode"].includes(k)).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" \xB7 ")}</p></div><StatusPill status={s.health.overall} /></li>)}</ul>}</SectionCard>;
}
function EventLogSection({ events }) {
  return <SectionCard icon={Activity2} title="Live event log" subtitle={`Most recent ${events.length} platform event(s), newest first.`}><ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "none" }}>{events.map((e) => <li key={e.seq} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: T.surfaceAlt }}><span className="text-[11.5px] font-mono truncate" style={{ color: T.ink }}>{e.eventName}</span><span className="text-[10.5px] flex-shrink-0" style={{ color: T.inkFaint }}>{formatClockTime(new Date(e.at))}</span></li>)}{events.length === 0 && <li className="text-[12px] px-2.5 py-2" style={{ color: T.inkFaint }}>
            No events yet.
          </li>}</ul></SectionCard>;
}

