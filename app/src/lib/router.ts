import { InferenceMode } from "firebase/ai";

// ---------------------------------------------------------------------------
// LamplightBrief custom router
//
// Every AI request passes through here BEFORE any model is called. The
// router decides where the request runs and the UI shows its reasoning in
// the routing log. Order matters:
//
//   1. Sensitivity  — identifiers are found locally first. Raw text with
//                     identifiers is never sent to the cloud unredacted.
//   2. Complexity   — short structured work stays on-device; long or
//                     judgement-heavy work escalates to the cloud.
//   3. Connectivity — offline demotes cloud work to on-device and queues
//                     the cloud pass for later.
//   4. Availability — handled by the SDK itself: PREFER_ON_DEVICE falls
//                     back to the cloud when Gemini Nano is unavailable,
//                     and the response's inferenceSource tells the truth
//                     about where it actually ran.
// ---------------------------------------------------------------------------

export type TaskKind = "draft" | "completeness" | "privacy-scan" | "rewrite" | "deep-audit";

export interface DetectedIdentifier {
  kind: "email" | "phone" | "payment-handle" | "url-with-token" | "address" | "crypto-address";
  value: string;
  index: number;
}

export interface RoutingDecision {
  task: TaskKind;
  mode: InferenceMode;
  /** Human-readable reason, shown in the routing log. */
  reason: string;
  /** True when the text must be redacted before this call may run. */
  requiresRedaction: boolean;
  identifiers: DetectedIdentifier[];
  /** Set when a cloud task is queued because we are offline. */
  queuedForCloud: boolean;
}

const PATTERNS: { kind: DetectedIdentifier["kind"]; re: RegExp }[] = [
  { kind: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { kind: "phone", re: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g },
  { kind: "payment-handle", re: /(\$[a-zA-Z][a-zA-Z0-9_-]{2,}|@[a-zA-Z][a-zA-Z0-9_]{2,}\s*(venmo|cash ?app|zelle|paypal))/gi },
  { kind: "url-with-token", re: /https?:\/\/\S*(token|key|sig|auth)=\S+/gi },
  { kind: "address", re: /\b\d{1,6}\s+[A-Z][a-zA-Z]+\s+(Ln|Lane|St|Street|Ave|Avenue|Blvd|Rd|Road|Dr|Drive)\b/g },
  { kind: "crypto-address", re: /\b0x[0-9a-fA-F]{40}\b/g },
];

/** Deterministic local detectors — plain rules, no AI, no network. */
export function detectIdentifiers(text: string): DetectedIdentifier[] {
  const found: DetectedIdentifier[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      found.push({ kind, value: m[0], index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Replace identifiers with stable placeholders, e.g. [EMAIL_1]. */
export function redactText(text: string, identifiers: DetectedIdentifier[]): { redacted: string; map: Record<string, string> } {
  const map: Record<string, string> = {};
  const counters: Record<string, number> = {};
  let out = text;
  // Replace from the end so earlier indices stay valid.
  for (const id of [...identifiers].sort((a, b) => b.index - a.index)) {
    counters[id.kind] = (counters[id.kind] ?? 0) + 1;
    const label = `[${id.kind.toUpperCase().replace(/-/g, "_")}_${counters[id.kind]}]`;
    map[label] = id.value;
    out = out.slice(0, id.index) + label + out.slice(id.index + id.value.length);
  }
  return { redacted: out, map };
}

const CLOUD_CHAR_THRESHOLD = 4000;

export function route(task: TaskKind, text: string): RoutingDecision {
  const identifiers = detectIdentifiers(text);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const hasIdentifiers = identifiers.length > 0;

  switch (task) {
    case "privacy-scan":
      // The whole point: raw text is examined only where it already lives.
      return {
        task,
        mode: InferenceMode.ONLY_ON_DEVICE,
        reason: "Sensitivity: privacy scan reads raw text, so it runs on-device only and never transmits.",
        requiresRedaction: false,
        identifiers,
        queuedForCloud: false,
      };
    case "draft":
    case "completeness":
    case "rewrite":
      return {
        task,
        mode: InferenceMode.PREFER_ON_DEVICE,
        reason: online
          ? "Complexity: short structured task — on-device preferred, cloud is the automatic fallback."
          : "Connectivity: offline — on-device only in practice; the SDK will answer locally or not at all.",
        requiresRedaction: false, // these tasks stay local-first; no forced redaction
        identifiers,
        queuedForCloud: false,
      };
    case "deep-audit": {
      if (!online) {
        return {
          task,
          mode: InferenceMode.PREFER_ON_DEVICE,
          reason: "Connectivity: offline — deep audit demoted to a local pass and queued for the cloud when you reconnect.",
          requiresRedaction: hasIdentifiers,
          identifiers,
          queuedForCloud: true,
        };
      }
      const longDoc = text.length > CLOUD_CHAR_THRESHOLD;
      return {
        task,
        mode: InferenceMode.PREFER_IN_CLOUD,
        reason:
          `Sensitivity: cloud receives ${hasIdentifiers ? "the redacted text only" : "text with no identifiers detected"}. ` +
          (longDoc
            ? `Complexity: ${text.length} chars exceeds the on-device comfort zone — cloud audit.`
            : "Complexity: dispute-readiness judgement needs the larger cloud model."),
        requiresRedaction: hasIdentifiers,
        identifiers,
        queuedForCloud: false,
      };
    }
  }
}
