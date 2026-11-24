import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { firebaseConfigured } from "./lib/firebase";
import {
  applyRewrite,
  completenessCheck,
  deepAudit,
  deviceModelStatus,
  draftBrief,
  initDeviceModel,
  privacyScan,
  type CloudGate,
  type CloudGateInfo,
  type DeviceModelStatus,
  type RunResult,
} from "./lib/ai";
import { detectIdentifiers, redactText, route } from "./lib/router";
import { listBriefs, saveBrief, type SavedBrief } from "./lib/briefs";

interface LogEntry {
  at: string;
  task: string;
  reason: string;
  badge: string;
  latencyMs?: number;
  error?: string;
  /** The exact payload sent to the model (post-redaction for cloud calls). */
  payload?: string;
  identifiers?: number;
}

interface QueuedAudit {
  briefText: string;
  queuedAt: string;
}

const QUEUE_KEY = "clearbrief-queued-audit";

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
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set());
  const [climbNote, setClimbNote] = useState<string | null>(null);
  const [privacyGuidance, setPrivacyGuidance] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hideHow, setHideHow] = useState(() => {
    try {
      return localStorage.getItem("clearbrief-hide-how") === "1";
    } catch {
      return false;
    }
  });
  const [saved, setSaved] = useState<SavedBrief[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [nanoStatus, setNanoStatus] = useState<DeviceModelStatus>("unknown");
  const [gate, setGate] = useState<{ info: CloudGateInfo; resolve: (ok: boolean) => void } | null>(null);
  const [queuedAudit, setQueuedAudit] = useState<QueuedAudit | null>(() => {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueuedAudit) : null;
    } catch {
      return null;
    }
  });
  const flushingRef = useRef(false);

  // The human gate: AI calls that may reach the cloud pause here. The user
  // sees the exact redacted payload and confirms before anything is sent.
  const cloudGate: CloudGate = useCallback(
    (info) =>
      new Promise<boolean>((resolve) => {
        setGate({ info, resolve });
      }),
    [],
  );

  const pushLog = useCallback((entry: LogEntry) => {
    setLog((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  useEffect(() => {
    deviceModelStatus().then(setNanoStatus).catch(() => setNanoStatus("unknown"));
  }, []);

  const flushQueuedAudit = useCallback(async () => {
    if (flushingRef.current) return;
    let item: QueuedAudit | null = null;
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      item = raw ? (JSON.parse(raw) as QueuedAudit) : null;
    } catch {
      item = null;
    }
    if (!item || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      // The user confirmed this exact redacted payload at queue time.
      const r = await deepAudit(item.briefText, { preConfirmed: true });
      localStorage.removeItem(QUEUE_KEY);
      setQueuedAudit(null);
      if (r.json) setAudit(r.json as { score: number; flags: AuditFlag[]; verdict: string });
      setAuditSentText(r.sentText);
      pushLog({
        at: new Date().toLocaleTimeString(),
        task: "Deep audit (queued offline)",
        reason: "Connectivity restored — the queued cloud audit ran automatically on reconnect.",
        badge: sourceBadge(r),
        latencyMs: r.latencyMs,
        payload: r.sentText,
        identifiers: r.decision.identifiers.length,
      });
    } catch (e) {
      pushLog({
        at: new Date().toLocaleTimeString(),
        task: "Deep audit (queued offline)",
        reason: "Reconnect flush failed; the audit stays queued for the next reconnect.",
        badge: "Failed",
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      flushingRef.current = false;
    }
  }, [pushLog]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void flushQueuedAudit();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Also flush on load if we came back online with a queue pending.
    void flushQueuedAudit();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flushQueuedAudit]);

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
          payload: r.sentText,
          identifiers: r.decision.identifiers.length,
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

  // Score-climb loop: apply every remaining high-severity rewrite, then
  // automatically re-check completeness so the improvement is visible.
  // One gate confirmation covers the batch (payloads are successive
  // redactions of the same brief).
  const applyAllHigh = async () => {
    if (!audit) return;
    const highs = audit.flags
      .map((f, i) => ({ f, i }))
      .filter(({ f, i }) => f.severity.toLowerCase() === "high" && !appliedIdx.has(i));
    if (highs.length === 0) return;
    const status = await deviceModelStatus();
    if (status !== "available") {
      const d = route("rewrite", brief);
      const { redacted } = redactText(brief, d.identifiers);
      const ok = await cloudGate({
        task: `rewrite batch (${highs.length} high-severity rewrites)`,
        redactedText: redacted,
        identifiers: d.identifiers,
      });
      if (!ok) {
        pushLog({
          at: new Date().toLocaleTimeString(),
          task: "Apply rewrites",
          reason: d.reason,
          badge: "Failed",
          error: "Cloud send cancelled — you declined the rewrite batch. Nothing was transmitted.",
        });
        return;
      }
    }
    let current = brief;
    setBusy("Applying rewrites");
    setError(null);
    try {
      for (const { f, i } of highs) {
        const r = await applyRewrite(current, f.clause, f.rewrite, cloudGate, true);
        pushLog({
          at: new Date().toLocaleTimeString(),
          task: "Apply rewrite",
          reason: r.decision.reason,
          badge: sourceBadge(r),
          latencyMs: r.latencyMs,
          payload: r.sentText,
          identifiers: r.decision.identifiers.length,
        });
        current = r.text;
        setBrief(current);
        setAppliedIdx((prev) => new Set(prev).add(i));
      }
      const c = await completenessCheck(current, cloudGate);
      pushLog({
        at: new Date().toLocaleTimeString(),
        task: "Completeness",
        reason: c.decision.reason,
        badge: sourceBadge(c),
        latencyMs: c.latencyMs,
        payload: c.sentText,
        identifiers: c.decision.identifiers.length,
      });
      if (c.json) setCompleteness(c.json as { present: string[]; missing: string[]; summary: string });
      setClimbNote(
        "High-severity rewrites applied and completeness re-checked above. Run the deep audit again to see your new dispute-readiness score.",
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      const d = (e as { decision?: RunResult["decision"] }).decision;
      if (d) {
        pushLog({
          at: new Date().toLocaleTimeString(),
          task: "Apply rewrite",
          reason: d.reason,
          badge: "Failed",
          error: msg,
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const exportBrief = (kind: "md" | "copy") => {
    const lines = [
      "# Job brief (via LamplightBrief)",
      "",
      brief,
      ...(audit
        ? [
            "",
            `Dispute-readiness score: ${audit.score}/100`,
            audit.verdict,
            "",
            "## Audit flags",
            ...audit.flags.map(
              (f) => `- [${f.severity}] "${f.clause}" — ${f.problem} Rewrite: ${f.rewrite}`,
            ),
          ]
        : []),
    ];
    const text = lines.join("\n");
    if (kind === "copy") {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => setError("Copy failed — select the brief text and copy it manually."));
      return;
    }
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lamplightbrief-brief.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header>
        <h1>LamplightBrief</h1>
        <p className="tagline">
          Job briefs a judge panel could actually rule on — drafted privately on your device, audited deeply in the
          cloud, with a router that shows its work.
        </p>
        <div className="status-row">
          <span className={`pill ${online ? "ok" : "warn"}`}>{online ? "Online" : "Offline — on-device still works"}</span>
          <span className={`pill ${firebaseConfigured ? "ok" : "warn"}`}>
            {firebaseConfigured ? "Firebase connected" : "Firebase not configured — add .env.local (see README)"}
          </span>
          <span className={`pill ${nanoStatus === "available" ? "ok" : "warn"}`}>
            Gemini Nano: {nanoStatus === "unknown" ? "checking…" : nanoStatus}
          </span>
          <button
            className="ghost"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("Initialize on-device model");
              setError(null);
              try {
                const msg = await initDeviceModel(setNanoStatus);
                pushLog({
                  at: new Date().toLocaleTimeString(),
                  task: "Initialize on-device model",
                  reason: msg,
                  badge: "On-device",
                });
              } catch (e) {
                const m = e instanceof Error ? e.message : String(e);
                setError(m);
                pushLog({
                  at: new Date().toLocaleTimeString(),
                  task: "Initialize on-device model",
                  reason: "Initialization attempted from a user click, as the hybrid SDK requires.",
                  badge: "Failed",
                  error: m,
                });
              } finally {
                setBusy(null);
                deviceModelStatus().then(setNanoStatus).catch(() => {});
              }
            }}
          >
            {busy === "Initialize on-device model" ? "Initializing…" : "Initialize on-device model"}
          </button>
        </div>
        {queuedAudit && (
          <p className="warn-text">
            ⏳ 1 deep audit queued (requested offline at {queuedAudit.queuedAt}). It will run automatically when you
            reconnect — the redacted payload you confirmed is what gets sent.
          </p>
        )}
      </header>

      {gate && (
        <section className="card gate">
          <h2>Confirm cloud send — {gate.info.task}</h2>
          <p>
            This step runs in the cloud. Below is the <strong>exact text</strong> that will be sent — identifiers
            found locally ({gate.info.identifiers.length}
            {gate.info.identifiers.length > 0
              ? `: ${[...new Set(gate.info.identifiers.map((i) => i.kind))].join(", ")}`
              : ""}
            ) have been replaced with placeholders. Raw text never leaves this device.
          </p>
          <pre>{gate.info.redactedText}</pre>
          <div className="row">
            <button
              onClick={() => {
                gate.resolve(true);
                setGate(null);
              }}
            >
              Send redacted version
            </button>
            <button
              className="ghost"
              onClick={() => {
                gate.resolve(false);
                setGate(null);
              }}
            >
              Cancel — send nothing
            </button>
          </div>
        </section>
      )}

      <main>
        {!hideHow && (
          <section className="card how">
            <div className="row spread">
              <h2>How this works</h2>
              <button
                className="ghost"
                onClick={() => {
                  setHideHow(true);
                  try {
                    localStorage.setItem("clearbrief-hide-how", "1");
                  } catch {
                    // dismissal just won't persist
                  }
                }}
              >
                Dismiss
              </button>
            </div>
            <p>
              LamplightBrief splits the work between two models by trust: the on-device model handles your raw text
              because it never transmits it; the cloud model does the heavy audit but only sees a redacted copy you
              confirm first.
            </p>
            <ul>
              <li>Draft and check completeness — on-device first.</li>
              <li>Deep audit — cloud, redacted, after your confirmation.</li>
              <li>The routing log below shows every decision and where each call actually ran.</li>
            </ul>
          </section>
        )}
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
          {notes.trim().length > 0 && notes.trim().length < 40 && (
            <p className="hint">
              These notes are very short — a draft from them will have gaps. Adding who it's for, exactly what
              "done" looks like, a date, and a price makes the brief much stronger.
            </p>
          )}
          <div className="row">
            <button
              disabled={!notes || busy !== null}
              onClick={() =>
                run("Draft brief", () => draftBrief(notes, cloudGate), (r) => {
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
                run("Completeness", () => completenessCheck(workingText, cloudGate), (r) => {
                  if (r.json) setCompleteness(r.json as { present: string[]; missing: string[]; summary: string });
                })
              }
            >
              Completeness check
            </button>
            <button
              disabled={!workingText || busy !== null}
              className="ghost"
              onClick={async () => {
                setPrivacyGuidance(false);
                setBusy("Privacy scan");
                setError(null);
                try {
                  const r = await privacyScan(workingText);
                  pushLog({
                    at: new Date().toLocaleTimeString(),
                    task: "Privacy scan",
                    reason: r.decision.reason,
                    badge: sourceBadge(r),
                    latencyMs: r.latencyMs,
                    payload: r.sentText,
                    identifiers: r.decision.identifiers.length,
                  });
                  if (r.json)
                    setPrivacy(
                      r.json as {
                        findings: { kind: string; excerpt: string; why: string }[];
                        safeToSendToCloud: boolean;
                        summary: string;
                      },
                    );
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  const d = (e as { decision?: RunResult["decision"] }).decision;
                  if (d) {
                    pushLog({
                      at: new Date().toLocaleTimeString(),
                      task: "Privacy scan",
                      reason: d.reason,
                      badge: "Failed",
                      error: msg,
                    });
                  }
                  // The scan is on-device ONLY by design: without Nano it
                  // cannot run, and it will not fall back to the cloud. Give
                  // the user the way forward instead of a dead end.
                  if (/not available|api-not-enabled|LanguageModel/i.test(msg)) {
                    setPrivacyGuidance(true);
                  } else {
                    setError(msg);
                  }
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "Privacy scan" ? "Scanning…" : "Privacy scan (on-device only)"}
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
          {privacyGuidance && (
            <div className="result">
              <h3>Privacy scan needs the on-device model</h3>
              <p>
                Gemini Nano isn't available in this browser, and the privacy scan is on-device only by design — it
                will never send your text to the cloud to scan it. You're not stuck:
              </p>
              <p>
                · The local identifier check (no AI, no network) already flags emails, payment handles, addresses
                and more — see the note under your notes.
                <br />
                · To run the full scan: enable Nano in Chrome (flag in the README), then click "Initialize
                on-device model" in the header.
                <br />· The deep audit below still only ever receives the redacted copy you confirm.
              </p>
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
              onClick={async () => {
                // Offline: don't run a demoted local pass and call it an audit.
                // Gate the redacted payload now, queue it visibly, and flush
                // automatically on reconnect.
                const decision = route("deep-audit", brief);
                if (decision.queuedForCloud) {
                  const { redacted } = redactText(brief, decision.identifiers);
                  const ok = await cloudGate({
                    task: "deep-audit (offline — will queue)",
                    redactedText: redacted,
                    identifiers: decision.identifiers,
                  });
                  if (!ok) {
                    pushLog({
                      at: new Date().toLocaleTimeString(),
                      task: "Deep audit",
                      reason: decision.reason,
                      badge: "Failed",
                      error: "Cloud send cancelled — you declined to queue the redacted copy.",
                    });
                    return;
                  }
                  const item: QueuedAudit = { briefText: brief, queuedAt: new Date().toLocaleTimeString() };
                  try {
                    localStorage.setItem(QUEUE_KEY, JSON.stringify(item));
                  } catch {
                    // storage unavailable — the queue still shows for this session
                  }
                  setQueuedAudit(item);
                  pushLog({
                    at: new Date().toLocaleTimeString(),
                    task: "Deep audit queued",
                    reason:
                      "Offline: audit queued with your confirmed redacted payload. It runs automatically when you reconnect.",
                    badge: "Queued",
                    payload: redacted,
                    identifiers: decision.identifiers.length,
                  });
                  return;
                }
                run("Deep audit", () => deepAudit(brief, { gate: cloudGate }), (r) => {
                  if (r.json) setAudit(r.json as { score: number; flags: AuditFlag[]; verdict: string });
                  setAuditSentText(r.sentText);
                  setAppliedIdx(new Set());
                  setClimbNote(null);
                });
              }}
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
            <button className="ghost" disabled={!brief} onClick={() => exportBrief("md")}>
              Download brief (.md)
            </button>
            <button className="ghost" disabled={!brief} onClick={() => exportBrief("copy")}>
              {copied ? "Copied ✓" : "Copy brief"}
            </button>
          </div>
          {audit && (
            <div className="result">
              <h3>Dispute-readiness: {audit.score}/100</h3>
              <p>{audit.verdict}</p>
              {audit.flags.some((f, i) => f.severity.toLowerCase() === "high" && !appliedIdx.has(i)) && (
                <div className="row">
                  <button disabled={busy !== null} onClick={() => void applyAllHigh()}>
                    {busy === "Applying rewrites" ? "Applying…" : "Apply all high-severity rewrites"}
                  </button>
                </div>
              )}
              {climbNote && <p className="hint">{climbNote}</p>}
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
                    disabled={busy !== null || appliedIdx.has(i)}
                    onClick={() =>
                      run("Apply rewrite", () => applyRewrite(brief, f.clause, f.rewrite, cloudGate), (r) => {
                        setBrief(r.text);
                        setAppliedIdx((prev) => new Set(prev).add(i));
                      })
                    }
                  >
                    {appliedIdx.has(i) ? "Applied ✓" : "Apply this rewrite"}
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
                {typeof e.identifiers === "number" && (
                  <p className="hint">
                    {e.identifiers} identifier{e.identifiers === 1 ? "" : "s"} found locally before this call.
                  </p>
                )}
                {e.payload && (
                  <details>
                    <summary>Payload sent ({e.payload.length} chars)</summary>
                    <pre>{e.payload}</pre>
                  </details>
                )}
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
