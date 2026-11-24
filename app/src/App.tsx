import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { firebaseConfigured } from "./lib/firebase";
import { applyRewrite, completenessCheck, deepAudit, draftBrief, privacyScan, type RunResult } from "./lib/ai";
import { detectIdentifiers, redactText } from "./lib/router";
import { listBriefs, saveBrief, type SavedBrief } from "./lib/briefs";

interface LogEntry {
  at: string;
  task: string;
  reason: string;
  badge: string;
  latencyMs?: number;
  error?: string;
}

interface AuditFlag {
  clause: string;
  problem: string;
  rewrite: string;
  severity: string;
}

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "Sample: logo job (vague)",
    text: "Need a logo for my food truck, something modern. Pay $150 when done. Want it soon, a couple of revisions ok. Contact me at bigmike.eats@gmail.com or $BigMikeEats on Cash App.",
  },
  {
    label: "Sample: research report",
    text: "Research the top 10 competitors for our dog-grooming app and write a report. Deadline Friday. Budget $300, half up front. Report should be thorough and good quality.",
  },
  {
    label: "Sample: strong brief",
    text: "Deliverable: 2,000-word article (Google Doc) on Florida LLC filing steps. Deadline: Dec 5, 2026, 5 PM CT. Budget: $200 via escrow, released on acceptance. Acceptance: covers all 6 listed steps, sources cited, originality report attached. Revisions: 2 rounds included. Evidence: doc link + originality report.",
  },
];

function sourceBadge(result: RunResult): string {
  const s = result.inferenceSource.toLowerCase();
  if (s.includes("device")) return "On-device";
  if (s.includes("cloud")) return "Cloud";
  return result.inferenceSource;
}

export default function App() {
  const [notes, setNotes] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [completeness, setCompleteness] = useState<{ present: string[]; missing: string[]; summary: string } | null>(null);
  const [privacy, setPrivacy] = useState<{ findings: { kind: string; excerpt: string; why: string }[]; safeToSendToCloud: boolean; summary: string } | null>(null);
  const [audit, setAudit] = useState<{ score: number; flags: AuditFlag[]; verdict: string } | null>(null);
  const [auditSentText, setAuditSentText] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedBrief[]>([]);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<RunResult>, onOk: (r: RunResult) => void) => {
      setBusy(label);
      setError(null);
      try {
        const r = await fn();
        pushLog({
          at: new Date().toLocaleTimeString(),
          task: label,
          reason: r.decision.reason,
          badge: sourceBadge(r),
          latencyMs: r.latencyMs,
        });
        onOk(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        const d = (e as { decision?: RunResult["decision"] }).decision;
        if (d) {
          pushLog({
            at: new Date().toLocaleTimeString(),
            task: label,
            reason: d.reason,
            badge: "Failed",
            error: msg,
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [pushLog],
  );

  const localIdentifiers = detectIdentifiers(notes + "\n" + brief);
  const workingText = brief || notes;

  return (
    <div className="page">
      <header>
        <h1>ClearBrief</h1>
        <p className="tagline">
          Job briefs a judge panel could actually rule on — drafted privately on your device, audited deeply in the
          cloud, with a router that shows its work.
        </p>
        <div className="status-row">
          <span className={`pill ${online ? "ok" : "warn"}`}>{online ? "Online" : "Offline — on-device still works"}</span>
          <span className={`pill ${firebaseConfigured ? "ok" : "warn"}`}>
            {firebaseConfigured ? "Firebase connected" : "Firebase not configured — add .env.local (see README)"}
          </span>
          <span className="pill">Chrome desktop 139+ enables Gemini Nano on-device</span>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>1 · Rough notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={7}
            placeholder="Paste the messy version: what you need, roughly what you'll pay, when you want it…"
          />
          <div className="row">
            {SAMPLES.map((s) => (
              <button key={s.label} className="ghost" onClick={() => setNotes(s.text)}>
                {s.label}
              </button>
            ))}
          </div>
          {localIdentifiers.length > 0 && (
            <p className="warn-text">
              Local check (no AI, no network): {localIdentifiers.length} identifier
              {localIdentifiers.length > 1 ? "s" : ""} spotted — {[...new Set(localIdentifiers.map((i) => i.kind))].join(", ")}. The
              cloud audit will only receive a redacted copy.
            </p>
          )}
          <div className="row">
            <button
              disabled={!notes || busy !== null}
              onClick={() =>
                run("Draft brief", () => draftBrief(notes), (r) => {
                  // The cloud fallback model does not always honour the
                  // response schema's field names — extract defensively.
                  const j = (r.json ?? {}) as Record<string, unknown>;
                  const direct = [j.briefText, j.brief, j.text, j.content].find(
                    (v): v is string => typeof v === "string" && v.length > 0,
                  );
                  if (direct) {
                    setBrief(direct);
                  } else if (r.json) {
                    const lines = Object.entries(j)
                      .filter(([, v]) => v !== "" && !(Array.isArray(v) && v.length === 0))
                      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`);
                    setBrief(lines.join("\n"));
                  } else {
                    setBrief(r.text);
                  }
                })
              }
            >
              {busy === "Draft brief" ? "Drafting…" : "Draft brief (on-device first)"}
            </button>
            <button
              disabled={!workingText || busy !== null}
              className="ghost"
              onClick={() =>
                run("Completeness", () => completenessCheck(workingText), (r) => {
                  if (r.json) setCompleteness(r.json as { present: string[]; missing: string[]; summary: string });
                })
              }
            >
              Completeness check
            </button>
            <button
              disabled={!workingText || busy !== null}
              className="ghost"
              onClick={() =>
                run("Privacy scan", () => privacyScan(workingText), (r) => {
                  if (r.json)
                    setPrivacy(
                      r.json as {
                        findings: { kind: string; excerpt: string; why: string }[];
                        safeToSendToCloud: boolean;
                        summary: string;
                      },
                    );
                })
              }
            >
              Privacy scan (on-device only)
            </button>
          </div>
        </section>

        <section className="card">
          <h2>2 · The brief</h2>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={9} placeholder="Your drafted brief appears here — edit it freely." />
          {completeness && (
            <div className="result">
              <h3>Completeness</h3>
              <p>{completeness.summary}</p>
              {completeness.present.length > 0 && <p>Present: {completeness.present.join(" · ")}</p>}
              {completeness.missing.length > 0 && <p className="warn-text">Missing: {completeness.missing.join(" · ")}</p>}
            </div>
          )}
          {privacy && (
            <div className="result">
              <h3>Privacy scan — ran on-device only</h3>
              <p>{privacy.summary}</p>
              {privacy.findings.map((f, i) => (
                <p key={i}>
                  <strong>{f.kind}:</strong> “{f.excerpt}” — {f.why}
                </p>
              ))}
              <p>{privacy.safeToSendToCloud ? "Safe to send to the cloud as-is." : "Redaction recommended before any cloud pass."}</p>
            </div>
          )}
          <div className="row">
            <button
              disabled={!brief || busy !== null}
              onClick={() =>
                run("Deep audit", () => deepAudit(brief), (r) => {
                  if (r.json) setAudit(r.json as { score: number; flags: AuditFlag[]; verdict: string });
                  setAuditSentText(r.sentText);
                  if ((r as { queued?: boolean }).queued) {
                    pushLog({
                      at: new Date().toLocaleTimeString(),
                      task: "Deep audit queued",
                      reason:
                        "Offline: the full cloud audit will be available when you reconnect. The local pass is what runs offline.",
                      badge: "Queued",
                    });
                  }
                })
              }
            >
              {busy === "Deep audit" ? "Auditing…" : "Deep dispute-readiness audit (cloud, redacted)"}
            </button>
            <button
              disabled={!brief || busy !== null}
              className="ghost"
              onClick={async () => {
                try {
                  await saveBrief(brief, audit?.score ?? null);
                  setSaved(await listBriefs());
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Save brief to my library
            </button>
            <button
              className="ghost"
              onClick={async () => {
                try {
                  setSaved(await listBriefs());
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Load my library
            </button>
          </div>
          {audit && (
            <div className="result">
              <h3>Dispute-readiness: {audit.score}/100</h3>
              <p>{audit.verdict}</p>
              {audit.flags.map((f, i) => (
                <div key={i} className="flag">
                  <p>
                    <span className={`sev sev-${f.severity}`}>{f.severity}</span> “{f.clause}”
                  </p>
                  <p>{f.problem}</p>
                  <p>
                    <em>Suggested rewrite:</em> {f.rewrite}
                  </p>
                  <button
                    className="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      run("Apply rewrite", () => applyRewrite(brief, f.clause, f.rewrite), (r) => setBrief(r.text))
                    }
                  >
                    Apply this rewrite
                  </button>
                </div>
              ))}
              {auditSentText !== null && (
                <details>
                  <summary>Exactly what was sent to the cloud</summary>
                  <pre>{auditSentText}</pre>
                  {Object.keys(redactText(brief, detectIdentifiers(brief)).map).length > 0 && (
                    <p>Placeholders replaced real identifiers, which never left this device.</p>
                  )}
                </details>
              )}
            </div>
          )}
          {saved.length > 0 && (
            <div className="result">
              <h3>My brief library (Firestore)</h3>
              {saved.map((b) => (
                <p key={b.id}>
                  <button className="ghost" onClick={() => setBrief(b.briefText)}>
                    Open
                  </button>{" "}
                  {b.createdAt} {b.auditScore !== null ? `· score ${b.auditScore}` : ""} — {b.briefText.slice(0, 80)}…
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="card log">
          <h2>Routing log</h2>
          <p className="hint">
            Every AI call passes the router first: sensitivity → complexity → connectivity → availability. The badge
            is the SDK's own report of where the model actually ran.
          </p>
          {log.length === 0 && <p className="hint">No calls yet. Draft a brief to see the router work.</p>}
          {log.map((e, i) => (
            <div key={i} className="log-entry">
              <span className="badge">{e.badge}</span>
              <div>
                <strong>{e.task}</strong>{" "}
                <span className="hint">
                  {e.at}
                  {e.latencyMs ? ` · ${e.latencyMs} ms` : ""}
                </span>
                <p>{e.reason}</p>
                {e.error && <p className="log-error">Failed: {e.error}</p>}
              </div>
            </div>
          ))}
        </section>
      </main>

      {error && <div className="error">{error}</div>}
      <footer>
        <p>
          Built with Firebase AI Logic hybrid inference — Gemini Nano on-device in Chrome, Gemini in the cloud, one
          SDK. Built for #BuildHybridAI 2026. Briefs connect to the Lamplight Pay idea: escrow only works when the job
          post is clear enough to rule on.
        </p>
      </footer>
    </div>
  );
}
