import { getGenerativeModel, InferenceMode, Schema, type GenerativeModel } from "firebase/ai";
import { getAiBackend } from "./firebase";
import { route, redactText, type RoutingDecision } from "./router";

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
      if (!transient || attempt === 2) throw e;
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

export async function draftBrief(notes: string): Promise<RunResult> {
  const decision = route("draft", notes);
  const model = requireModel(decision.mode, briefSchema as unknown as object);
  const prompt =
    "You turn rough job notes into a clean escrow job brief a neutral third party could judge. " +
    "Return JSON only, matching the schema. briefText is the full brief in plain language. " +
    "Leave a field as an empty string or empty array when the notes do not say — never invent terms.\n\nNOTES:\n" +
    notes;
  return runModel(model, decision, prompt, notes);
}

// --- Task 2: completeness checklist (on-device preferred, structured) -----

const completenessSchema = Schema.object({
  properties: {
    present: Schema.array({ items: Schema.string() }),
    missing: Schema.array({ items: Schema.string() }),
    summary: Schema.string(),
  },
});

export async function completenessCheck(briefText: string): Promise<RunResult> {
  const decision = route("completeness", briefText);
  const model = requireModel(decision.mode, completenessSchema as unknown as object);
  const prompt =
    "Check this escrow job brief for completeness. A brief is complete when it states: deliverable, " +
    "deadline, budget/payment terms, measurable acceptance criteria, revision terms, and what evidence " +
    "the worker must deliver. Return JSON only: present[], missing[], summary.\n\nBRIEF:\n" +
    briefText;
  return runModel(model, decision, prompt, briefText);
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

export async function deepAudit(briefText: string): Promise<AuditOutcome> {
  const decision = route("deep-audit", briefText);
  // The cloud never sees raw identifiers: redact first when the router
  // requires it, and show the user exactly what will be sent.
  const { redacted } = decision.requiresRedaction
    ? redactText(briefText, decision.identifiers)
    : { redacted: briefText };
  const prompt =
    "You audit an escrow job brief for dispute-readiness: could a neutral judge panel rule on this brief " +
    "alone if the buyer and worker disagreed? Score 0-100. Flag every clause that is ambiguous, " +
    "unmeasurable, contradictory, missing evidence terms, or open to scope creep. For each flag give the " +
    "quoted clause, the problem, a concrete rewrite, and severity (high/medium/low). Return JSON only.\n\nBRIEF:\n" +
    redacted;
  const model = requireModel(decision.mode, auditSchema as unknown as object);
  try {
    const result = await runModel(model, decision, prompt, redacted);
    return { ...result, queued: decision.queuedForCloud };
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
    return { ...result, queued: decision.queuedForCloud };
  }
}

// --- Task 5: apply a rewrite (on-device preferred) --------------------------

export async function applyRewrite(briefText: string, clause: string, rewrite: string): Promise<RunResult> {
  const decision = route("rewrite", briefText);
  const model = requireModel(decision.mode);
  const prompt =
    `Rewrite this job brief, replacing the clause "${clause}" with this improved version: "${rewrite}". ` +
    "Change nothing else. Return the full brief text only.\n\nBRIEF:\n" +
    briefText;
  return runModel(model, decision, prompt, briefText);
}
