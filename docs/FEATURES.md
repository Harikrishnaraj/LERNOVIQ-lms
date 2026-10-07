# LERNOVIQ — Feature Registry

The complete list of features this product must ship. Sources: `PRD.md` (§8, §12–§16), the three
prototypes (LearnSphere learner, Instructor Portal, Admin Console) and `SECURITY.md`/`TEST_PLAN.md`.

**How completeness is enforced**

- Every feature has an ID. Every task in `TASKS.md` ends with the feature IDs it implements (`— F-105`).
- A feature is **complete** when every task that references it is ticked `[x]`.
- `npm run features` prints coverage. `npm run features:strict` exits non-zero if any feature is
  unreferenced, references an unknown task/feature, or is incomplete. The project is finished only
  when `features:strict` passes.
- Do not remove a feature to make the check pass. Descoping requires a new ADR in `DECISIONS.md`
  and moving the row to "Descoped" at the bottom with the ADR number.

Columns: **Source** = where the requirement comes from. **Done when** = the acceptance bar
(plus the referenced `TEST_PLAN.md` section).

## Authentication & access

| ID    | Feature                                        | Portal | Source                  | Done when                                                                       |
| ----- | ---------------------------------------------- | ------ | ----------------------- | ------------------------------------------------------------------------------- |
| F-001 | Email/password signup & login                  | All    | PRD §8, TEST_PLAN §3    | Valid signup/login works; duplicate/invalid/weak inputs rejected safely          |
| F-002 | Email verification                             | All    | PRD §8, SECURITY §2     | Unverified users cannot reach private routes                                     |
| F-003 | Password reset                                 | All    | PRD §8                  | Reset email → new password → login works; rate limited                           |
| F-004 | Session management & logout                    | All    | PRD §8                  | Refresh keeps session; expiry redirects to login; logout clears session          |
| F-005 | Admin MFA                                      | Admin  | PRD §8, TEST_PLAN §3    | Admin routes unreachable without a verified second factor                        |
| F-006 | Roles & role-aware routing                     | All    | SECURITY §3             | 7 roles seeded; login lands on the right portal                                  |
| F-007 | Server-side authorization & permission denied  | All    | ADR-012, TEST_PLAN §4   | Every role boundary in TEST_PLAN §4 holds for UI and direct HTTP                 |
| F-008 | Learner onboarding                             | Learner| PRD §7                  | New learner sets interests/goals; used for recommendations                       |

## Learner

| ID    | Feature                               | Source                              | Done when                                                                  |
| ----- | ------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| F-100 | Learner dashboard                     | LearnSphere Dashboard, DESIGN §14   | All six dashboard blocks render from real data with empty states           |
| F-101 | Course catalog, search & filters      | PRD §8                              | Search + category/level/language/duration/price/rating filters, paginated  |
| F-102 | Course detail page                    | PRD §7                              | Outcomes, curriculum preview, instructor, rating shown; SEO metadata       |
| F-103 | Enrollment                            | PRD §7                              | Enrollment persists after refresh; paid courses require verified payment   |
| F-104 | My Learning                           | LearnSphere My Learning             | In-progress/completed lists, resume button                                 |
| F-105 | Course player                         | LearnSphere Course Player           | TEST_PLAN §6 passes                                                        |
| F-106 | Lesson progress & resume              | TEST_PLAN §5–6                      | Progress and video position persist across sessions                        |
| F-107 | Assessments / quizzes                 | LearnSphere Quiz, Assessments       | TEST_PLAN §7 passes; answer keys never sent to learners                    |
| F-108 | Assignments                           | LearnSphere Assignments             | TEST_PLAN §8 passes                                                        |
| F-109 | Certificates                          | LearnSphere Certificates, PRD §11   | TEST_PLAN §9 passes                                                        |
| F-110 | Public certificate verification       | PRD §11, SECURITY §12               | Valid/revoked states shown; no private data exposed                        |
| F-111 | Learning paths                        | LearnSphere Learning Path           | Path detail, enrollment, ordered progress                                  |
| F-112 | Calendar                              | LearnSphere Calendar                | Deadlines and assessments appear on correct dates                          |
| F-113 | Discussions                           | LearnSphere Discussions             | Thread, reply, answered state, report; sanitized content                   |
| F-114 | Progress & skills                     | LearnSphere Progress                | Hours, streak, completion, skills from real events                         |
| F-115 | Notifications                         | LearnSphere Notifications           | Persistent, read/unread, preferences respected                             |
| F-116 | Learner profile & settings            | PRD §6                              | Profile, password, notification preferences editable                      |
| F-117 | Course ratings & reviews              | PRD §8 (instructor reviews)         | Only enrolled learners can review; one review per course                   |

## Instructor

| ID    | Feature                                     | Source                                    | Done when                                                        |
| ----- | ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| F-200 | Instructor overview dashboard               | Instructor Dashboard                      | Own-course KPIs and pending items from real data                 |
| F-201 | My Courses & course overview                | Instructor My Courses, CourseOverview     | Status filters; only own courses returned                        |
| F-202 | Guided course creation (basics, pricing, settings) | Instructor CreateCourse, ADR-008   | Draft saved at every step; resumable                             |
| F-203 | Curriculum builder                          | Instructor CurriculumBuilder              | Sections/items CRUD + reorder with keyboard alternative          |
| F-204 | Lesson editor & media                       | Instructor LessonEditor                   | Rich text sanitized; video/attachments via storage adapter       |
| F-205 | Assessment builder                          | Instructor AssessmentBuilder              | All PRD §10 question types; grading strategy stored              |
| F-206 | Assignment builder & grading                | Instructor AssignmentBuilder              | Rubric, due date, grading queue, feedback to learner             |
| F-207 | Question bank                               | Instructor QuestionBank                   | Reusable tagged questions importable into assessments            |
| F-208 | Course preview                              | Instructor CoursePreview                  | Instructor sees exactly the learner player                       |
| F-209 | Readiness checklist                         | Instructor CourseReadiness                | Missing requirements listed and linked; blocks submission        |
| F-210 | Submit for review                           | Instructor SubmitReview                   | Creates review state + audit event                               |
| F-211 | Review feedback & resubmission              | Instructor ReviewFeedback, TEST_PLAN §11  | Section-linked feedback; resubmit; versions auditable            |
| F-212 | Publish & course versioning                 | ADR-011                                   | Editing a published course creates a new draft version           |
| F-213 | Student management & student detail         | Instructor StudentManagement, StudentDetail | Segments and per-student progress; own courses only           |
| F-214 | Instructor discussions                      | Instructor Discussions                    | Unanswered queue, reply, pin, moderate                           |
| F-215 | Messaging                                   | Instructor Messaging                      | 1:1 threads, unread counts                                       |
| F-216 | Instructor analytics (course, learner, video, assessment) | Instructor Analytics         | TEST_PLAN §12 passes; export scoped to own courses               |
| F-217 | Reviews management                          | Instructor Reviews                        | Rating distribution; reply to reviews                            |
| F-218 | Instructor certificates                     | Instructor Certificates                   | Issued list; template settings                                   |
| F-219 | Resource library                            | Instructor ResourceLibrary                | Reusable assets with usage count                                 |
| F-220 | Instructor settings & public profile        | Instructor Settings                       | Profile, payout details, notifications                           |

## Course lifecycle

| ID    | Feature                        | Source           | Done when                                                         |
| ----- | ------------------------------ | ---------------- | ----------------------------------------------------------------- |
| F-310 | Course state machine           | ADR-010, PRD §9  | Only legal transitions; enforced in services + DB; all audited    |

## Admin

| ID    | Feature                                   | Source (Admin Console screen)         | Done when                                                     |
| ----- | ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| F-400 | Admin overview & pending actions          | ScreenOverview                        | KPIs + pending actions from real data                         |
| F-401 | User management                           | ScreenUsers                           | TEST_PLAN §13 user management passes                          |
| F-402 | User detail                               | ScreenUserDetail                      | Sessions, login history, progress, skills visible             |
| F-403 | Instructor management & verification      | ScreenInstructors, ScreenInstructorDetail | Verification queue approve/reject; detail with revenue    |
| F-404 | Roles & permissions                       | ScreenRoles                           | Matrix editable, audited, last Super Admin protected          |
| F-405 | Courses & categories                      | ScreenCourses                         | Status tabs, search, bulk actions; categories CRUD            |
| F-406 | Course review workflow                    | ScreenCourseReview                    | Approve/changes/reject with checklist; audited                |
| F-407 | Enrollments & cohorts                     | ScreenEnrollments                     | Manual enroll, cohorts, bulk assign                           |
| F-408 | Assessment oversight                      | ScreenAssessments                     | Averages, question-quality flags, attempt reset (audited)     |
| F-409 | Certificate administration                | ScreenCertificates                    | Search, revoke (audited), reissue                             |
| F-410 | Content, media & SCORM                    | ScreenContent                         | Validated uploads; SCORM launches and reports completion      |
| F-411 | Moderation                                | ScreenModeration                      | Report queue; hide/restore; ban                               |
| F-412 | Platform analytics & reports              | ScreenAnalytics                       | Dashboards, saved reports, export                             |
| F-413 | Communication (announcements, email)      | ScreenNotifications                   | Targeted announcements; templates; delivery log               |
| F-414 | Audit logs                                | ScreenAuditLog, SECURITY §17          | Append-only; every SECURITY §17 action recorded; filterable   |
| F-415 | Integrations & API                        | ScreenIntegrations                    | Hashed scoped API keys, webhooks, rate limits, request log    |
| F-416 | Platform settings & security              | ScreenSettings                        | Password/MFA/session policies enforced                        |
| F-417 | Admin profile                             | ScreenProfile                         | Personal info, security, recent actions                       |

## Organizations / enterprise

| ID    | Feature                               | Source                       | Done when                                            |
| ----- | ------------------------------------- | ---------------------------- | ---------------------------------------------------- |
| F-500 | Organizations, departments, teams     | PRD §14, ScreenOrganizations | CRUD + membership; RLS isolation tests pass          |
| F-501 | Scoped Org Admin                      | SECURITY §4                  | Org Admin cannot see another org (UI + HTTP)         |
| F-502 | Assigned learning & required completion | PRD §14                    | Assignments with due dates; overdue tracking         |
| F-503 | Organization reports                  | PRD §14                      | Completion/overdue/hours report + export             |
| F-504 | Organization SSO                      | PRD §8                       | SSO login maps users into the right org              |

## Commerce

| ID    | Feature                          | Source                 | Done when                                                  |
| ----- | -------------------------------- | ---------------------- | ---------------------------------------------------------- |
| F-600 | Checkout, orders & payments      | PRD §13, SECURITY §13  | TEST_PLAN §14 passes; webhooks verified + idempotent       |
| F-601 | Subscriptions                    | PRD §13                | Plan entitlements enforced server-side                     |
| F-602 | Coupons                          | PRD §13                | Limits and expiry enforced                                 |
| F-603 | Refunds                          | PRD §13                | Admin refund updates payment + access; audited             |
| F-604 | Instructor earnings & payouts    | Instructor Earnings    | Earnings match paid orders minus refunds/fees              |
| F-605 | Admin revenue & commerce         | ScreenRevenue          | Net revenue, by channel, orders table                      |

## AI

| ID    | Feature                              | Source               | Done when                                                         |
| ----- | ------------------------------------ | -------------------- | ----------------------------------------------------------------- |
| F-700 | AI platform (adapter, policy, usage) | ARCHITECTURE §18     | All AI calls go through adapter; usage/cost recorded              |
| F-701 | Learner AI Tutor                     | LearnSphere AITutor, PRD §12 | TEST_PLAN §15 passes                                      |
| F-702 | Instructor AI content drafting       | Instructor AIAssistant, PRD §12 | TEST_PLAN §16 passes; nothing auto-publishes (ADR-016) |
| F-703 | Instructor AI insights               | PRD §12              | Review summaries and drop-off suggestions from real data          |
| F-704 | Admin AI management                  | ScreenAI             | Policies, safety, usage, cost, job history                        |

## Knowledge base / RAG

| ID    | Feature                              | Source                     | Done when                                              |
| ----- | ------------------------------------ | -------------------------- | ------------------------------------------------------ |
| F-800 | Document ingestion pipeline          | ScreenKnowledgeBase        | Upload → processed/failed status visible               |
| F-801 | Permission-aware retrieval           | ADR-017, SECURITY §16      | Unauthorized org/course chunks never retrieved         |
| F-802 | Knowledge base admin                 | ScreenKnowledgeBase        | Test retrieval, re-index, delete removes from retrieval |

## Platform & quality

| ID    | Feature                                  | Source                  | Done when                                               |
| ----- | ---------------------------------------- | ----------------------- | ------------------------------------------------------- |
| F-900 | Engineering foundation & tooling         | ARCHITECTURE §1         | `npm run check` passes; current framework versions      |
| F-901 | Design system (tokens + components)      | DESIGN.md               | All screens use tokens/components; no raw hex           |
| F-902 | Portal shells & navigation               | ADR-005, ADR-027        | Three shells, URL routing, mobile patterns              |
| F-903 | Dev seed data (fixtures only)            | ADR-023                 | Seed never imported by app code                         |
| F-940 | Security headers & CSP                   | SECURITY §22            | Headers present on every response                       |
| F-941 | Rate limiting                            | SECURITY §18            | All SECURITY §18 endpoints limited                      |
| F-942 | Logging, correlation IDs, error tracking | ARCHITECTURE §19        | Errors traced with request IDs; no secrets logged       |
| F-943 | Privacy: export & account deletion       | SECURITY §21            | User can export data and delete account                 |
| F-944 | Accessibility WCAG 2.2 AA                | DESIGN §21, TEST_PLAN §19 | Audit passes on every screen                          |
| F-945 | Responsive at 375/768/1024/1440          | TEST_PLAN §18           | Every screen checked at all four widths                 |
| F-946 | Performance budget                       | TEST_PLAN §20           | Budgets met; heavy libs lazy-loaded                     |
| F-947 | CI, preview & production deployment     | ADR-019                 | Preview per PR; production QA checklist passes          |
| F-948 | Backups & recovery                       | SECURITY §24            | Restore tested and documented                           |

## Descoped

_None. Moving a feature here requires an ADR._
