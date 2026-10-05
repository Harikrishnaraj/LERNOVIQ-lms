# MODERN LMS — IMPLEMENTATION GAP AUDIT (re-run)

```text
MODERN LMS
IMPLEMENTATION GAP AUDIT

Audit Date:        2026-10-05
Repository/Build:  harikrishnaraj/modern-lms — Next.js 16.3.6 (App Router) + Supabase
Version/Commit:    f3c8333 (main) "Merge pull request #1 from Harikrishnaraj/main-p2cnzw"
Previous audit:    IMPLEMENTATION_GAP_AUDIT_2026-09-28.md at ab314e3 (85 commits earlier)

Portals Audited:
- Learner
- Instructor
- Admin (incl. the new scoped Org Admin portal)
(+ cross-cutting: auth, course lifecycle, commerce, AI, RAG, platform)

Total Features Audited:  98  (every row of docs/FEATURES.md)

Implemented:             76   (was 43)
Partially Implemented:    8   (was 14)
UI Only:                  0
Mock/Demo:                0
Backend Only:             0   (was 2)
Missing:                 14   (was 39)
Blocked:                  0
```

> **Scope rule.** Report only — no application code was changed. The feature inventory is
> `docs/FEATURES.md` (98 features). Nothing outside that registry is counted as "expected".

---

## 0. Method, evidence and limits

### 0.1 What was inspected

- Docs: PRD, ARCHITECTURE, DESIGN, DECISIONS (ADR-001–036), MEMORY, SECURITY, TEST_PLAN, FEATURES,
  TASKS, DEPLOY, RUNBOOKS.
- 473 files under `src/`, 84 migrations (75 tables), `.github/workflows/{ci,backup}.yml`,
  `deploy/docker-compose.yml`, `next.config.ts`.
- Every "Done when" bar for features still open, every gap from the previous audit, and an
  existence check (UI → action → table) for each feature ticked since then.

### 0.2 Checks

| Check | Where | Result |
| --- | --- | --- |
| `npm ci`, `typecheck`, `lint` | this audit | ✅ pass |
| `vitest run` | this audit | ✅ 679 passed, 479 skipped (live-Supabase suites skip without env), 0 failed |
| `npm run build` | this audit | ✅ pass with placeholder `NEXT_PUBLIC_SUPABASE_*` values. Without them, prerendering `/admin/settings`, `/admin` and `/instructor/resources` throws by design (`src/lib/supabase/env.ts`). Environmental, not a defect. |
| `npm run features` | this audit | Ledger **83/98 (85%)**, tasks 116/139. Next task: T-180. |
| `npm run features:strict` | this audit | ❌ fails (commerce, AI, RAG, T-248/T-250 open) |
| CI on `main` @ `f3c8333` | GitHub Actions | ✅ Check (incl. integration on a local Supabase stack, ADR-034) + **6/6 E2E shards** + **Deploy to VPS** all `success` |

### 0.3 Limits

- **Integration and E2E were not run in this container** (no Supabase credentials). Runtime
  evidence comes from the green CI run above, which executes them against a local Supabase stack.
- **The prototype files are not in the repo.** Screens were compared against the element lists in
  `MEMORY.md` / `DESIGN.md`, not visually.

### 0.4 Ledger vs. this audit

The ledger says 83 complete; this audit finds **76**. Seven ledger-complete features fall short of
their "Done when" bar in code: **F-103, F-107, F-112, F-215, F-216, F-401, F-403** (§3). The other
15 ledger-incomplete features match this audit: F-947 (partial) and the 14 missing commerce/AI/RAG
features. 83 − 7 = 76.

---

## 1. What changed since the previous audit

| Previous gap | Status now |
| --- | --- |
| GAP-001 build broken at HEAD | ✅ fixed — typecheck/lint/tests/build pass; CI green |
| GAP-002 essay/coding attempts never graded | ❌ **still open** |
| GAP-003 paid enrollment refused | ❌ still open (commerce not started; ADR-031 defers provider) |
| GAP-004 learners can't read/reply to messages | ❌ still open |
| GAP-005 reviews management | ✅ T-109 done |
| GAP-006 revenue estimate / no replay metric | ❌ still open |
| GAP-007–009 instructor certificates, resources, settings | ✅ done (T-110–T-112) |
| GAP-014 calendar has no assessment dates | ❌ still open |
| GAP-015 / GAP-033 `org_admin` unscoped in admin console | ✅ fixed — scoped `/org_admin` portal; `portal.admin.access` revoked from `org_admin` |
| GAP-016 invite sends no email | ❌ still open — email delivery exists (T-141) but invites don't use it |
| GAP-017–031 admin screens (user detail … settings, profile) | ✅ all built; categories CRUD, certificate revoke/reissue, moderation queue, audit coverage done |
| GAP-032–036 organizations, scoped admin, assigned learning, reports, SSO | ✅ done (Google Workspace SSO, ADR-033) |
| GAP-037–046 commerce, AI, RAG | ❌ still missing (planned: `docs/RAG_PLAN.md`) |
| GAP-047–055 headers, rate limits, logging, privacy, a11y, responsive, perf, CI, backups | ✅ done except F-947 (previews T-248, production QA T-250) |
| GAP-056 test suites crash without env | ✅ fixed (`courses-rls.test.ts` guards client creation) |
| GAP-057 admin nav not role-filtered | ❌ still open (P3) |
| GAP-058 export returns raw error message | ❌ still open (P3) |
| GAP-059 misleading "not delivered" message | ❌ still open (P3) |
| GAP-060 MEMORY.md status stale | ❌ still open — "Current Status" still says Phase 1 / next task T-019 |

---

## 2. Feature classification

Legend: ✅ IMPLEMENTED · 🟡 PARTIAL · ⛔ MISSING. Rows not listed are ✅ (see §2.6).

### 2.1 Learner

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-103 | Enrollment | 🟡 | Free enrollment real. Paid refused: `src/features/enrollment/enroll.ts:27-28`. |
| F-107 | Assessments | 🟡 | Auto-graded types work. **Essay/coding attempts stay `submitted` forever**: no code or SQL sets `assessment_attempts.status = 'graded'`; the admin screen can only *filter* by it (`src/app/admin/assessments/page.tsx:160`). |
| F-112 | Calendar | 🟡 | Assignment due dates, past attempts, certificates. Assessments have no due/scheduled date column, so upcoming assessments can't appear (`src/features/calendar/events.ts:47-69`). |
| F-701 | AI Tutor | ⛔ | `/learner/ai-tutor` placeholder (also in the mobile bottom bar). |

### 2.2 Instructor

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-215 | Messaging | 🟡 | Instructor side complete. No learner messages route; learners get a notification copy only. RLS already lets learners read/send (`20260926100000_messaging.sql`). |
| F-216 | Analytics | 🟡 | Revenue = Σ list price of enrollments (`20260926110000_instructor_analytics.sql:72,201`); watch time = Σ resume position; no replay metric anywhere. |
| F-604 | Earnings & payouts | ⛔ | `/instructor/earnings` placeholder (T-186). |
| F-702 | AI drafting | ⛔ | `/instructor/ai` placeholder. |
| F-703 | AI insights | ⛔ | Nothing. |

### 2.3 Admin and Org Admin

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-401 | User management | 🟡 | All actions work and are audited. Invite still returns a link for the admin to hand over (`src/features/admin/user-actions.ts:157`, "No email is sent from here") although `services/email` now exists. |
| F-403 | Instructor management | 🟡 | Verification queue, list, detail, rating distribution, payout method all real. **"Detail with revenue" not met:** revenue is deliberately omitted until commerce exists (`20260926200000_admin_instructor_detail.sql:3-6`). Blocked by F-600, not a code defect. |
| F-603 | Refunds | ⛔ | — |
| F-605 | Revenue & commerce | ⛔ | `/admin/commerce` placeholder. |
| F-704 | AI management | ⛔ | `/admin/ai` placeholder. |
| F-802 | Knowledge base admin | ⛔ | `/admin/rag` placeholder. |

### 2.4 Cross-cutting

| ID | Feature | Status | Evidence |
| --- | --- | --- | --- |
| F-600–F-602 | Checkout, subscriptions, coupons | ⛔ | No adapter, tables or webhook. ADR-031 picked Stripe, then deferred the provider decision. |
| F-700 | AI platform | ⛔ | No SDK dependency, no `ai_*` tables. |
| F-800, F-801 | Ingestion, permission-aware retrieval | ⛔ | No `knowledge_*` tables, no pgvector. Plan: `docs/RAG_PLAN.md`. |
| F-947 | CI & deployment | 🟡 | CI (check + 6 E2E shards) and the VPS production deploy work (ADR-036). **Open:** per-PR preview deployments (T-248) and the production QA checklist (T-250, TEST_PLAN §23). |

### 2.5 Summary by status

- **Partial (8):** F-103, F-107, F-112, F-215, F-216, F-401, F-403, F-947.
- **Missing (14):** F-600–F-605, F-700–F-704, F-800–F-802.

### 2.6 Implemented (76)

F-001–F-008 · F-100–F-102, F-104–F-106, F-108–F-111, F-113–F-117 · F-200–F-214, F-217–F-220 ·
F-310 · F-005, F-400, F-402, F-404–F-417 (excl. F-401/F-403 above) · F-500–F-504 · F-900–F-903 ·
F-940–F-946, F-948.

Notes on implemented features that carry a caveat:

| Feature | Caveat |
| --- | --- |
| F-411 Moderation | Queue covers discussion and review reports with hide/restore/dismiss. "Ban" is done through suspension on the Users page; the queue itself has no ban/suspend action. |
| F-504 SSO | Google Workspace (OIDC) only, per ADR-033. No generic SAML/OIDC per organization yet. |
| F-220 Instructor payout details | Stored by the platform (`payout_method`, `payout_reference` in plain text), not tokenized via a payment provider as T-112's wording suggests. |
| F-941 Rate limiting | 12 buckets incl. uploads, exports, API, review reports. Signup relies on Supabase Auth's own limits (no app bucket). The limiter **fails open** on DB errors or a missing service key (`src/services/rate-limit/index.ts`). |

---

## 3. Main gap table

| ID | Portal | Feature | Expected | Current state | Status | Priority | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GAP-101 | Learner | Essay/coding grading (F-107) | Manual questions graded; course can complete | No grading path; course with such a question can never complete or issue a certificate | PARTIAL | **P0** | `features/completion/rules.ts:5`; `assessments/grading.ts:36` |
| GAP-102 | Learner | Paid enrollment (F-103 → F-600) | Enroll after verified payment | Refused server-side | PARTIAL | P1 | `enroll.ts:27-28` |
| GAP-103 | Cross | Checkout / orders / payments (F-600) | Verified, idempotent webhooks | Nothing; provider decision deferred (ADR-031) | MISSING | P1 | — |
| GAP-104 | Admin | Refunds (F-603) | Audited refund updates access | Nothing | MISSING | P1 | — |
| GAP-105 | Learner/Instructor | Two-way messaging (F-215) | 1:1 threads for both sides | Learner has no screen | PARTIAL | P1 | no `/learner/messages` |
| GAP-106 | Platform | Preview deploys + production QA (F-947) | Preview per PR; TEST_PLAN §23 passes | CI + prod deploy done; previews and QA checklist open | PARTIAL | P1 | T-248 `[~]`, T-250 `[ ]` |
| GAP-107 | Instructor | Analytics accuracy (F-216) | Real revenue, replay, watch time | Estimated revenue; no replay; position-based watch time | PARTIAL | P2 | `20260926110000_instructor_analytics.sql:72,201` |
| GAP-108 | Learner | Calendar assessments (F-112) | Assessments on correct dates | No assessment date field | PARTIAL | P2 | `calendar/events.ts` |
| GAP-109 | Admin | Instructor revenue (F-403) | Detail with revenue | Omitted until commerce | PARTIAL | P2 | `20260926200000_admin_instructor_detail.sql:3-6` |
| GAP-110 | Admin | Invite email (F-401) | Invitation delivered | Manual link; email service unused here | PARTIAL | P3 | `user-actions.ts:157` |
| GAP-111 | Cross | Subscriptions (F-601) | Server-side entitlements | Nothing | MISSING | P2 | — |
| GAP-112 | Cross | Coupons (F-602) | Limits + expiry | Nothing | MISSING | P2 | — |
| GAP-113 | Instructor | Earnings & payouts (F-604) | Earnings = paid − refunds/fees | Placeholder | MISSING | P2 | `/instructor/earnings` |
| GAP-114 | Admin | Revenue & commerce (F-605) | Net revenue, channels, orders | Placeholder | MISSING | P2 | `/admin/commerce` |
| GAP-115 | Cross | AI platform (F-700) | Adapter, policy, usage/cost | Nothing | MISSING | P2 | — |
| GAP-116 | Learner | AI Tutor (F-701) | Grounded tutor with sources | Placeholder | MISSING | P2 | `/learner/ai-tutor` |
| GAP-117 | Instructor | AI drafting (F-702) | Editable drafts, never auto-published | Placeholder | MISSING | P2 | `/instructor/ai` |
| GAP-118 | Instructor | AI insights (F-703) | Review summaries, drop-off suggestions | Nothing | MISSING | P2 | — |
| GAP-119 | Admin | AI management (F-704) | Policy, safety, usage, cost | Placeholder | MISSING | P2 | `/admin/ai` |
| GAP-120 | Cross | RAG ingestion (F-800) | Upload → processed/failed | Nothing | MISSING | P2 | `docs/RAG_PLAN.md` |
| GAP-121 | Cross | Permission-aware retrieval (F-801) | No cross-org/course leakage | Nothing | MISSING | P2 | `docs/RAG_PLAN.md` |
| GAP-122 | Admin | Knowledge base admin (F-802) | Test retrieval, re-index, delete | Placeholder | MISSING | P2 | `/admin/rag` |
| GAP-123 | Admin | Payout details exposure | Least-privilege access to payout data | Plain-text `payout_reference` readable by every `user.read_all` holder, incl. **support agents** | — (observation) | P2 | `20260926200000_admin_instructor_detail.sql:75-76` |
| GAP-124 | Platform | Rate limiter fails open | Abuse limits hold during outages | Returns "allowed" on DB error / missing key | — (observation) | P3 | `services/rate-limit/index.ts` |
| GAP-125 | Admin | Role-aware admin nav | Back-office roles see what they can use | All entries shown; pages deny server-side | — (UX) | P3 | `components/layout/portal-shell.tsx` |
| GAP-126 | Instructor | Export error message | Generic errors (SECURITY) | CSV export 500 echoes `err.message` | — (defect) | P3 | `app/instructor/analytics/export/route.ts:43` |
| GAP-127 | Instructor | Message-student result | Accurate status | Says "not delivered" when only the notification was suppressed; the thread message was stored | — (defect) | P3 | `features/instructor/student-actions.ts:46` |
| GAP-128 | Moderation | Ban from the queue (F-411) | Act on the reported author | Suspension only via Users page | — (UX) | P3 | `app/admin/moderation/page.tsx` |
| GAP-129 | Docs | MEMORY.md current status | Reflects reality | Still "Phase 1 in progress, next task T-019" | — (drift) | P3 | `docs/MEMORY.md` "Current Status" |

GAP-123 to GAP-129 are observations or defects, not registry features, and are not counted in the
98-feature totals.

---

## 4. Missing Features

| Feature | Portal | Expected behavior | Current state | Why missing | Priority | Dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| F-600 Checkout/orders/payments | Cross | Paid enrollment after verified, idempotent webhook | Nothing | No adapter, tables, webhook route | P1 | Payment provider + keys from the user (ADR-031 deferred) |
| F-601 Subscriptions | Cross | Server-side plan entitlements | Nothing | — | P2 | F-600 |
| F-602 Coupons | Cross | Limits + expiry | Nothing | — | P2 | F-600 |
| F-603 Refunds | Admin | Audited refund, access revoked per policy | Nothing | — | P1 | F-600 |
| F-604 Earnings & payouts | Instructor | Earnings = paid orders − refunds − fees | Placeholder | No `instructor_payouts` | P2 | F-600, F-603 |
| F-605 Admin revenue | Admin | Net revenue, by channel, orders | Placeholder | — | P2 | F-600 |
| F-700 AI platform | Cross | All AI calls via adapter; usage/cost recorded | Nothing | No SDK, no `ai_*` tables | P2 | AI provider + key from the user |
| F-701 AI Tutor | Learner | Grounded, cited, hint-only during graded work | Placeholder | — | P2 | F-700, F-801 |
| F-702 AI drafting | Instructor | Editable drafts, never auto-published (ADR-016) | Placeholder | — | P2 | F-700 |
| F-703 AI insights | Instructor | Review summaries, drop-off suggestions | Nothing | — | P2 | F-700 (data from F-216/F-217 exists) |
| F-704 AI management | Admin | Policies, safety, usage, cost, job history | Placeholder | — | P2 | F-700 |
| F-800 Ingestion | Cross | Upload → processed/failed status | Nothing | — | P2 | Embedding provider (fixes vector size) |
| F-801 Retrieval | Cross | Unauthorized org/course chunks never retrieved | Nothing | — | P2 | F-800; uses existing org + enrollment rules |
| F-802 KB admin | Admin | Test retrieval, re-index, delete | Placeholder | — | P2 | F-800, F-801 |

---

## 5. Partially Implemented Features

| Feature | Implemented | Missing / limitation | Priority |
| --- | --- | --- | --- |
| **F-107** Assessments | 4 auto-graded types, timer, server grading, attempts, answer keys isolated, admin attempt reset | Manual grading of essay/coding; such courses can't complete or certify | **P0** |
| **F-103** Enrollment | Free enrollment, prerequisites, idempotent, RLS, admin manual enroll, cohorts | Paid enrollment (needs F-600) | P1 |
| **F-215** Messaging | Instructor threads, unread counts, send, mark read | Learner messages screen | P1 |
| **F-947** CI & deploy | Check + 6 E2E shards on local Supabase, VPS deploy, backup workflow | Per-PR previews (T-248), production QA checklist (T-250) | P1 |
| **F-216** Instructor analytics | KPIs, trends, filters, lesson drop-off, question difficulty, scoped CSV | Real revenue (needs F-600), replay metric, true watch time | P2 |
| **F-112** Calendar | Month/week/agenda; assignment due dates; attempts; certificates | Assessment due dates; sessions | P2 |
| **F-403** Instructor management | Applications queue, list, detail, ratings, payout method | Revenue (needs F-600) | P2 |
| **F-401** User management | Search, filters, create, invite, suspend, role change, detail; audited | Invite email delivery | P3 |

---

## 6. Mock / Demo Implementations

**None found.** Unbuilt screens are honest placeholders, and the seed remains isolated from `src/`
(`tests/unit/seed-isolation.test.ts`).

Derived values presented as metrics (not fake, but not the measurement the label implies):

| Screen | Displayed | Actual source |
| --- | --- | --- |
| Instructor Analytics → Revenue, Avg/student, per-course revenue, CSV | currency | Σ `course_versions.price_cents` over enrollments. No payments exist, and paid enrollment is refused. |
| Instructor Analytics → watch time | minutes | Σ `lesson_progress.last_position_seconds` (resume position) |
| Learner My Progress → Skills | skill + level | Categories of courses with progress (`features/progress/progress.ts`) |

The admin Instructor detail correctly **omits** revenue rather than showing a fake $0.

---

## 7. UI Without Functional Backend

| UI | Location | What happens |
| --- | --- | --- |
| Paid-course enrollment panel | `components/courses/enrollment-panel.tsx` | "Checkout is coming soon"; no action |
| 6 placeholder routes | §8 | "Coming in T-xxx" pages (counted as MISSING features) |
| AI Tutor mobile tab | `config/navigation.ts` `mobileBar` | One of four primary mobile tabs opens a placeholder |

---

## 8. Backend Functionality Without UI

| Backend capability | Evidence | Missing UI |
| --- | --- | --- |
| Learner side of direct messaging (RLS: read threads, send, mark read) | `20260926100000_messaging.sql` | Learner messages route (F-215) |
| Email delivery service (`services/email`, Resend) | used by announcements (T-141) | Not used by user invites (F-401) or as a notification channel |
| `assessment_attempts.status = 'graded'` state | `20260923200000_assessments.sql:65` | No grading UI or action sets it (F-107) |

---

## 9. Route audit

- **Placeholder routes (6, was 20):** `/learner/ai-tutor`, `/instructor/earnings`, `/instructor/ai`,
  `/admin/commerce`, `/admin/ai`, `/admin/rag`.
- **New portal:** `/org_admin/*` (scoped, permission `portal.org_admin.access`, MFA required by
  default platform settings).
- **Missing routes with no placeholder:** learner messages; checkout and payment webhook.
- **API routes:** `/api/v1/*` (hashed, scoped API keys), `/api/cron/scheduled-reports`
  (`CRON_SECRET`), `/api/scorm/*` (signed asset tokens, ADR-029).
- **Duplicate / broken / wrong-screen / unauthorized routes:** none found. `proxy.ts` guards
  `/learner`, `/instructor`, `/admin`, `/org_admin`, `/courses`, `/certificates`, and each portal
  layout re-checks.

---

## 10. Backend audit (open items only)

| Feature | UI | API / action | Database | Status |
| --- | --- | --- | --- | --- |
| Essay/coding grading | NO | NO | status column only | MISSING (within F-107) |
| Paid enrollment / checkout | message only | NO | NO | MISSING |
| Learner messaging | NO | YES (RLS) | YES | PARTIAL |
| Invite email | link shown | email service unused | YES | PARTIAL |
| Instructor revenue | YES | derived from list price | no payments | PARTIAL |
| Commerce / AI / RAG | placeholders | NO | NO | MISSING |

All other registry features have UI → server action/RPC → authorization → database → audit
(where SECURITY §17 applies). All 57 declared audit actions in `services/audit` are written by at
least one call site or SQL function.

---

## 11. Database audit

75 tables (was 45). Present now in addition to the earlier set: organizations, departments, teams,
organization_members, organization_sso_domains, assigned_learning, cohorts, cohort_members,
instructor_applications, instructor_payout_details, certificate_templates, resource_library_items,
resource_library_usages, review_reports, scorm_packages, scorm_registrations, announcements,
announcement_templates, announcement_deliveries, api_keys, api_request_log, webhook_endpoints,
webhook_deliveries, platform_settings, login_history, saved_reports, report_exports,
assignment_resources.

**Still absent (required by FEATURES):** orders, payments, refunds, coupons, subscriptions,
instructor_payouts · ai_conversations, ai_messages, ai_generation_jobs · knowledge_documents,
knowledge_chunks (pgvector) · any due/scheduled date on assessments · video playback events.

---

## 12. Authentication & RBAC

| Check | Finding |
| --- | --- |
| Authentication | All portal prefixes guarded in `proxy.ts` + layouts; route handlers check the session or API key / cron secret. |
| Organization isolation | ✅ Now enforced: scoped Org Admin portal, RLS isolation tests (T-160), E2E isolation (T-166). |
| Platform policies | ✅ Enforced in `proxy.ts`: MFA per portal (default admin + org_admin), idle-session timeout, min password length on signup/reset/profile. |
| Least privilege | ⚠️ Support agents (`user.read_all`) can read instructors' plain-text payout references (GAP-123). |
| Rate limiter | ⚠️ Fails open on DB error or missing service key (GAP-124). |
| Frontend-only authorization | None. Admin sidebar isn't role-filtered (UX only, GAP-125). |

---

## 13. Dynamic data audit

All built screens read real data. No hardcoded counts, static course/user arrays, fake progress or
fake notifications were found. The only non-measured figures are the derived metrics in §6.

---

## 14. Design vs implementation

Prototype files are not in the repo, so this compares documented screen inventories.

| Area | Screens in design | Built | Not built |
| --- | --- | --- | --- |
| Learner (13) | Dashboard … Assignments | 12 | AI Tutor |
| Instructor (22) | Dashboard … Settings | 20 | Earnings, AI Assistant |
| Admin (21) | Overview … Security | 18 | Commerce, AI, Knowledge Base |

Screens built but partial against their design: Quiz (essay/coding never finalize), Calendar (no
scheduled assessments), Messaging (no learner counterpart), Instructor Analytics (estimated revenue,
no replay), Instructor detail (no revenue).

DESIGN §15's guided flow (Basics → Curriculum → Content → Assessments → Pricing → Settings →
Preview → Readiness → Submit) is still a 6-step stepper: Content and Assessments are reached from
Curriculum, and Pricing + Settings share one step. All required functions exist.

Built routes ship loading, empty, error and permission-denied states. An automated WCAG 2.2 AA
scan (T-244) and the 4-width responsive audit (T-245) are in place.

---

## 15. Portal completeness

Completion = IMPLEMENTED ÷ features assigned to the portal; second figure counts PARTIAL as ½.
Assignment (unchanged from the previous audit): **Learner (20)** F-008, F-100–F-117, F-701 ·
**Instructor (24)** F-200–F-220, F-604, F-702, F-703 · **Admin incl. Org Admin (28)** F-005,
F-400–F-417, F-500–F-504, F-603, F-605, F-704, F-802 · **Cross-cutting (26)** the rest.

| Portal | Implemented | Partial | Missing | Strict | With ½ partial | Previous (strict) |
| --- | --- | --- | --- | --- | --- | --- |
| Learner | 16 | 3 (F-103, F-107, F-112) | 1 (F-701) | 16/20 = **80.0%** | 17.5/20 = 87.5% | 80.0% |
| Instructor | 19 | 2 (F-215, F-216) | 3 (F-604, F-702, F-703) | 19/24 = **79.2%** | 20/24 = 83.3% | 62.5% |
| Admin + Org Admin | 22 | 2 (F-401, F-403) | 4 (F-603, F-605, F-704, F-802) | 22/28 = **78.6%** | 23/28 = 82.1% | 10.7% |
| Cross-cutting | 19 | 1 (F-947) | 6 (F-600–F-602, F-700, F-800, F-801) | 19/26 = **73.1%** | 19.5/26 = 75.0% | 34.6% |
| **Overall** | **76** | **8** | **14** | 76/98 = **77.6%** | 80/98 = **81.6%** | 43.9% |

Mock and UI-only are 0 in every portal.

---

## 16. Dependency gaps

```text
Certificate for courses with essay/coding questions (F-109)
   → course completion (all assessments passed)
   → manual grading of essay/coding attempts          ← MISSING (GAP-101), no external dependency
```

```text
Paid enrollment (F-103) · refunds (F-603) · subscriptions (F-601) · coupons (F-602)
earnings (F-604) · admin revenue (F-605) · real instructor revenue (F-216, F-403)
   → orders / payments / verified webhooks (F-600)
   → payment provider decision + keys (user; ADR-031 deferred)
```

```text
AI Tutor (F-701) → AI platform (F-700) → AI provider + key (user)
                 → retrieval (F-801) → ingestion (F-800) → embedding provider (user; fixes vector size)
Instructor AI (F-702, F-703), admin AI (F-704) → F-700
KB admin (F-802) → F-800, F-801
```

```text
Feature-complete (features:strict) → previews (T-248) + production QA checklist (T-250)
Calendar assessments (F-112) → an assessment due/scheduled date (not modelled)
Replay / true watch time (F-216) → playback event capture (not modelled)
Invite email (F-401) → reuse services/email (exists)
```

---

## 17. Recommended implementation order (dependency-based)

```text
1. Manual grading for essay/coding attempts      (GAP-101 — P0, no external dependency)
        ↓
2. Small in-repo completions, no external input:
   learner messages (F-215) · invite email via services/email (F-401) ·
   assessment due dates → calendar (F-112) · playback events → replay/watch time (F-216)
        ↓
3. Ops: per-PR previews (T-248) → production QA checklist (T-250)
        ↓
4. Commerce (needs provider decision + keys):
   F-600 → F-103 paid → F-601 / F-602 → F-603 → F-604 → F-605 → real revenue in F-216 / F-403
        ↓
5. AI platform (needs AI provider + key): F-700 → F-702 / F-703 → F-704
        ↓
6. RAG (needs embedding provider): F-800 → F-801 → F-802 → F-701 AI Tutor   (docs/RAG_PLAN.md)
```

Steps 4–6 are independent of each other once their provider inputs exist; the order follows
`TASKS.md`. Step 1 can start immediately.

---

## FINAL IMPLEMENTATION STATUS

The current LMS contains:

**Implemented (76):** authentication (signup, verification, reset, sessions, MFA, roles,
authorization, onboarding); the learner portal except the four items below; the instructor portal
except messaging/analytics caveats, earnings and AI; course lifecycle; the full admin console
except commerce, AI and RAG; organizations with scoped Org Admin, assigned learning, reports and
Google Workspace SSO; design system, portal shells, seed isolation; security headers/CSP, rate
limiting, structured logging, privacy export/deletion, WCAG scan, responsive audit, performance
pass, backups.

**Partially Implemented (8):** enrollment (free only), assessments (no essay/coding grading),
calendar (no assessment dates), messaging (no learner UI), instructor analytics (estimated revenue,
no replay), user management (invite email), instructor management (no revenue), CI & deployment
(no previews, QA checklist open).

**Mock/Demo (0):** none; three derived metrics noted in §6.

**UI Only (0):** none; 6 honest placeholders counted as Missing.

**Backend Only (0):** none at feature level; three backend capabilities without UI listed in §8.

**Missing (14):** checkout/payments, subscriptions, coupons, refunds, instructor earnings, admin
revenue · AI platform, AI Tutor, instructor AI drafting, instructor AI insights, admin AI management
· RAG ingestion, permission-aware retrieval, knowledge base admin.

**Blocked (0):** none unverifiable. Commerce, AI and RAG wait on user decisions and keys (CLAUDE.md
"Blocked?"), which is why they are listed as Missing with external dependencies.

The following items are required before the LMS can be considered feature-complete
(`npm run features:strict` passing):

1. Manual grading for essay/coding assessment attempts, so every course can complete and certify.
2. The remaining partial items that need no outside input: learner messaging, invite email,
   assessment dates in the calendar, replay/watch-time capture.
3. Per-PR preview deployments (T-248) and the production QA checklist (T-250).
4. Commerce (F-600–F-605), once a payment provider and keys are chosen.
5. AI (F-700–F-704) and RAG (F-800–F-802), once AI and embedding providers and keys are chosen
   (`docs/RAG_PLAN.md`).

**Production readiness:** the free-course LMS is deployed and its CI is green. It is **not yet
feature-complete**: the essay/coding grading gap is a functional defect in the core loop, the
production QA checklist (T-250) has not been completed, and commerce, AI and RAG are absent.
