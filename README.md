# ClearBrief

**Job briefs a judge panel could actually rule on** — drafted privately on your device, audited deeply in the cloud.

ClearBrief is a web app for people hiring AI agents and freelancers through escrow (the Lamplight Pay problem: a dispute panel can only rule on what the job post actually said). Paste rough job notes and ClearBrief:

1. **Drafts a clean brief on-device** — deliverable, deadline, budget, acceptance criteria, revision terms, evidence to deliver — as structured JSON.
2. **Scans for private details on-device only** — names, emails, payment handles and addresses are flagged where the text already lives. Raw text is never transmitted for this pass.
3. **Audits dispute-readiness in the cloud** — ambiguity, unmeasurable acceptance criteria, scope-creep openings, missing evidence terms — with a 0–100 score, quoted problem clauses, and one-click rewrites. The cloud only ever receives a **redacted** copy, and the app shows you exactly what was sent.
4. **Saves finished briefs** to a personal Firestore library (anonymous auth, per-user rules).

Built for **#BuildHybridAI 2026** (Firebase AI Logic hybrid inference). Live demo: https://clearbrief-hybrid.web.app

## How hybrid inference is used

All AI inference goes through **Firebase AI Logic** (`firebase/ai`) — Gemini Nano on-device via the Chrome Prompt API, Gemini in the cloud via the Gemini Developer API, one SDK. No other model API is called anywhere in the app.

A **custom router** (`app/src/lib/router.ts`) decides where each request runs, in this order, and the UI's routing log shows its reasoning plus the SDK's own `inferenceSource` report for every call:

1. **Sensitivity** — deterministic local detectors + the on-device privacy scan run first. Identifiers are redacted before any cloud call.
2. **Complexity** — short structured tasks (draft, completeness, rewrite) use `InferenceMode.PREFER_ON_DEVICE` / `ONLY_ON_DEVICE`; the dispute-readiness audit uses `PREFER_IN_CLOUD` with `gemini-2.5-flash-lite`.
3. **Connectivity** — offline demotes cloud work to a local pass and queues the audit.
4. **Availability** — the SDK falls back automatically; the badge reports where the model *actually* ran.

On-device calls are single-turn with structured (JSON schema) output, respecting the hybrid SDK's limits: no chat, no tools on-device. `initializeDeviceModel()` is called on the button click, before the first prompt, per Chrome's user-activation requirement.

Other Firebase products used: **App Check** (enforced for AI Logic; reCAPTCHA Enterprise in production, debug tokens for local dev), **Firestore** + **Anonymous Auth** (brief library), **Hosting**.

## Run it locally

Requirements: Node 20+, Chrome desktop **139+** for on-device inference.

1. **Enable Gemini Nano in Chrome**
   - Update Chrome (`chrome://settings/help`).
   - Set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to **Enabled** and restart Chrome.
   - In DevTools console, run `await LanguageModel.availability()` — if `downloadable`, run `await LanguageModel.create()` and wait for the model download.
2. **Create a Firebase project** (free Spark plan, no billing needed)
   - In the [Firebase console](https://console.firebase.google.com), create a project.
   - **AI Services → AI Logic → Get started**, choose the **Gemini Developer API** provider. This enables the required APIs and enforces App Check.
   - Register a **Web app** and copy its config.
   - **Authentication → Sign-in method**: enable **Anonymous**.
   - **Firestore Database**: create the database and publish the rules in `app/firestore.rules`.
   - **App Check → Apps → your web app → Manage debug tokens**: after the first local run (next step) the console debug output shows a token — register it here. Debug tokens are accepted for this hackathon; never commit one.
3. **Configure and run**
   ```bash
   cd app
   cp .env.example .env.local   # paste your web app config values
   npm install
   npm run dev
   ```
   Open the localhost URL in Chrome. Without Nano (other browsers, model not downloaded), every feature still works — the SDK falls back to the cloud model and the routing badge says so.

## Layout

- `app/` — Vite + React + TypeScript app (`src/lib/router.ts` the router, `src/lib/ai.ts` all Firebase AI Logic calls, `src/lib/briefs.ts` Firestore library)
- `docs/PLAN.md` — build plan and decision log
- `LICENSE` — Apache License 2.0

## Notes

- Firebase web config values are public client identifiers; real protection is App Check + Firestore rules, both configured as above.
- Text inference runs on the free tier within usage limits. No billing account is required.
