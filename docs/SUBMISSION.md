# Devpost submission draft — ClearBrief (#BuildHybridAI 2026)
Status: DRAFT — fill video URL after Production lane delivers; submit by Sun Nov 29, 2026.

## Project name
ClearBrief

## Tagline
Judge-ready job briefs for escrow work — drafted on-device, audited in the cloud.

## Platform
Web (Chrome)

## Links
- Demo (hosted): https://clearbrief-hybrid.web.app
- Repo: https://github.com/queenellis2026-hash/clearbrief (Apache-2.0)
- Video: <YouTube URL — pending>

## About / description

### What it does
ClearBrief helps people hiring AI agents and freelancers through escrow write job posts a dispute panel could actually rule on. Escrow only works when the job post is clear: if the brief never said what "done" means, no judge — human or AI — can settle the argument. Users paste rough notes; ClearBrief produces a complete brief, checks it, and scores its dispute-readiness.

1. **Draft (on-device)** — rough notes become a structured brief: deliverable, deadline, budget, acceptance criteria, revision terms, evidence to deliver.
2. **Privacy scan (on-device only)** — names, emails, payment handles and addresses are flagged where the text already lives. This pass never transmits.
3. **Completeness check (on-device)** — structured JSON checklist of what's present and what's missing.
4. **Deep dispute-readiness audit (cloud)** — a 0–100 score with quoted problem clauses (ambiguity, unmeasurable criteria, scope-creep openings, missing evidence terms), a concrete rewrite for each, and one-click apply. The cloud only ever receives a redacted copy — and the app shows the user exactly what was sent.
5. **Brief library (Firestore)** — finished briefs saved under the user's anonymous-auth account, protected by per-user security rules.

### How Firebase AI Logic was used
All AI inference goes through Firebase AI Logic (`firebase/ai`) — Gemini Nano on-device via the Chrome Prompt API and Gemini (`gemini-3.5-flash-lite`) in the cloud via the Gemini Developer API, from one SDK. No other model API is called.

The core is a **custom router** (`app/src/lib/router.ts`) that decides where each request runs and explains itself in a live routing log:

- **Sensitivity first:** deterministic local detectors plus the on-device privacy scan run before anything else; identifiers are redacted before any cloud call, and the privacy scan itself is `ONLY_ON_DEVICE`.
- **Complexity second:** short structured tasks use `PREFER_ON_DEVICE` with JSON-schema output; the audit uses `PREFER_IN_CLOUD`.
- **Connectivity third:** offline demotes cloud work to a local pass and queues the audit.
- **Availability last:** the SDK falls back automatically, and every result displays the SDK-reported `inferenceSource` — the badge never guesses.

On-device calls respect the hybrid SDK's real limits: single-turn prompts, structured output, no chat or tools on-device, and `initializeDeviceModel()` called on the user's click before the first prompt.

Also used: **App Check** (enforced for AI Logic; reCAPTCHA Enterprise in production, debug tokens locally), **Firestore** + **Anonymous Auth**, and **Firebase Hosting**. Free (Spark) tier throughout — text inference within free limits, no billing account.

### Why hybrid is the point
A cloud-only version of this app would upload raw job notes full of private rates, names and payment handles just to fix formatting — and would die offline. A device-only version can't do the long, judgement-heavy dispute audit. ClearBrief gives each model the job that matches its trust level and its size: the small local model is trusted with raw text because it never transmits it; the large cloud model does the hard reasoning but only ever sees redacted text.

### Built during the submission period
Everything: the app, router, Firebase project (AI Logic + App Check + Firestore + Hosting), and this submission were built Nov 24–29, 2026. ClearBrief grows out of our earlier escrow work (Lamplight Pay, a live agent-escrow product), which supplied the problem — real dispute panels ruling on real job posts — but no code from it is used here.

## Testing instructions
1. Open https://clearbrief-hybrid.web.app in Chrome desktop 139+.
2. For on-device inference: enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart Chrome, and let the Gemini Nano model download (DevTools console: `await LanguageModel.create()`). Without it, features fall back to the cloud model and the routing badge says "Cloud".
3. Try the "logo job (vague)" sample: Draft brief → Privacy scan → Deep audit. Note the routing log badges, the redacted text viewer under the audit, and the offline behaviour (toggle your network off and draft again).
4. No account or payment is needed; the brief library uses anonymous sign-in automatically.

## Video script outline (≤3 min)
- 0:00–0:30 — The problem: escrow disputes are lost in the job post, not the work. Who ClearBrief is for.
- 0:30–1:20 — Draft + privacy scan on-device; routing log shows On-device; Wi-Fi off, drafting still works.
- 1:20–2:20 — Wi-Fi on; deep audit on redacted text only; score, flags, one-click rewrite; "exactly what was sent to the cloud" viewer.
- 2:20–3:00 — Save to library; recap: one SDK, two models, each doing the job that matches its trust level.
