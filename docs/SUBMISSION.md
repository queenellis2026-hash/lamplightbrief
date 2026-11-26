# Devpost submission draft — LamplightBrief (#BuildHybridAI 2026)
Status: Round 1 text — mirrors the Devpost draft (submission 1319067); video URL added when Production delivers; submit Sun Nov 29, 2026.

## Project name
LamplightBrief

## Tagline
Judge-ready job briefs for escrow work — drafted on-device, audited in the cloud.

## Platform
Web (Chrome)

## Links
- Demo (hosted): https://clearbrief-hybrid.web.app
- Repo: https://github.com/queenellis2026-hash/lamplightbrief (Apache-2.0)
- Video: <YouTube URL — pending>

## About / description

### The idea: privacy-tiered hybrid routing

LamplightBrief's core contribution is a routing pattern any app that handles sensitive text can reuse: **give each model the job that matches its trust level and its size.** The small on-device model is trusted with raw text because it never transmits it. The large cloud model does the judgement-heavy reasoning but only ever sees a redacted copy — one the user has seen and confirmed. A custom router makes that decision for every request, in a fixed order (sensitivity → complexity → connectivity → availability), and a live routing log shows its reasoning and the SDK-reported `inferenceSource` for every call, including failures.

A cloud-only version of this app would upload raw job notes full of private payment details, amounts and contact information just to fix formatting — and would stop working offline. A device-only version can't do the long, judgement-heavy dispute audit. What Nano adds beyond cloud plus client-side redaction: it drafts and checks the raw text itself, so nothing is lost to redaction, and drafting keeps working fully offline. Hybrid is not a fallback strategy here; it is the architecture the problem requires.

### What it does

LamplightBrief helps people hiring AI agents and freelancers through escrow write job posts a dispute panel could actually rule on. Escrow only works when the job post is clear: if the brief never said what "done" means, no judge — human or AI — can settle the argument. Users paste rough notes; LamplightBrief produces a complete brief, checks it, and scores its dispute-readiness.

1. **Draft** — rough notes become a structured brief: deliverable, deadline, budget, acceptance criteria, revision terms, evidence to deliver. Runs on-device where Gemini Nano is available.
2. **Privacy scan (on-device only)** — two local layers: deterministic detectors (pattern-matching code: emails, money amounts, payment handles, addresses and similar identifiers; no AI, no network) and an AI scan that runs `ONLY_ON_DEVICE` when Nano is available. Neither transmits. Stated plainly: names are not reliably detectable by pattern matching — the mitigation is the confirmation gate, where you see the exact payload before anything is sent.
3. **Completeness check** — structured JSON checklist of what's present and what's missing.
4. **Deep dispute-readiness audit (cloud)** — a 0–100 score against a published rubric (deliverable clarity 25, measurable acceptance criteria 25, timeline specificity 15, payment and evidence terms 20, revision and scope terms 15), with quoted problem clauses and a concrete rewrite for each, plus one-click apply. Before the audit runs, a confirmation panel shows the exact redacted text; nothing is sent until the user clicks "Send redacted version." An "exactly what was sent to the cloud" viewer stays available afterwards.
5. **Brief library (Firestore)** — finished briefs saved under the user's anonymous-auth account, protected by per-user security rules.

Offline, the audit queues visibly with the confirmed payload and runs automatically on reconnect. If Gemini Nano is unavailable in the browser, local-first tasks fall back to the cloud **with the redacted copy only, after the same user confirmation** — the routing log states this explicitly rather than letting it happen silently.

### How Firebase AI Logic was used

All AI inference goes through Firebase AI Logic (`firebase/ai`) — Gemini Nano on-device via the Chrome Prompt API and Gemini (`gemini-3.5-flash-lite` — the model we used; see https://firebase.google.com/docs/ai-logic) in the cloud via the Gemini Developer API, from one SDK. No other model API is called for inference.

The router (`app/src/lib/router.ts`) applies, in order:

- **Sensitivity first:** deterministic local detectors (emails, money amounts, phones, payment handles, token-bearing URLs, street addresses, crypto addresses) run before any AI call; the privacy scan is `ONLY_ON_DEVICE`; identifiers are redacted before any cloud call, and the user confirms the exact payload.
- **Complexity second:** short structured tasks use `PREFER_ON_DEVICE` with JSON-schema output; the audit uses `PREFER_IN_CLOUD`.
- **Connectivity third:** offline queues the audit (confirmed payload, stored locally, indicator shown) and flushes it on reconnect.
- **Availability last:** the SDK falls back automatically, and every result displays the SDK-reported `inferenceSource` — the badge never guesses.

On-device calls respect the hybrid SDK's real limits: single-turn prompts, structured output, no chat or tools on-device, and `initializeDeviceModel()` called from the user's click (there is a dedicated button in the header) before the first prompt. Transient cloud errors are retried with backoff, and if the pinned audit call fails it retries once without the response schema, noted in the routing log.

Also used: **App Check, enforced** for AI Logic (reCAPTCHA Enterprise in production, debug tokens locally), **Firestore** + **Anonymous Auth**, and **Firebase Hosting**. Free (Spark) tier throughout — text inference within free limits, no billing account on the project.

### Built during the submission period

The app, router, Firebase project (AI Logic + App Check + Firestore + Hosting) and repo were built on Nov 24, 2026; polish and this submission text are being prepared during the Nov 24–29, 2026 window. Commit history matches those dates. LamplightBrief grows out of our earlier escrow work (Lamplight Pay, a live agent-escrow product), which supplied the problem — real dispute panels ruling on real job posts — but no code from it is used here.

LamplightBrief grows out of Lamplight Pay, our live agent-escrow product, whose dispute panels supplied the problem; no code is shared. (The hosted URL predates the rename; Firebase project IDs are immutable.)

## Testing instructions
1. Open https://clearbrief-hybrid.web.app in Chrome desktop 139+.
2. Click "Sample: logo job (vague)" → Draft brief → watch the routing log. Then run the Deep audit and note the confirmation panel showing the exact redacted payload before anything is sent.
3. For on-device inference: enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart Chrome, and click "Initialize on-device model" in the header (the pill shows Nano's status). Without Nano, features fall back to the cloud with the redacted copy after your confirmation, and the routing log says so.
4. Offline: toggle your network off and request a deep audit — it queues visibly and runs automatically when you reconnect.
5. No account or payment is needed; the brief library uses anonymous sign-in automatically.

## Video script outline (≤3 min)
- 0:00–0:30 — The problem: escrow disputes are lost in the job post, not the work. Who LamplightBrief is for.
- 0:30–1:20 — Draft + privacy scan on-device (Nano initialized live, badge shows On-device); Wi-Fi off, drafting still works.
- 1:20–2:20 — Wi-Fi on; confirmation panel with redacted payload; deep audit; low score on the vague brief, flags, one-click rewrite, score climbs on re-check.
- 2:20–3:00 — Save to library; recap: one SDK, two models, each doing the job that matches its trust level.## Elevator pitch (as saved on Devpost — 200-char limit; the longer version was trimmed, "actually" dropped to fit)

LamplightBrief — judge-ready job briefs, drafted on-device, audited in the cloud. Paste rough job notes; get a brief a dispute panel could rule on — with a privacy router that shows its work.


