# LamplightBrief — demo video script + shot list (builds lane, Nov 25, 2026)

Constraints: ≤3:00 total, public YouTube, English. App is FROZEN — record
what's live. Narration: Ellis's voice (Helio, series standard). Name on
camera and in narration: **LamplightBrief** (never ClearBrief).
Recording window: Fri Nov 27 / Sat Nov 28, 2026. Submission target
Sun Nov 29; hard deadline Mon Nov 30, 16:00 CT.

Beats (main's confirmed order; beat 1 re-planned Nov 25 — see
"Capture route" at the bottom):
1. The honest fallback: pill reads unavailable, Initialize attempted
   (routing log shows it), then the DRAFT step hits the redaction
   gate — raw text withheld, redacted copy confirmed, cloud drafts
   only after confirmation. Narration states plainly that on a
   Nano-capable machine this runs on-device. Never simulate.
2. The gate moment: confirmation panel with the exact redacted payload
   from the "Sample: logo job (vague)" sample — [MONEY_AMOUNT_1],
   [EMAIL_1], [PAYMENT_HANDLE_1] — and the "Send redacted version" click.
3. Score climb: weak brief audits low (lane-verified 30/100), apply the
   high-severity rewrites through the gate, completeness auto re-checks,
   re-audit climbs (lane-verified 60/100). Per-category rubric scores
   shown under the verdict get a beat of screen time.
Routing log stays visible throughout — it's the explainer.
Wi-Fi-off / offline-queue beat only if time remains after the three
centerpieces (priority: cut it first).

## Narration script (target ~2:45 at ~180 wpm ≈ 495 words)

**[0:00–0:25 — the problem, app on screen]**
"Hi, I'm Ellis. When two people argue over an escrow job, the fight is
almost never about the work. It's about the job post — the brief that
never said what 'done' means. No judge, human or AI, can rule on a
brief like that. LamplightBrief writes job briefs a dispute panel
could actually rule on. Watch what happens with a real one."

**[0:25–1:05 — the honest fallback: gate before draft]**
"This is the kind of note people actually paste in: a logo, pay when
done, contact me here. LamplightBrief prefers to draft on-device with
Gemini Nano — but this machine can't run it, and the app says so right
on the status pill. Watch what it does instead. I try to initialize
the on-device model; the routing log records the attempt. Then the
draft: the raw text is withheld, and the gate shows me the redacted
copy — the amount, the email, and the payment handle already replaced
— before anything is sent. Nothing leaves this machine until I
confirm. On a Nano-capable machine, this step never leaves at all."

**[1:05–1:45 — the gate + cloud audit]**
"The deep audit is the judgment-heavy part, so it runs in the cloud —
but nothing goes until I say so. Here's the gate: this panel shows the
exact text that would be sent. The amount, the email, the Cash App
handle — all redacted to placeholders before anything leaves. I click
'Send redacted version,' and the cloud model scores the brief:
[READ THE ON-SCREEN SCORE — verified run Nov 25: 15/100; the score is
model-generated and varies run to run, so narration is recorded AFTER
capture, to the numbers on camera]. The rubric breaks it down by
category — deliverable clarity, acceptance criteria, timeline,
payment evidence, revision scope — and every flag quotes the problem
clause and offers a concrete rewrite."

**[1:45–2:25 — the score climb]**
"So I apply the high-severity rewrites — each one passes through the
same gate. The completeness check re-runs on its own, and the brief is
audited again. [READ THE ON-SCREEN SCORE — lane-verified climb to
60/100; record to the number on camera]. Same brief, same writer — the
difference is that now a judge could rule on it. And the app shows me
exactly what was sent to the cloud, word for word."

**[2:25–2:45 — save + recap]**
"The finished brief saves to the library under my account. That's
LamplightBrief: one SDK, two models — the small one trusted with the
raw text because it never transmits it, the large one doing the hard
reasoning on redacted text only. Each model does the job that matches
its trust level. The link's below — try the vague logo job yourself."

## Shot list (exact clicks, from app source + live verification)

1. App loaded, full window: title, status pill, Initialize button,
   sample buttons, routing log all in frame.
2. Click "Sample: logo job (vague)" — notes box fills.
3. Click "Initialize on-device model" — the routing log records the
   attempt; the pill reads unavailable on this machine (hold on pill +
   log entry).
4. Click Draft brief — the gate panel "Confirm cloud send — draft"
   appears with the redacted raw notes ([MONEY_AMOUNT_1], [EMAIL_1],
   [PAYMENT_HANDLE_1]); hold on the payload, then click "Send
   redacted version" — structured brief appears; routing log shows
   the Cloud badge + fallback explanation (hold on the log).
5. Privacy scan result visible (findings: email / payment handle /
   money amount).
6. Click Deep audit — gate panel appears with redacted payload
   ([MONEY_AMOUNT_1], [EMAIL_1], [PAYMENT_HANDLE_1]) — hold 2–3 s on
   the payload, then click "Send redacted version".
7. Audit result: score 30/100, per-category rubric scores, verdict,
   flags with rewrites (hold on the rubric).
8. Apply high-severity rewrites — the app has an "Apply all
   high-severity rewrites" button (verified live); each apply passes
   the gate again — keep clicks visible, don't cut them out.
9. Completeness re-check appears; re-audit → score climbs (hold on
   the new score).
10. "Exactly what was sent" viewer opened briefly.
11. Save to library; library list shows the saved brief.
12. (Only if time) Wi-Fi off → draft still works → audit queues →
    reconnect → queued audit runs.

## Live verification (Nov 25, 2026, cloud browser drive)

Full flow works end to end at https://clearbrief-hybrid.web.app — no
App Check / reCAPTCHA block. Confirmed on the live surface:
- Title/heading "LamplightBrief"; pills: Online, Firebase connected,
  Gemini Nano status; "Initialize on-device model" button; three
  sample buttons; routing log with the sensitivity → complexity →
  connectivity → availability explainer.
- Logo sample fills the notes; local check reads "3 identifiers
  spotted — money-amount, email, payment-handle."
- Audit gate payload (exact): "The freelancer is required to design a
  modern logo for a food truck. The payment for this deliverable is
  [MONEY_AMOUNT_1] upon completion. A couple of revisions are
  acceptable. Contact can be made via [EMAIL_1] or through Cash App
  at [PAYMENT_HANDLE_1]."
- Audit result on that run: **15/100** with per-category rubric
  (Deliverable clarity 8/25 · Acceptance criteria 0/25 · Timeline
  0/15 · Payment & evidence 2/20 · Revision & scope 5/15), 5 flags
  (4 HIGH, 1 MEDIUM), "Apply all high-severity rewrites" present.
  Scores are model-generated and vary per run — narration reads the
  on-camera numbers.
- Without Nano, the DRAFT also gates ("Confirm cloud send — draft")
  and falls back to cloud with the redacted payload. Since no house
  machine can run Nano (settled Nov 25), this gated draft IS the
  filmed beat 1 — the fallback demonstrates the gate twice (draft +
  audit), which strengthens the "nothing leaves without
  confirmation" story.

## Capture route — SETTLED (Chris + main, Nov 25, 2026, ~23:18 CT)

**The book cannot run Gemini Nano.** Chris worked it live with main:
Prompt API flag Enabled + restart → pill still "unavailable";
chrome://on-device-internals shows "Device performance class: Error"
with an empty broker; the bypass flag no longer exists in Chrome 158.
ChromeOS wants Chromebook Plus-class hardware; the book is below the
bar, and phones are out for the web Prompt API. No machine in the
house can run it.

**Beat 1 re-planned around the honest fallback** (script + shot list
above are already rewritten): film on the book's Chrome; pill reads
unavailable; Initialize is attempted (routing log shows it); the
DRAFT step hits the redaction gate — raw text withheld, redacted
copy shown for confirmation, cloud drafts only after the user
confirms. Narration says plainly that on a Nano-capable machine this
step runs on-device, and on this one the gate is what protects the
raw text. **Never simulate an on-device run.** This is the app's
designed behavior, and the routing log shows its work — the fallback
is itself a feature demonstration. Filming window Fri Nov 27 stands.
