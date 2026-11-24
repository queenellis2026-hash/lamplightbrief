# LamplightBrief

**Job briefs a judge panel could actually rule on** — drafted privately on your device, audited deeply in the cloud.

> The name is the house's: LamplightBrief grows out of Lamplight Pay's escrow work — the dispute problem it solves is the one Lamplight Pay's panels run into. (The hosted URL, clearbrief-hybrid.web.app, predates the rename — Firebase project IDs are immutable, so the plumbing kept its original name.)

Built for **#BuildHybridAI 2026** (Firebase AI Logic hybrid inference). Live demo: https://clearbrief-hybrid.web.app

## Judge quick-start (2 minutes)

1. Open https://clearbrief-hybrid.web.app in **Chrome desktop 139+**.
2. Click **"Sample: logo job (vague)"**, then **Draft brief**. Watch the **routing log**: every call shows the router's reason and the SDK-reported badge for where the model actually ran.
3. Click **Deep dispute-readiness audit**. Before anything is transmitted, a **confirmation panel shows the exact redacted text** — click **"Send redacted version"**. The audit returns a score with quoted problem clauses and one-click rewrites, plus an "Exactly what was sent to the cloud" viewer.
4. **On-device path:** enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart Chrome, then use the **"Initialize on-device model"** button in the header (Gemini Nano downloads on first use). The header pill shows Nano's live status: available / downloading / downloadable / unavailable. Without Nano, the app still works — local-first tasks fall back to the cloud **with the redacted copy only, after your confirmation** — and the routing log says exactly that.
5. **Offline path:** toggle your network off and request a deep audit — it queues visibly (with the payload you confirmed) and runs automatically when you reconnect.

## What it does

LamplightBrief is for people hiring AI agents and freelancers through escrow (the Lamplight Pay problem: a dispute panel can only rule on what the job post actually said). Paste rough job notes and LamplightBrief:

1. **Drafts a clean brief** — deliverable, deadline, budget, acceptance criteria, revision terms, evidence to deliver — as structured JSON.
2. **Scans for private details on-device only** — emails, payment handles, addresses and similar identifiers are flagged where the text already lives. This pass never transmits.
3. **Audits dispute-readiness in the cloud** — ambiguity, unmeasurable acceptance criteria, scope-creep openings, missing evidence terms — with a 0–100 score, quoted problem clauses, and one-click rewrites. The cloud receives a **redacted** copy only, shown to you for confirmation before it is sent.
4. **Saves finished briefs** to a personal Firestore library (anonymous auth, per-user rules).

## The idea: privacy-tiered hybrid routing

The reusable contribution is the routing pattern, not just this app: **give each model the job that matches its trust level and its size.** The small on-device model is trusted with raw text because it never transmits it. The large cloud model does the judgement-heavy reasoning but only ever sees redacted text, confirmed by the user. Any app that handles sensitive text — contracts, medical notes, support tickets — can use the same pattern.

A **custom router** (`app/src/lib/router.ts`) decides where each request runs, in this order, and the routing log shows its reasoning plus the SDK's own `inferenceSource` report for every call — including failures:

1. **Sensitivity** — deterministic local detectors (regex: emails, phones, payment handles, token-bearing URLs, street addresses, crypto addresses) run before any AI call. The privacy scan is `ONLY_ON_DEVICE`. Before any cloud call, the user sees the exact redacted payload and must confirm it.
2. **Complexity** — short structured tasks (draft, completeness, rewrite) use `InferenceMode.PREFER_ON_DEVICE`; the dispute-readiness audit uses `PREFER_IN_CLOUD` with **`gemini-3.5-flash-lite`** (the current free-tier model for new projects; the earlier `gemini-2.5-flash-lite` is retired for new users).
3. **Connectivity** — offline, the audit is queued (payload confirmed first, stored locally, indicator shown) and flushed automatically on reconnect.
4. **Availability** — if Gemini Nano is not available in the browser, local-first tasks fall back to the cloud **with redacted text only, after user confirmation**; the routing log states this explicitly. The badge always reports where the model *actually* ran.

On-device calls are single-turn with structured (JSON schema) output, respecting the hybrid SDK's limits: no chat, no tools on-device. `initializeDeviceModel()` is called from the user's click, before the first prompt, per Chrome's user-activation requirement. Transient cloud errors are retried with backoff; if the pinned audit call fails, it retries once without the response schema and the log says so.

All AI inference goes through **Firebase AI Logic** (`firebase/ai`) — Gemini Nano on-device via the Chrome Prompt API, Gemini in the cloud via the Gemini Developer API, one SDK. No other model API is called for inference anywhere in the app. (The header's Nano status pill reads availability from the platform Prompt API surface the SDK itself wraps — a status read, not inference.)

Other Firebase products used: **App Check — ENFORCED** for AI Logic (reCAPTCHA Enterprise in production, debug tokens for local dev), **Firestore** + **Anonymous Auth** (brief library), **Hosting**. Everything runs on the free **Spark** plan; no billing account exists on the project.

## The audit score rubric (published)

The 0–100 dispute-readiness score is the sum of points across five areas, stated in the audit prompt itself:

| Area | Points |
| --- | --- |
| Deliverable clarity | 25 |
| Measurable acceptance criteria | 25 |
| Timeline specificity | 15 |
| Payment and evidence terms | 20 |
| Revision and scope terms | 15 |

## Run it locally

Requirements: Node 20+, Chrome desktop **139+** for on-device inference.

1. **Enable Gemini Nano in Chrome**
   - Update Chrome (`chrome://settings/help`).
   - Set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to **Enabled** and restart Chrome.
   - Use the app's **"Initialize on-device model"** button, or in DevTools console run `await LanguageModel.create()` and wait for the model download.
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
   Open the localhost URL in Chrome.

## Layout

- `app/` — Vite + React + TypeScript app (`src/lib/router.ts` the router, `src/lib/ai.ts` all Firebase AI Logic calls, `src/lib/briefs.ts` Firestore library)
- `docs/PLAN.md` — build plan, decision log, execution log
- `docs/SUBMISSION.md` — the Devpost submission text
- `LICENSE` — Apache License 2.0

## Notes

- Firebase web config values are public client identifiers; real protection is App Check + Firestore rules, both configured as above.
- Text inference runs on the free tier within usage limits. No billing account is required.
- Built Nov 24, 2026 (app, Firebase project, repo); the Devpost submission was prepared Nov 24–29, 2026.
