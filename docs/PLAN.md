# #BuildHybridAI — Plan (Firebase lane, Ellis)
Date drafted: Tue Nov 24, 2026, 10:19 AM CT
Registration: VERIFIED Nov 24, 10:23 AM CT — Devpost showed "Thanks for registering!" and "You're registered for this hackathon." (queenellis2026@gmail.com, solo, Web). No project submitted yet.
Deadline (verified on Devpost FAQ, Nov 24): **Mon Nov 30, 2026, 2:00 PM PT = 4:00 PM CT / 5:00 PM ET**. No extensions, submission locks at deadline, repo commits after deadline not evaluated.
Target: Best Web/Chrome App ($3,000); Grand/Runner-Up stretch.

## Decision log
- Nov 24, 10:26 AM CT: Chris stopped the lane to review three outside idea files (LocalCut, Pocket Sage, Idea 2 second-brain).
- Nov 24, 10:32 AM CT: **Chris ruled — Keep ClearBrief, add the custom router.** LocalCut rejected (image generation needs a billing-quota request by Nov 25 noon CT, accounts land Nov 27; autocomplete claim not real for single-turn Nano). Pocket Sage rejected as a standalone (crowded second-brain category; its "on-device semantic search" bullet is not buildable — Nano via Firebase AI Logic is text generation only). Idea 2's custom router + routing log are adopted into ClearBrief below.

## Custom router (adopted from Idea 2, Nov 24)
Every request passes a local router before any model call. The router decides — and the UI shows its reasoning in a live routing log:
1. **Sensitivity first:** deterministic local detectors + the on-device privacy scan run first. Raw text containing identifiers is never sent to the cloud unredacted; the user sees and approves the redacted version.
2. **Complexity second:** short, structured tasks (draft, completeness checklist, rewrite) route `PREFER_ON_DEVICE` / `ONLY_ON_DEVICE`. Long documents or the dispute-readiness audit route `PREFER_IN_CLOUD`.
3. **Connectivity third:** `navigator.onLine` + a failed cloud call demotes the request to on-device and queues the cloud audit for when connectivity returns.
4. **Availability always:** if Nano is unavailable, `PREFER_ON_DEVICE` falls back to cloud and the badge says so honestly.
Every response carries a routing badge ("On-device · privacy scan", "Cloud · redacted · deep audit", "On-device · offline fallback") and an entry in the routing log with the reason, latency, and `inferenceSource`.

## Concept as built: ClearBrief
A judge-ready job-brief builder for people hiring AI agents / freelancers through escrow (the Lamplight Pay problem: a dispute panel can only rule on what the job post actually said).

User pastes rough notes for a job. ClearBrief turns them into a brief a third party could adjudicate — and proves the hybrid split in the UI on every run:

1. **Draft + completeness check — ON-DEVICE** (`InferenceMode.PREFER_ON_DEVICE`, structured JSON output)
   - Rewrites rough notes into a clean brief: deliverable, deadline, budget, acceptance criteria, revision terms, evidence to deliver.
   - Returns a structured completeness checklist + missing-fields list.
   - Why on-device: job notes routinely contain names, rates, private business details. Private, free, works offline. Nothing leaves the browser for this pass.
2. **Privacy scan — ON-DEVICE ONLY** (`ONLY_ON_DEVICE`)
   - Flags emails, payment handles, addresses, and other identifiers in the draft *before* any cloud pass, so the user can redact first. This is the non-obvious hybrid move: the small local model is trusted with raw text precisely because it never transmits it.
3. **Deep dispute-readiness audit — CLOUD** (`PREFER_IN_CLOUD`, inCloudParams: gemini-3.5-flash-lite class model, free tier)
   - Long-context risk audit the on-device model is too small for: ambiguous acceptance criteria, scope-creep openings, missing evidence terms, contradictory deadlines/budget, unfair or un-rulable clauses.
   - Output: dispute-readiness score (0–100), flagged clauses with quoted text, and concrete rewrite suggestions the user can apply with one click.
4. **Inference transparency (judging surface)**
   - Every result carries a badge from `response.inferenceSource` (on-device / cloud / fallback) plus latency. A "simulate no Nano" path is just the real fallback — no fake demo mode.
   - Setup panel shows Chrome ≥139 + Prompt API flag status and on-device model availability/download progress via `initializeDeviceModel()` (called on user click, per Chrome user-activation rule).

## Stack
- Vite + React + TypeScript (fast, familiar, deployable as static site)
- Firebase JS SDK **v12.5.0+** (required minimum for web hybrid): `firebase/app`, `firebase/ai` (`getAI`, `GoogleAIBackend`, `getGenerativeModel`, `InferenceMode`), `firebase/app-check` (debug provider locally; reCAPTCHA Enterprise / debug token for hosted demo — debug tokens accepted for submissions, never committed)
- Firestore + Anonymous Auth: save finished briefs + audit history (genuinely used: a brief library the user can reopen). No PII in Firestore by default — privacy scan runs first.
- Remote Config: cloud fallback model name + audit score thresholds, so tuning needs no redeploy.
- Hosting: Firebase Hosting (free Spark tier) for the hosted URL judges are strongly encouraged to have.
- Repo: public GitHub `queenellis2026-hash/clearbrief` (to create via website route — connector can't create repos), Apache-2.0 LICENSE at root (detectable in About), README with setup: Chrome flags, Firebase project + AI Logic (Gemini Developer API, no billing), App Check debug token registration, `npm install && npm run dev`.
- **No Google Account Quota request**: text inference only, free tier is enough. The Nov 25, 10 AM PT quota sprint is for billing-required models (image/TTS) we don't use — skipping it deliberately.

## Hard technical facts from the official Web guide (verified Nov 24)
- On-device = Chrome Desktop ≥139, Prompt API, flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`; SDK handles fallback.
- On-device supports single-turn text (+ JPEG/PNG image) and structured JSON/enum output only — **no multi-turn chat, no tools/function-calling on-device**. Design respects this: all on-device calls are single-turn structured prompts; chat-style interaction is UI state, not model chat.
- `initializeDeviceModel()` must be called on/after a user interaction, before first prompt.
- App Check is auto-enforced when AI Logic is enabled in console; debug provider for localhost.
- All AI inference must go through Firebase AI Logic — no direct calls to other model APIs anywhere in the app.

## Day-by-day (CT)
- **Tue Nov 24** — Register on Devpost (in progress). Create Firebase project (free, Gemini Developer API, no billing) + GitHub repo skeleton with LICENSE/README. Scaffold Vite app, wire Firebase config via `.env.local` (gitignored).
- **Wed Nov 25** — Core build day 1: brief editor, on-device draft + structured completeness, privacy scan, inferenceSource badges, App Check debug flow working on localhost in Chrome with Nano.
- **Thu Nov 26** — Core build day 2: cloud dispute-readiness audit, score UI, one-click rewrites, Firestore brief library + anonymous auth, Remote Config. End-to-end pass in a browser *without* Nano (fallback proof).
- **Fri Nov 27** — Polish/design day: complete-product feel (empty states, sample briefs, history), deploy to Firebase Hosting, verify hosted build live. **Draft the full Devpost submission this day** (text, repo link, testing instructions incl. Chrome flag steps) — draft saved, not last-day work.
- **Sat Nov 28** — Buffer / fixes from a cold self-review. Coordinate demo video with Production lane via main (≤3 min, first 30s: who it's for + hybrid working). Upload video early (processing can take hours).
- **Sun Nov 29** — Final verification: repo license detectable, hosted URL live, video public, Devpost form complete. Submit by end of day Nov 29 — **a full day early**.
- **Mon Nov 30** — Deadline day is contingency only. Verify Devpost page shows Submitted; no commits after 4 PM CT lock.

## Execution log (Nov 24)
- Firebase project clearbrief-hybrid reused (created by the stopped run); Spark free; AI Logic (Gemini Developer API) + App Check (reCAPTCHA Enterprise, enforced) + Firestore (nam5) + Anonymous Auth + per-user rules — all live.
- App built (Vite/React/TS, Firebase SDK 13.4.0), deployed to https://clearbrief-hybrid.web.app; verified end-to-end in a real browser over three passes: draft renders readable prose; audit scored the vague sample 5/100 with 5 HIGH flags; redaction viewer shows [EMAIL_1]/[PAYMENT_HANDLE_1]; privacy scan errors cleanly on-device-only when Nano is absent; Firestore save/load works.
- Live-verification catches, fixed and redeployed: gemini-2.5-flash-lite retired for new users → gemini-3.5-flash-lite; cloud models wrap JSON in code fences → parser strips them; transient 500s → retry with backoff + fallback to default cloud model; routing log now records failed attempts.
- Repo: https://github.com/queenellis2026-hash/clearbrief (Apache-2.0 detected), HEAD 63ab564.
- Devpost draft created: submission 1319067-clearbrief, 3/5 steps — everything filled except the demo video URL (the only blocker). Draft NOT submitted.
- CLI quirk worth remembering: firebase-tools configstore chown fails on this VM's home FS — run the CLI with HOME=/tmp/fbhome.

## Risks / open items
- Firebase project creation is done in the Firebase console under Ellis's Google account (queenellis2026@gmail.com) — try Ellis's own route first; flag to main only if a step is genuinely human-gated (e.g. a verification Chris must do), with exact steps.
- Gemini Nano availability depends on the test Chrome's model download; the app must be fully demoable on cloud fallback alone, and the video must show the on-device path actually firing (inferenceSource badge) — record on a Chrome profile where Nano is confirmed `available` first.
- No spend: Spark/free tiers only. No billing account setup without Chris's explicit word via main.
- Nov 24: NAME RULING (Chris, via main): the product is renamed **LamplightBrief** (collision-checked clear). Display name changes everywhere user-facing; Firebase project/hosting URL stay clearbrief-hybrid (immutable); the "unaffiliated" disclaimer is superseded by a provenance line (name is the house's, from Lamplight Pay's escrow work). Tagline: "LamplightBrief — judge-ready job briefs, drafted on-device, audited in the cloud."
