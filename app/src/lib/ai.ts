import { getGenerativeModel, InferenceMode, Schema, type GenerativeModel } from "firebase/ai";
import { getAiBackend } from "./firebase";
import { route, redactText, type DetectedIdentifier, type RoutingDecision } from "./router";

// ---------------------------------------------------------------------------
// All AI inference in ClearBrief goes through Firebase AI Logic — on-device
// (Gemini Nano via the Chrome Prompt API) and cloud (Gemini via the Gemini
// Developer API) from the same SDK. No other model API is called anywhere.
// ---------------------------------------------------------------------------

export interface RunResult {
  decision: RoutingDecision;
  /** Where the model actually ran, from the SDK response — never guessed. */
  inferenceSource: string;
  latencyMs: number;
  text: string;
  /** Parsed JSON when the call used a response schema. */
  json?: unknown;
  /** The exact text that was sent to the model (post-redaction for cloud). */
  sentText: string;
}

function modelFor(mode: InferenceMode, jsonSchema?: object, cloudModel?: string | null): GenerativeModel | null {
  const ai = getAiBackend();
  if (!ai) return null;
  const useCloudModel = cloudModel === undefined ? "gemini-3.5-flash-lite" : cloudModel;
  return getGenerativeModel(ai, {
    mode,
    ...((mode === InferenceMode.PREFER_IN_CLOUD || mode === InferenceMode.ONLY_IN_CLOUD) && useCloudModel
      ? { inCloudParams: { model: useCloudModel } }
      : {}),
    ...(jsonSchema
      ? {
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
          },
        }
      : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function runModel(
  model: GenerativeModel,
  decision: RoutingDecision,
  prompt: string,
  sentText: string,
): Promise<RunResult> {
  const started = performance.now();
  // initializeDeviceModel must be called on/after a user interaction and
  // before the first prompt — every run here starts from a button click.
  try {
    await model.initializeDeviceModel(() => {});
  } catch {
    // On cloud-only configurations there may be no device model to init.
  }
  // Retry transient cloud errors (500/503/429 "high demand") with backoff —
  // the FAQ for this SDK recommends exactly this pattern.
  let result: Awaited<ReturnType<typeof model.generateContent>> | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await model.generateContent(prompt);
      break;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const transient = /500|503|429|high demand|overloaded|try again later/i.test(msg);
      if (!transient || attempt === 2) {
        // Attach the routing decision so the UI can log failed attempts too —
        // the routing log shows its work, including failures.
        (e as { decision?: RoutingDecision }).decision = decision;
        throw e;
      }
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 5000));
    }
  }
  if (!result) throw lastError;
  const latencyMs = Math.round(performance.now() - started);
  const response = result.response;
  const text = response.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inferenceSource = String((response as any).inferenceSource ?? "unknown");
  let json: unknown;
  try {
    // Cloud fallback models often wrap JSON in a ```json fence even when a
    // response schema was requested — strip it before parsing.
    const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    json = JSON.parse(cleaned);
  } catch {
    json = undefined;
  }
  return { decision, inferenceSource, latencyMs, text, json, sentText };
}

function requireModel(mode: InferenceMode, jsonSchema?: object): GenerativeModel {
  const m = modelFor(mode, jsonSchema);
  if (!m) {
    throw new Error(
      "Firebase is not configured yet. Copy .env.example to .env.local with your Firebase web config, then reload.",
    );
  }
  return m;
}

// --- On-device model status -------------------------------------------------
// Availability is read from the platform Prompt API surface that the Firebase
// AI Logic hybrid SDK itself wraps. This is a status read only — ALL
// inference still runs through Firebase AI Logic.

export type DeviceModelStatus = "available" | "downloading" | "downloadable" | "unavailable" | "unknown";

export async function deviceModelStatus(): Promise<DeviceModelStatus> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lm = (globalThis as any).LanguageModel;
    if (!lm || typeof lm.availability !== "function") return "unavailable";
    const status = await lm.availability();
    if (status === "available" || status === "downloading" || status === "downloadable") return status;
    return "unavailable";
  } catch {
    return "unknown";
  }
}

/** Trigger the on-device model download/init from a user gesture. */
export async function initDeviceModel(onProgress?: (status: DeviceModelStatus) => void): Promise<string> {
  const model = requireModel(InferenceMode.PREFER_ON_DEVICE);
  onProgress?.("downloading");
  await model.initializeDeviceModel(() => {});
  const status = await deviceModelStatus();
  onProgress?.(status);
  return status === "available"
    ? "On-device model initialized — Gemini Nano is ready on this device."
    : `On-device model initialization finished; platform reports status "${status}".`;
}

// --- The cloud gate -----------------------------------------------------------
// Before ANY text reaches the cloud, the user sees the exact redacted text
// and must explicitly confirm. Raw text is never sent to the cloud: when the
// on-device model is unavailable, local-first tasks redact first and gate.

export interface CloudGateInfo {
  task: string;
  redactedText: string;
  identifiers: DetectedIdentifier[];
}

export type CloudGate = (info: CloudGateInfo) => Promise<boolean>;

function cancelledError(decision: RoutingDecision): Error {
  const e = new Error("Cloud send cancelled — you declined to send the redacted copy. Nothing was transmitted.");
  (e as { decision?: RoutingDecision }).decision = decision;
  return e;
}

/**
 * Prepare a local-first task. If Gemini Nano is available, the text runs
 * on-device untouched. If it is NOT available, the SDK would fall back to the
 * cloud — so we redact first and ask the user to confirm the exact payload.
 * The returned `restore` maps placeholders back to the real values LOCALLY,
 * so results the user keeps (their brief) contain their real details while
 * the cloud only ever saw placeholders.
 */
async function prepareLocalFirst(
  decision: RoutingDecision,
  text: string,
  gate?: CloudGate,
): Promise<{ decision: RoutingDecision; text: string; restore: (s: string) => string }> {
  const identity = (s: string) => s;
  const status = await deviceModelStatus();
  if (status === "available") return { decision, text, restore: identity };
  const { redacted, map } = redactText(text, decision.identifiers);
  const labels = Object.keys(map).sort((a, b) => b.length - a.length);
  const restore = (s: string) => labels.reduce((acc, l) => acc.split(l).join(map[l]), s);
  const gatedDecision: RoutingDecision = {
    ...decision,
    requiresRedaction: true,
    reason:
      decision.reason +
      " On-device model not available in this browser → cloud fallback: raw text withheld; only the redacted copy is sent, after your confirmation.",
  };
  if (gate) {
    const ok = await gate({ task: decision.task, redactedText: redacted, identifiers: decision.identifiers });
    if (!ok) throw cancelledError(gatedDecision);
  }
  return { decision: gatedDecision, text: redacted, restore };
}

function restoreJson(json: unknown, restore: (s: string) => string): unknown {
  if (typeof json === "string") return restore(json);
  if (Array.isArray(json)) return json.map((v) => restoreJson(v, restore));
  if (json && typeof json === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(json)) o[k] = restoreJson(v, restore);
    return o;
  }
  return json;
}

function restored(result: RunResult, restore: (s: string) => string): RunResult {
  return {
    ...result,
    text: restore(result.text),
    json: result.json === undefined ? undefined : restoreJson(result.json, restore),
    // sentText stays exactly what was transmitted — the log tells the truth.
  };
}

// --- Task 1: draft a clean brief from rough notes (on-device preferred) ---

const briefSchema = Schema.object({
  properties: {
    title: Schema.string(),
    deliverable: Schema.string(),
    deadline: Schema.string(),
    budget: Schema.string(),
    acceptanceCriteria: Schema.array({ items: Schema.string() }),
    revisionTerms: Schema.string(),
    evidenceToDeliver: Schema.array({ items: Schema.string() }),
    briefText: Schema.string(),
  },
});

export async function draftBrief(notes: string, gate?: CloudGate): Promise<RunResult> {
  const routed = route("draft", notes);
  const { decision, text, restore } = await prepareLocalFirst(routed, notes, gate);
  const model = requireModel(decision.mode, briefSchema as unknown as object);
  const prompt =
    "You turn rough job notes into a clean escrow job brief a neutral third party could judge. " +
    "Return JSON only, matching the schema. briefText is the full brief in plain language. " +
    "Leave a field as an empty string or empty array when the notes do not say — never invent terms.\n\nNOTES:\n" +
    text;
  return restored(await runModel(model, decision, prompt, text), restore);
}

// --- Task 2: completeness checklist (on-device preferred, structured) -----

const completenessSchema = Schema.object({
  properties: {
    present: Schema.array({ items: Schema.string() }),
    missing: Schema.array({ items: Schema.string() }),
    summary: Schema.string(),
  },
});

export async function completenessCheck(briefText: string, gate?: CloudGate): Promise<RunResult> {
  const routed = route("completeness", briefText);
  const { decision, text, restore } = await prepareLocalFirst(routed, briefText, gate);
  const model = requireModel(decision.mode, completenessSchema as unknown as object);
  const prompt =
    "Check this escrow job brief for completeness. A brief is complete when it states: deliverable, " +
    "deadline, budget/payment terms, measurable acceptance criteria, revision terms, and what evidence " +
    "the worker must deliver. Return JSON only: present[], missing[], summary.\n\nBRIEF:\n" +
    text;
  return restored(await runModel(model, decision, prompt, text), restore);
}

// --- Task 3: privacy scan (on-device ONLY) ---------------------------------

const privacySchema = Schema.object({
  properties: {
    findings: Schema.array({
      items: Schema.object({
        properties: {
          kind: Schema.string(),
          excerpt: Schema.string(),
          why: Schema.string(),
        },
      }),
    }),
    safeToSendToCloud: Schema.boolean(),
    summary: Schema.string(),
  },
});

export async function privacyScan(text: string): Promise<RunResult> {
  const decision = route("privacy-scan", text);
  const model = requireModel(decision.mode, privacySchema as unknown as object);
  const prompt =
    "You are a privacy scanner running entirely on the user's device. Find anything in this text that " +
    "should not be sent to a cloud service: names of private individuals, emails, phone numbers, payment " +
    "handles, addresses, credentials, or unreleased business details. Return JSON only: findings[] " +
    "(kind, excerpt, why), safeToSendToCloud, summary.\n\nTEXT:\n" +
    text;
  return runModel(model, decision, prompt, text);
}

// --- Task 4: deep dispute-readiness audit (cloud, redacted text only) ------

const auditSchema = Schema.object({
  properties: {
    score: Schema.number(),
    flags: Schema.array({
      items: Schema.object({
        properties: {
          clause: Schema.string(),
          problem: Schema.string(),
          rewrite: Schema.string(),
          severity: Schema.string(),
        },
      }),
    }),
    verdict: Schema.string(),
  },
});

export interface AuditOutcome extends RunResult {
  queued: boolean;
}

/**
 * The cloud fallback model does not always honour the audit schema's field
 * names. Normalize common alternates into the canonical shape the UI uses —
 * a live pass caught score/clause/rewrite rendering blank because the model
 * answered with different keys.
 */
function normalizeAuditJson(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const j = json as Record<string, unknown>;
  const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    return undefined;
  };
  const rawFlags = (pick(j, ["flags", "issues", "problems", "findings"]) as unknown[] | undefined) ?? [];
  const flags = (Array.isArray(rawFlags) ? rawFlags : []).map((f) => {
    const fo = (f ?? {}) as Record<string, unknown>;
    return {
      clause: String(pick(fo, ["clause", "quote", "text", "excerpt", "issue"]) ?? ""),
      problem: String(pick(fo, ["problem", "description", "explanation", "reason"]) ?? ""),
      rewrite: String(pick(fo, ["rewrite", "suggestedRewrite", "suggestion", "fix", "recommendation"]) ?? ""),
      severity: String(pick(fo, ["severity", "level", "priority"]) ?? "medium"),
    };
  });
  const scoreRaw = pick(j, ["score", "overallScore", "disputeReadinessScore", "dispute_readiness_score", "rating"]);
  return {
    score: typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw ?? NaN),
    flags,
    verdict: String(pick(j, ["verdict", "summary", "overall"]) ?? ""),
  };
}

function normalized(result: RunResult): RunResult {
  return { ...result, json: result.json === undefined ? undefined : normalizeAuditJson(result.json) };
}

export async function deepAudit(
  briefText: string,
  opts?: { gate?: CloudGate; preConfirmed?: boolean },
): Promise<AuditOutcome> {
  const decision = route("deep-audit", briefText);
  // The cloud never sees raw identifiers: redact first when the router
  // requires it, and show the user exactly what will be sent.
  const { redacted } = decision.requiresRedaction
    ? redactText(briefText, decision.identifiers)
    : { redacted: briefText };
  // Human gate: before this cloud call runs, the user sees the exact payload
  // and confirms. (Skipped only when the confirmation already happened at
  // queue time for an offline-queued audit.)
  if (opts?.gate && !opts.preConfirmed) {
    const ok = await opts.gate({ task: "deep-audit", redactedText: redacted, identifiers: decision.identifiers });
    if (!ok) throw cancelledError(decision);
  }
  const prompt =
    "You audit an escrow job brief for dispute-readiness: could a neutral judge panel rule on this brief " +
    "alone if the buyer and worker disagreed? Score against this published rubric (100 points total): " +
    "deliverable clarity 25; measurable acceptance criteria 25; timeline specificity 15; payment and " +
    "evidence terms 20; revision and scope terms 15. The score is the sum of points earned across the five " +
    "areas. Flag every clause that is ambiguous, unmeasurable, contradictory, missing evidence terms, or " +
    "open to scope creep. For each flag give the quoted clause, the problem, a concrete rewrite, and " +
    "severity (high/medium/low). Return JSON only.\n\nBRIEF:\n" +
    redacted;
  const model = requireModel(decision.mode, auditSchema as unknown as object);
  try {
    const result = await runModel(model, decision, prompt, redacted);
    return { ...normalized(result), queued: decision.queuedForCloud };
  } catch (primaryError) {
    // If the pinned cloud model is unavailable (retired or overloaded),
    // fall back to the SDK's default cloud model rather than failing the
    // audit outright — and say so in the routing log.
    const fallbackModel = modelFor(decision.mode, auditSchema as unknown as object, null);
    if (!fallbackModel) throw primaryError;
    const fallbackDecision: RoutingDecision = {
      ...decision,
      reason: decision.reason + " Primary cloud model unavailable — fell back to the default cloud model.",
    };
    const result = await runModel(fallbackModel, fallbackDecision, prompt, redacted);
    return { ...normalized(result), queued: decision.queuedForCloud };
  }
}

// --- Task 5: apply a rewrite (on-device preferred) --------------------------

export async function applyRewrite(
  briefText: string,
  clause: string,
  rewrite: string,
  gate?: CloudGate,
): Promise<RunResult> {
  const routed = route("rewrite", briefText);
  const { decision, text, restore } = await prepareLocalFirst(routed, briefText, gate);
  const model = requireModel(decision.mode);
  const prompt =
    `Rewrite this job brief, replacing the clause "${clause}" with this improved version: "${rewrite}". ` +
    "Change nothing else. Return the full brief text only.\n\nBRIEF:\n" +
    text;
  return restored(await runModel(model, decision, prompt, text), restore);
}
