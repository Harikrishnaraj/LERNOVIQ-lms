# DPIA decision log

F-445 (T-287). For each kind of processing that can need a data protection impact assessment, this file
records whether one is needed, what the platform does today, and what is still open. Nothing in this file
says the platform is GDPR compliant. Every **Requires Legal Decision** item needs sign-off by whoever is the
controller's privacy lead before launch.

Status words: **Decided** (an engineering decision, implemented), **Proposed** (engineering view, waiting for
legal sign-off), **Requires Legal Decision**, **Not Applicable** (the platform does not do this today).

## 1. Profiling and automated decisions

- **What happens:** course completion and certificates are issued automatically when a learner finishes the
  required lessons and passes the required assessments. Reports list idle learners, per-learner progress and
  time spent. Nothing scores, ranks or predicts a learner's behaviour, and no decision with legal or similarly
  significant effect is taken without a person.
- **DPIA needed:** **Proposed: no.** Completion follows published course rules the learner can see. Where a
  customer uses completion for employment decisions, that is the customer's processing. **Requires Legal
  Decision.**
- **Safeguards in place:** the learner sees their own progress and certificates; the rules are on the course
  page; objection and rectification requests go through the subject-request queue (T-286).

## 2. Monitoring of learners

- **What happens:** time spent per lesson per day (`lesson_time`, T-292), last activity, login history.
  Employer customers (org admins) see this for members of their own organisation.
- **DPIA needed:** **Proposed: yes, before selling to employers.** Systematic monitoring of employees is a
  standard trigger. **Requires Legal Decision.**
- **Safeguards in place:** time is stored as minutes per lesson per day, not a click stream; org admins are
  limited to their own organisation; login history is deleted after 12 months (`purge-operational-data-daily`).
- **Open:** a notice to learners in an organisation that their organisation can see their progress and time.

## 3. Sensitive (special category) data

- **What happens:** the platform does not ask for health, religion, ethnicity, biometrics or similar data.
  There is no webcam proctoring. Free text (profile bio, discussions, assignment answers, privacy requests)
  could contain it if a person types it in.
- **DPIA needed:** **Not Applicable** for collection by design. Free text is handled under the ordinary
  categories in `docs/PRIVACY_REGISTER.md`.
- **Open:** if proctoring or accessibility needs are ever recorded, this section must be reassessed first.

## 4. AI processing

- **What happens today:** no AI provider is called. The AI tutor and instructor AI (T-200 to T-204, T-224)
  are not built.
- **DPIA needed:** **Proposed: yes, before T-200 ships.** It sends learner questions and course content to an
  outside model provider.
- **Decisions to carry into T-200:** send no name, email or user id to the provider; record usage against the
  user inside the platform only; tell learners in the tutor UI that answers come from AI; provider retention
  and training use must be set off by contract. **Requires Legal Decision** on the provider and transfers.

## 5. Analytics: aggregated or pseudonymised where identity is unnecessary

| Output | Identity needed? | What it contains | Status |
| --- | --- | --- | --- |
| Admin dashboard (daily trend, top courses) | No | Counts per day and per course | Decided |
| Instructor course analytics | No | Counts and rates per course and lesson | Decided |
| Module and library usage reports, and their CSVs | No | Learner counts per lesson, course, customer, licence | Decided |
| Idle users, user progress, user duration (on screen) | Yes: the admin has to contact or help that learner | Name and user id | Decided |
| Idle users, user progress, user duration (CSV export) | No: a file that leaves the platform | User id only, never name or email | Decided |
| API request log | Yes, for investigating key misuse | API key, path, status, IP; deleted after 90 days | Decided |

A unit test (`tests/unit/dpia.test.ts`) fails if a name, email or IP column is ever added to a report CSV.
