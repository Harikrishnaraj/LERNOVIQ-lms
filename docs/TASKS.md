# Modern LMS — Tasks

Work one task at a time: **implement → test → review → mark complete → commit → next**.
Each task should be describable in a few sentences with a clear "done" condition. If it isn't, split it.

Legend: `[x]` done · `[ ]` todo · `[~]` in progress

---

## Phase 0 — Foundation

- [x] **T-001** Create Next.js app (App Router, `src/`, TypeScript strict, Tailwind v4, ESLint).
- [x] **T-002** Add Prettier (+ Tailwind class sorting), `typecheck`, `format`, `test` scripts.
- [x] **T-003** Add `.env.example`, `.gitignore` for secrets, README with setup steps.
- [x] **T-004** Design tokens from `DESIGN.md` in `globals.css` (`@theme`): colors, radii, fonts (Plus Jakarta Sans / Inter / JetBrains Mono), reduced-motion.
- [x] **T-005** Base UI components: `Button`, `Input`, `Card`, `Badge`/`StatusBadge`, `EmptyState`, `Skeleton`, `ErrorState`, `PageHeader`.
- [x] **T-006** Portal shells with real URL routing and lucide icons: Learner (light + mobile bottom nav), Instructor (dark sidebar), Admin (grouped console). Placeholder pages show an EmptyState, not fake data.
- [x] **T-007** Public landing page linking to the three portals (temporary until auth).
- [x] **T-008** Vitest set up with unit tests for `cn()`, nav config integrity and course status transitions.
- [x] **T-009** Playwright config + smoke test (each portal renders, nav works at 375px and 1440px).
- [x] **T-010** Domain seed: `courseStatus` state machine (ADR-010) as a pure function with tests.

## Phase 1 — Authentication (Supabase)

> Needs: a Supabase project (dev), URL + anon key in `.env.local`.

- [ ] **T-011** Add `@supabase/ssr` + `@supabase/supabase-js` + `zod`; create `src/lib/supabase/{server,client,middleware}.ts`.
- [ ] **T-012** DB migration: `profiles`, `roles`, `organization_members` (minimal) + RLS "user reads own profile".
- [ ] **T-013** Signup UI (email, password, confirm) with validation, loading, error states. No auth call yet.
- [ ] **T-014** Wire signup to Supabase Auth + email verification page.
- [ ] **T-015** Login UI + wiring; safe error for invalid credentials.
- [ ] **T-016** Logout + session refresh in middleware.
- [ ] **T-017** Forgot/reset password flow.
- [ ] **T-018** Role-aware redirect after login (learner/instructor/admin) using server-side role lookup.
- [ ] **T-019** Protect `/learner`, `/instructor`, `/admin` in middleware + server layout guard; add permission-denied page.
- [ ] **T-020** Admin MFA (TOTP enrol + challenge); admin routes require AAL2.
- [ ] **T-021** Tests: unit (validators, role guard), E2E (signup → login → dashboard, role boundaries, logged-out redirect).

## Phase 2 — Learner vertical slice

- [ ] **T-030** Schema: `courses`, `course_versions`, `course_sections`, `lessons`, `enrollments`, `lesson_progress` + RLS.
- [ ] **T-031** Dev seed script (fixtures, clearly separated from production code).
- [ ] **T-032** Public course catalog with Postgres search + filters (category, level).
- [ ] **T-033** Course detail page.
- [ ] **T-034** `enrollInCourse` service + Enroll button (free courses only for now).
- [ ] **T-035** My Learning list (active/completed) with empty state.
- [ ] **T-036** Course player: curriculum sidebar, lesson content, prev/next.
- [ ] **T-037** `completeLesson` + progress bar persistence.
- [ ] **T-038** Assessment schema + learner attempt API (answer key never returned).
- [ ] **T-039** Assessment UI + server-side grading + pass/fail.
- [ ] **T-040** Course completion rule + `issueCertificate`.
- [ ] **T-041** Certificates page + public `/certificates/verify/[id]`.
- [ ] **T-042** Learner dashboard (continue learning, progress) from real data.
- [ ] **T-043** E2E: full learner journey (TEST_PLAN §5).

## Phase 3 — Instructor vertical slice

- [ ] **T-050** Instructor dashboard (own courses only).
- [ ] **T-051** Create course: Basics step (draft).
- [ ] **T-052** Curriculum builder: sections + lessons CRUD, keyboard reorder.
- [ ] **T-053** Lesson editor (text + video URL/asset) with sanitized rich text.
- [ ] **T-054** Assessment builder (MCQ, multi-select, true/false).
- [ ] **T-055** Learner preview mode.
- [ ] **T-056** Readiness checklist (pure rules + UI).
- [ ] **T-057** `submitCourseForReview` transition + review status view.
- [ ] **T-058** E2E: instructor journey (TEST_PLAN §10).

## Phase 4 — Admin vertical slice

- [ ] **T-070** Admin overview with pending actions.
- [ ] **T-071** Course review queue + review screen.
- [ ] **T-072** Approve / request changes / reject transitions + reviewer feedback.
- [ ] **T-073** `audit_logs` table (append-only) + audit on every privileged action.
- [ ] **T-074** User management: search, filter, suspend, role change (audited).
- [ ] **T-075** Basic analytics (enrollments, completions).
- [ ] **T-076** E2E: admin review journey (TEST_PLAN §13).

## Later (explicitly deferred — ADR-025)

Commerce, organizations/enterprise, AI Tutor, Instructor AI, RAG, discussions, messaging, calendar, earnings, integrations, notifications centre. Each gets its own phase once Phases 1–4 are stable and deployed.
