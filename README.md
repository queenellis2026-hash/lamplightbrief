# LamplightBrief

**Job briefs a judge panel could actually rule on** — drafted privately on your device, audited deeply in the cloud.

> LamplightBrief grows out of Lamplight Pay, our live agent-escrow product, whose dispute panels supplied the problem; no code is shared. (The hosted URL predates the rename — Firebase project IDs are immutable.)

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
2. **Scans for private details on-device only** — two layers, both local: deterministic detectors (plain pattern-matching code — emails, money amounts, payment handles, addresses and similar identifiers) that run instantly with no AI and no network, and an AI privacy scan that runs `ONLY_ON_DEVICE` when Gemini Nano is available. Neither ever transmits your text.
3. **Audits dispute-readiness in the cloud** — ambiguity, unmeasurable acceptance criteria, scope-creep openings, missing evidence terms — with a 0–100 score, quoted problem clauses, and one-click rewrites. The cloud receives a **redacted** copy only, shown to you for confirmation before it is sent.
4. **Saves finished briefs** to a personal Firestore library (anonymous auth, per-user rules).

## The idea: privacy-tiered hybrid routing

The reusable contribution is the routing pattern, not just this app: **give each model the job that matches its trust level and its size.** The small on-device model is trusted with raw text because it never transmits it. The large cloud model does the judgement-heavy reasoning but only ever sees redacted text, confirmed by the user. Any app that handles sensitive text — contracts, medical notes, support tickets — can use the same pattern.

A **custom router** (`app/src/lib/router.ts`) decides where each request runs, in this order, and the routing log shows its reasoning plus the SDK's own `inferenceSource` report for every call — including failures:

1. **Sensitivity** — deterministic local detectors (regex: emails, money amounts, phones, payment handles, token-bearing URLs, street addresses, crypto addresses) run before any AI call. The privacy scan is `ONLY_ON_DEVICE`. Before any cloud call, the user sees the exact redacted payload and must confirm it.
2. **Complexity** — short structured tasks (draft, completeness, rewrite) use `InferenceMode.PREFER_ON_DEVICE`; the dispute-readiness audit uses `PREFER_IN_CLOUD` with **`gemini-3.5-flash-lite`** — the model we used, per [Firebase AI Logic's model documentation](https://firebase.google.com/docs/ai-logic).
3. **Connectivity** — offline, the audit is queued (payload confirmed first, stored locally, indicator shown) and flushed automatically on reconnect.
4. **Availability** — if Gemini Nano is not available in the browser, local-first tasks fall back to the cloud **with redacted text only, after user confirmation**; the routing log states this explicitly. The badge always reports where the model *actually* ran.

What Nano adds beyond cloud + client-side redaction: it drafts and checks the **raw** text itself, so nothing is lost to redaction, and drafting keeps working **fully offline**. Redaction-plus-cloud is the fallback, not the design.

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

## See it without running it (captured from a real run, Nov 24, 2026)

The built-in sample notes are:

> Need a logo for my food truck, something modern. Pay $150 when done. Want it soon, a couple of revisions ok. Contact me at bigmike.eats@gmail.com or $BigMikeEats on Cash App.

Before the cloud draft ran, the confirmation panel showed this exact payload — and this is all that was transmitted:

> Need a logo for my food truck, something modern. Pay [MONEY_AMOUNT_1] when done. Want it soon, a couple of revisions ok. Contact me at [EMAIL_1] or [PAYMENT_HANDLE_1] on Cash App.

The deep audit of the drafted brief scored **30/100** ("Unsafe for escrow. The brief lacks measurable acceptance criteria, clear revision limits, and relies on off-platform communications and payments"), with flags including:

- HIGH — "Design a modern logo for a food truck." → rewrite: "Deliver three distinct vector logo concepts in AI, EPS, and PNG formats, suitable for print and vehicle wrap."
- HIGH — "The agreed budget is $150, payable upon completion." → rewrite: "The total budget is $150, held in escrow and released upon the client's written approval of the final logo files."
- HIGH — "Contact the client at [EMAIL_1] or via Cash App at [PAYMENT_HANDLE_1]." → rewrite: "All communications and milestone submissions must be conducted through the official escrow platform."

Applying the three high-severity rewrites and re-auditing scored **60/100**.

## How the security pieces were checked

- **App Check:** the Firebase console shows App Check **Registered (Enforced)** for AI Logic on this project, with a reCAPTCHA Enterprise key whose registered domains are the two Hosting domains. The live app presents a reCAPTCHA Enterprise token with every AI call; local development uses a registered debug token, per Firebase's App Check flow (see Run it locally).
- **Firestore rules:** `users/{uid}/briefs/{briefId}` — a request is allowed only when `request.auth.uid == uid`. Exercised through the app itself: anonymous sign-in, then save/load of the signed-in user's own briefs succeeds. The rules file is in the repo (`app/firestore.rules`) for inspection.

## Known limitations (stated plainly)

- **Names are not reliably detectable by pattern matching**, and the detectors do not claim to catch them. The mitigation is the human gate: before anything is transmitted, you see the exact payload and can cancel. Detector coverage today: emails, money amounts ($ figures, USD amounts, per-hour rates), phone numbers, payment handles, token-bearing URLs, US street addresses, and 0x crypto addresses.
- The audit judges the brief you give it; applying rewrites with Nano unavailable sends the redacted brief (placeholders restored locally in the result), so a rewrite can occasionally smooth over a placeholder instead of the original wording.

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
- Built Nov 24, 2026 (app, Firebase project, repo); this submission is being prepared during the Nov 24–29, 2026 window.
