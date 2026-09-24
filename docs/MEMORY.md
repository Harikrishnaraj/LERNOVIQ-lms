# Modern LMS — Project Memory

## Purpose

This file records the current project state. It is intentionally different from `DECISIONS.md`.

- `DECISIONS.md` = durable reasons and architectural choices.
- `MEMORY.md` = current implementation/design state.

## Current Status

**Phase:** Phase 0 (Foundation) complete; Phase 1 (Auth) in progress — 2026-09-23.

**Prototype review:** Completed for the supplied learner, instructor and admin prototypes.

**Production implementation:** Scaffold, design tokens, base UI components and the three portal shells are in place. No auth, database or real data yet.

**Feature tracking:** 98 features in `docs/FEATURES.md`, 137 tasks across Phases 0–12 in `docs/TASKS.md` (ADR-028). Run `npm run features` for live coverage.

**Next task:** T-019 (route guards + `can()` permission helper).

**Supabase project:** `modern-lms` (`ctrizucnfaqescligsuu`, ap-south-1) — created for this repo via the Supabase MCP. The account's two other projects (`trenning-lms`, and the account default project, now paused) have unrelated pre-existing schemas/data and must not be touched by this repo's migrations. `.env.local` (gitignored) points at `modern-lms`, including `SUPABASE_SERVICE_ROLE_KEY` (needed by `tests/integration/profiles-roles.test.ts`'s admin API).

**Auth setting:** "Confirm email" is ON for `modern-lms` (required for T-014's real email verification). `tests/integration/profiles-roles.test.ts` now creates pre-confirmed test users via the service-role admin API (`auth.admin.createUser({ email_confirm: true })`) instead of relying on `signUp()` returning an immediate session.

**Known issue — Supabase free-tier email rate limit:** the built-in dev mailer allows only a handful of emails/hour. Manual signup testing during T-014 hit `over_email_send_rate_limit`; the app correctly showed a safe generic error rather than leaking the detail, but this means real end-to-end email delivery can't be exercised repeatedly without a custom SMTP provider configured in the Supabase dashboard (Auth → Settings → SMTP). Worth doing before broader manual/QA testing of the auth flow.

### What exists (Phase 0)

- Next.js 15 (App Router, `src/`), React 19, TypeScript strict, Tailwind v4, ESLint, Prettier.
- Tokens in `src/app/globals.css` (`@theme`) mirroring DESIGN.md; fonts self-hosted (ADR-026).
- UI: `Button`, `Input`, `Card`, `Badge`, `StatusBadge`, `Skeleton`, `EmptyState`/`ErrorState`/`PermissionDeniedState`/`PageSkeleton`, `PageHeader`.
- `PortalShell` (learner light + mobile bottom bar, instructor dark sidebar, admin dense grouped console); mobile drawer is a native `<dialog>`.
- Navigation: `src/config/navigation.ts` — single source for all three portals' routes, icons (lucide) and the task ID that builds each screen.
- Placeholder routes via `[...section]` (ADR-027).
- Domain: `src/features/courses/course-status.ts` state machine (ADR-010).
- Tests: 32 Vitest unit tests, 12 Playwright E2E (desktop 1440 + mobile 375). `npm run check` passes.

### What exists (Phase 1, in progress)

- `src/lib/supabase/{env,client,server,middleware}.ts` (T-011): `client.ts` for Client Components (`createBrowserClient`), `server.ts` for Server Components/Actions/Route Handlers (`createServerClient` + `next/headers` cookies), `middleware.ts` exports `updateSession(request)` for session refresh (wired into `src/proxy.ts`, T-016). `env.ts` zod-validates `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` and throws a clear error if missing, rather than connecting to `undefined`.
- `supabase/migrations/20260923102957_profiles_roles_permissions.sql` (T-012): `profiles` (`id` → `auth.users`, `full_name`, `avatar_url`, `status` active/suspended, timestamps) auto-populated on signup via a `SECURITY DEFINER` trigger (execute revoked from `public`/`anon`/`authenticated` — it must only run as a trigger); `roles`/`permissions`/`role_permissions`/`user_roles` (text-slug PKs). RLS on all 5 tables: `profiles`/`user_roles` are select-own-row only, `roles`/`permissions`/`role_permissions` are select-all-for-`authenticated` (non-sensitive reference data). No client-side insert/update/delete policies anywhere. Seeded the 7 roles from SECURITY §3; `permissions`/`role_permissions` are left empty until a task needs specific grants. Verified via `tests/integration/profiles-roles.test.ts` (skipped automatically when `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` aren't set) and the Supabase security advisor (0 findings).
- `/signup` (T-013): `src/features/auth/schemas.ts` (`signUpSchema`, zod), `src/components/forms/signup-form.tsx` (client-validated form, loading/error states, no new form-library dependency), `src/app/(auth)/signup/page.tsx`.
- Signup → Supabase Auth + `/verify-email` (T-014): `src/features/auth/sign-up.ts`'s `signUp` Server Action re-validates server-side (never trusts the client), calls `supabase.auth.signUp()`, and `redirect()`s to `/verify-email?email=...` on success — including when Supabase silently no-ops for an already-registered email (its own anti-enumeration behavior; the UI doesn't try to distinguish this from a real new signup). `src/app/auth/callback/route.ts` exchanges the emailed link's code for a session (`exchangeCodeForSession`) and redirects home on success or to `/verify-email?error=link_invalid` on failure — real role-aware redirect lands in T-018. `src/app/(auth)/verify-email/page.tsx` shows the check-your-inbox message plus a `ResendVerificationButton` (`src/components/forms/resend-verification-button.tsx` + `src/features/auth/resend-verification.ts`, wraps `supabase.auth.resend()`). Server Actions are unit-tested against a mocked `@/lib/supabase/server` client (`tests/unit/sign-up.test.ts`, `tests/unit/resend-verification.test.ts`) rather than the live project, to avoid burning the email rate limit on every test run.
- `/login` (T-015): `src/features/auth/schemas.ts`'s `loginSchema` (email + non-empty password — not signup's strength rules, since an existing password may predate today's policy). `src/features/auth/login.ts`'s `login` Server Action calls `supabase.auth.signInWithPassword()`; a bad email and a bad password both return the same generic `"Invalid email or password."` (no enumeration). On success it reads `profiles.status`; `suspended` calls `supabase.auth.signOut()` (no live session left for a blocked account) and returns a distinct message, otherwise `redirect('/')` (role-aware redirect is still T-018). `src/components/forms/login-form.tsx` + `src/app/(auth)/login/page.tsx` mirror the signup form's pattern; `/signup` and `/login` now cross-link. Verified live in the browser against the real Supabase project (wrong credentials, a suspended test user, and a successful login), not just mocked unit tests.
- Logout + session refresh + auth gate (T-016): **`src/proxy.ts`** (not `middleware.ts` — Next.js 16 renamed the file convention; the codemod-recommended migration, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). Calls `updateSession()` on every `/learner`, `/instructor`, `/admin` request; no user → redirect to `/login?next=<path>`. This is an authentication gate only ("is there a user"); role/permission checks and the permission-denied page are still T-019 (the three portal layouts keep their `TODO(T-019)` comments). `src/features/auth/logout.ts` signs out and redirects to `/login`. `PortalShell` gained `user`/`onLogout` props — the header's old "Preview · no auth yet" badge is now the user's email + a zero-JS `<form action={logout}>` logout button; the three portal layouts fetch the user server-side and pass it down. Gating the portals meant `tests/e2e/smoke.spec.ts`'s direct visits needed a session: added a Playwright `setup`/`teardown` project pair (`tests/e2e/auth.setup.ts`/`auth.teardown.ts`) that creates a pre-confirmed test user via the admin API, logs in through the real `/login` UI once, and saves `storageState` for the `desktop`/`mobile` projects to reuse; `tests/e2e/auth-guard.spec.ts` is the one spec that opts out of that saved session to prove the anonymous-redirect behavior itself.
- **Known local-dev flake:** Playwright's `webServer.reuseExistingServer` (pre-existing config, not new) can reuse a stale `next start` process left over from a previous manual run, serving an outdated build and causing intermittent failures. Not a CI risk (`reuseExistingServer` is forced off there) — locally, kill anything listening on the test port before re-running `npm run test:e2e` if failures look inconsistent with the code.
- Forgot/reset password (T-017): `forgotPasswordSchema`/`resetPasswordSchema` in `schemas.ts` (password rule factored into `strongPassword`, shared with `signUpSchema`). `forgot-password.ts`'s `forgotPassword` always returns the same generic message regardless of whether the email is registered (Supabase itself doesn't error for an unknown email — anti-enumeration); a real Supabase error (e.g. rate limited) is safe to surface since it's independent of account existence. `/auth/callback/route.ts` now takes a `next` query param so the same callback route handles both signup verification (→ home) and password recovery (→ `/reset-password`); failure redirects to `/forgot-password?error=link_invalid` or `/verify-email?error=link_invalid` depending on which flow was in progress. `reset-password.ts`'s `resetPassword` calls `supabase.auth.updateUser({ password })`, relying on the recovery session the callback route just established. `/login` now links to `/forgot-password`. Verified live against the real Supabase project (forgot-password form → generic success message; reset-password page renders).
- Role-aware redirect + default role (T-018): `supabase/migrations/20260923123528_default_learner_role.sql` extends the T-012 signup trigger to also insert a `learner` row into `user_roles` for every new signup (becoming an instructor/admin/etc. is an admin action, T-076 — never self-service). `src/features/auth/roles.ts`'s `getPortalPathForUser(supabase, userId)` maps roles → portal: any back-office role (`super_admin`/`admin`/`support_agent`/`content_reviewer`/`org_admin`) → `/admin`, `instructor` → `/instructor`, otherwise → `/learner`. Used by `login()` (falls back to it unless a safe `?next=` path was set — open-redirect guarded: must start with `/`, not `//`), `/auth/callback` (signup-verification success path), and `src/app/page.tsx` (`/` now redirects a signed-in visitor straight to their portal instead of showing the old 3-portal-card picker; signed-out visitors see a minimal Sign up/Log in landing — the "temporary landing links" T-018 was scoped to remove). Verified live for all three redirect targets (learner/instructor/admin) against the real Supabase project.
- Route guards + `can()` (T-019): migration `20260923124550_portal_permissions.sql` (applied to the `modern-lms` Supabase project) seeds `portal.{learner,instructor,admin}.access` and grants each of the 7 roles exactly one portal (the five back-office roles → admin). `src/lib/permissions/can.ts`'s `can(supabase, userId, permission)` resolves user_roles → role_permissions. `src/proxy.ts` redirects anonymous users to `/login?next=…` and users lacking the portal permission to `/permission-denied` (also covers direct HTTP); the three portal layouts re-check server-side. E2E: `tests/e2e/role-guard.spec.ts` plus `tests/e2e/support/role-user.ts` (`loginAsRole` creates a temporary user with a given role via the service key). Smoke shell tests for instructor/admin now log in as those roles. Admin MFA/AAL2 is T-020.
- Admin MFA (T-020): `src/lib/permissions/mfa.ts` (`needsMfa` fails closed; `safeNextPath`). `src/proxy.ts` and the admin layout send any admin-portal request whose session is not AAL2 to `/mfa?next=…`; `login()` goes straight to `/mfa` for admin destinations (a proxy redirect after a Server Action leaves the URL stale). `/mfa` (`src/app/mfa/page.tsx`, outside /admin) enrols a TOTP factor (QR + manual secret, stale unverified factors removed) or challenges an enrolled one via `src/features/auth/mfa.ts`. E2E helper `loginAsRole` completes MFA for admins using `tests/e2e/support/totp.ts` (RFC 6238); `tests/e2e/mfa.spec.ts` covers block, wrong code, enrol, re-login challenge. Playwright retries once locally: the instructor/admin shell smoke tests are occasionally slow under parallel load.
- Rate limiting (T-021): migration `rate_limits` (table `rate_limit_hits` with RLS + no policies, `check_rate_limit()` security-definer sliding window, execute granted to service_role only; applied to the modern-lms project). `src/services/rate-limit` `rateLimit(action, ip, subject?)` uses the service-role key; per-subject (email) limit plus a 30× looser per-IP bucket; fails open (logged) on limiter errors. Wired into login, forgot-password, resend-verification and reset-password actions. Unit tests mock it globally in `tests/setup.ts`; `tests/e2e/rate-limit.spec.ts` hits the real limiter. Other SECURITY §18 endpoints (uploads, AI, assessments…) must call it as they are built.
- Learner onboarding (T-022): migration `learner_onboarding` (user_id pk, interests/goals text[], own-row RLS; applied to modern-lms). `src/features/onboarding/` holds the fixed option lists, zod schema (>=1 interest, goals optional), `completeOnboarding` action and `hasCompletedOnboarding`. `/onboarding` sits outside `/learner`; the learner layout redirects there until a row exists. `tests/e2e/auth.setup.ts` pre-onboards the shared e2e user and clears `rate_limit_hits` each run (repeated runs otherwise hit the per-IP login limit).
- Auth tests (T-023): `tests/e2e/auth.spec.ts` covers TEST_PLAN §3 (signup validation, duplicate email, login valid/invalid, unverified, suspended, refresh, logout, cleared session) and §4 direct-HTTP checks; MFA in `mfa.spec.ts`, role boundaries in `role-guard.spec.ts`. A real signup-then-email-link verification E2E is NOT automated (it would send real mail through Supabase's limited default SMTP); `sign-up`/`callback` are unit-tested. TEST_PLAN §4 bullets about instructor-owned courses, org isolation, content reviewer and support-agent permissions depend on features not built yet and must be tested in their own tasks (T-050+, Phase 6+).
- Course schema (T-030): migrations `courses_schema` + `courses_schema_hardening` (applied to modern-lms). Workflow status lives on `course_versions.status`; `courses.published_version_id` points at the live version; sections/lessons hang off a version (ADR-011). Privileged writes are NOT grantable to `authenticated`: only title/description/pricing-type content columns can be updated by instructors, `status` and `published_version_id` change only server-side with the service role after an authz check (state-transition services in T-058/T-074), enrollment completion/paid enrolment likewise. Self-enrolment RLS allows only published free courses. Helper SQL functions: `has_permission`, `owns_course`, `can_edit_version`, `can_read_version`, `can_read_lesson`; new permissions `course.create/review/read_all`. Public curriculum outline = RPC `get_lesson_outline(version_id)` (titles only); lesson content is readable by staff, the owner, enrolled learners, or as a preview lesson. Catalog full-text search: generated `course_versions.search` tsvector + GIN. `tests/integration/courses-rls.test.ts` (19 tests, live project) proves the boundaries. Known Issue: Supabase leaked-password protection is off (dashboard setting, Pro plan feature) and advisor warnings for the intentional anon/authenticated-executable helper functions remain.
- Dev seed (T-031): `npm run seed` (`scripts/seed.mjs`, service role, idempotent by slug/email) creates 6 categories, 8 published courses with sections/lessons, a demo instructor and a demo learner (seed-instructor@example.com / seed-learner@example.com, password seed-password-1) in the modern-lms project; the learner is enrolled in the first course. `tests/unit/seed-isolation.test.ts` fails if anything under src/ references it (ADR-023). E2E tests must not depend on seeded rows.
- Public catalog (T-032): migration `search_courses` (security-definer RPC: websearch full-text over `course_versions.search`, filters category/level/language/duration/price/rating, sorts relevance/newest/top_rated/price_low/price_high, limit/offset + total_count, instructor name from profiles; only published courses). `src/features/catalog/` = URL filter model (`parseCatalogFilters` drops invalid input, `catalogHref`), `searchCourses`, `listCategories`. `/courses` is a Server Component with a plain GET form (works without JS), pagination links, empty/loading/error states, layout with `PublicHeader`; proxy matcher now also runs session refresh on `/courses/*`. New UI: `Select`, `CourseCard`, `formatPrice/formatDuration`. Shared fixtures for live-project tests live in `tests/support/course-fixtures.ts` (createCourse, createUserWithRole, cleanup). Tests: catalog-filters/format unit, `search-courses` integration (11), `catalog.spec.ts` E2E.
- Course detail (T-033): migration `get_course_detail` (security-definer RPC, published courses only, instructor name). `getCourseDetail` merges it with public `course_sections` and the `get_lesson_outline` RPC (titles only, never lesson bodies). `/courses/[slug]` renders outcomes, description (plain text paragraphs, never HTML), collapsible curriculum with Preview badges, requirements, rating summary (from courses.rating_avg/count until reviews exist, T-087), price/summary aside, breadcrumb, generateMetadata (title/description/canonical/OG) and Course JSON-LD (< escaped). Unknown/unpublished/invalid slug = real 404. Gotcha: a loading.tsx above a route makes Next stream and return 200 before notFound(), so the catalog page/loading/error live in the route group `courses/(list)` and [slug] has no loading.tsx. The enroll CTA arrives with T-034.
- Enrollment (T-034): `enrollInCourse(slug)` Server Action in `src/features/enrollment/` re-reads the published course, refuses paid courses (no payment yet), requires learner-portal permission, inserts under RLS (free-published-only), treats a duplicate (23505) as success, revalidates the page. `EnrollmentPanel` on the course page picks log-in link / Enroll button / enrolled state (links to /learner/my-learning until T-036) / paid notice by viewer. E2E clicks are wrapped in toPass because a click before hydration is a no-op. Tool notes: this machine has `python` not `python3`; gate commits on `npm run check` exit code.
- My Learning (T-035): migration `my_learning` adds `saved_courses` (own-row RLS, published courses only), widens `can_read_version` so an enrolled learner keeps reading the exact version they enrolled in after a newer one is published (ADR-011), and RPCs `my_learning()` (enrollments + lesson totals/progress, hard-wired to auth.uid(), not callable by anon) and `my_saved_courses()`. `/learner/my-learning` has In progress / Completed / Saved tabs via ?tab=, progress bars (`ui/Progress`), empty/loading/error states. `toggleSaveCourse` action + `SaveButton` on the course page. Resume/Start buttons link to the course page until the player exists (T-036 must repoint them). Habit: do not run prettier over whole trees (floods context, not part of the gate).
- Course player (T-036): migration `player_access` makes enrolment version-exact (`is_enrolled_in_version_course`: an enrolled learner can never read another/draft version of the course - fixed a leak), lets enrolled learners read their course row after it is unpublished (`is_enrolled_in_course`, anon needs EXECUTE too because the courses SELECT policy runs for anon), and `get_lesson_outline` now follows `can_read_version`. New dependency **sanitize-html** (+@types): `src/lib/sanitize.ts` allow-list sanitizer for lesson HTML, always applied when rendering (no other sanitizer existed). Routes: `/learner/courses/[slug]` (redirect to first unfinished lesson; not enrolled -> course page) and `/learner/courses/[slug]/learn/[lessonId]` (curriculum sidebar with completed/locked markers, prev/next, https-only video, free-preview banner for non-enrolled, locked lesson -> redirect to course page). `PortalShell` renders children only on player routes (distraction-free). Pure logic in `src/features/player/navigation.ts`. Playwright expect timeout is now 10s. E2E lessons: the shared e2e learner is used by BOTH projects in parallel, so scope locators to a card; toggles are not idempotent so never retry-click them.
- Progress (T-037): `completeLesson(slug, lessonId)` and `saveVideoPosition(slug, lessonId, seconds)` in `src/features/player/progress.ts` re-derive the caller enrollment and check the lesson belongs to the ENROLLED version; completion is idempotent (first completed_at kept), position is normalised to whole seconds (`position.ts`: normalizePosition/startPosition/shouldPersist). `ResumableVideo` (seek on metadata, save on pause / every 10s / reset on end, best-effort) and `LessonControls` (Mark complete and continue -> next lesson) are client components; previews are not tracked. Header progress bar on the player. Tests: position + ResumableVideo (jsdom) unit, `progress-actions` integration (mocks the server client with a signed-in one), player E2E. Course completion/certificate rule is T-040. Never run two Playwright runs at once (shared e2e learner + port) - a backgrounded run caused mass false failures.
- Assessments schema (T-038): migration `assessments` adds assessments (per course version, optional lesson link, pass_mark, max_attempts null=unlimited, time_limit), assessment_questions (mcq/multi/true_false/short_answer/essay/coding, points), assessment_options (label only), **assessment_answer_keys** (correct_option_ids, accepted_answers, explanation - learners have NO policy, so no query shape can return a key) and assessment_attempts (status in_progress/submitted/graded, answers jsonb, score/percent/passed; learners can only SELECT their own - creation, saving and grading must run server-side with the service role in T-039). Read access = exact-version enrollment, owner or staff (`can_access_assessment_version`); edit = `can_edit_version` (draft/changes_requested only). `getLearnerAssessment` (src/features/assessments/learner.ts) is an explicit whitelist mapper - never select(*) in learner paths. Test fixture `createAssessment` in tests/support/course-fixtures.ts. Remember createCourse publishes by default: pass publish:false when testing owner edits.
- Assessment player (T-039): pure rules in `src/features/assessments/grading.ts` (gradeAttempt: mcq/true_false exact option, multi = exact set, short_answer normalised match, essay/coding = manual review -> status submitted, passed null; decideStart retry rules; 30s submit grace; shouldRevealKey only after pass or attempts exhausted) and `answers.ts` (sanitizeAnswers of untrusted input). Server actions `startAttempt/saveAnswers/submitAttempt` (`attempts.ts`) authenticate with the request client, require an enrollment on the assessment version, then use the service-role client (`src/services/supabase/admin.ts`, first shared admin helper) to write attempts and read keys; submit is rate limited (`assessment-submit` 30/h). Expired in-progress attempts are graded when the learner returns (`state.ts`). UI: `/learner/courses/[slug]/assessments/[assessmentId]` (focus mode like the player), runner with autosave (800ms debounce), countdown timer with auto-submit, confirm-before-submit, result view with per-question breakdown; quiz lessons link to their assessment via assessments.lesson_id. Tests: grading/answers unit, attempt-actions integration (10), assessment E2E. Instructors cannot yet grade essay/coding attempts (needs an instructor grading screen, later).
- Completion + certificates (T-040): pure rule `src/features/completion/rules.ts` (all lessons satisfied - marked complete, or a quiz lesson whose linked assessment is passed - AND every assessment passed; empty course never completes). `evaluateCompletion(admin, enrollmentId)` recomputes eligibility from the DB, marks the enrollment completed and issues the certificate (idempotent, respects certificate_enabled); called (best effort via tryEvaluateCompletion) from `completeLesson` and when `finalizeAttempt` grades a pass. Migration `certificates`: table with unique immutable code MLC-XXXX-XXXX-XXXX-XXXX (64 random bits), snapshots of learner name/course title/instructor, status issued|revoked; guard trigger blocks changing identity fields and reinstating; audit trigger writes `certificate_events` (issued/revoked with actor+reason); clients can only SELECT (own, owning instructor, staff); no DELETE trigger - FKs cascade so account/course erasure works. Public verification = RPC `verify_certificate(code)` returning only printed fields (no ids/email). Learner name = profile full_name, else email local part. Revocation UI/action is admin work (T-1xx); verify page + Certificates list is T-041. Lesson controls show a course-completed banner with a certificates link.
- Certificates UI (T-041): `/learner/certificates` lists the learner own certificates (Valid/Revoked badge, ID, copy-link, link to the public page). Public `/certificates/verify` (lookup form, GET, redirects to the normalised ID) and `/certificates/verify/[id]` (valid / revoked banner + printed details only; unknown or malformed ID = real 404 because there is no loading.tsx above it; robots noindex; IP rate limited via `certificate-verify` 10/10min per subject-less bucket x30). `normalizeCertificateCode` in src/features/certificates/queries.ts. proxy matcher also refreshes sessions on /certificates/*. E2E asserts the delivered HTML contains no email/user id/cert row id.
- Learner dashboard (T-042): `/learner` is now real (`src/features/dashboard/{logic,data}.ts`): greeting from profile name/email, Continue learning (most recent in-progress course), Today's learning (next unfinished lesson of up to 3 in-progress courses + lessons completed today, UTC day), Active path (honest empty state until T-080), Upcoming assessments (not passed, not awaiting review, attempts left; in-progress first), Recommendations (interests from onboarding -> catalog categories round-robin, top-rated fallback, owned courses excluded). All via the request-scoped client. loading.tsx/error.tsx now exist at /learner root. E2E note: the populated dashboard spec uses its own learner because only 3 recent courses show and the shared e2e learner accumulates enrollments.
- Learner Assessments list (T-043): `/learner/assessments` (Upcoming / Completed tabs via ?tab=). `src/features/assessments/list.ts`: pure `classifyAssessment` (not_started, in_progress, failed_retry, pending_review, passed, failed_final; isUpcoming = the first three) and `listMyAssessments` (enrollments -> assessments -> own attempts, best/latest score). The dashboard Upcoming block now reuses it (the older duplicate logic was removed).
- Learner journey E2E (T-044): `tests/e2e/learner-journey.spec.ts` walks login -> catalog search -> detail -> enroll (persists on refresh) -> My Learning -> player (complete lessons, progress persists) -> assessment (fail, retry, pass, result persists) -> certificate issued -> public verify (no private data). Signup itself stays in auth.spec.ts (needs a real inbox). Phase 2 (learner core loop) is complete.
- Regression lessons after T-044: any loading.tsx above a route that can call notFound() turns its 404 into a streamed 200 - keep loading.tsx inside a route group next to the page it serves (`courses/(list)`, `learner/(home)`). Player header progress bar is now visible on mobile (was display:none, invisible to the accessibility tree). Full E2E: 140 passing on desktop+mobile.
- Instructor overview + My Courses (T-050): migration `instructor_courses` (RPC hard-wired to auth.uid(); latest version status, live flag, learner/completion counts, rating; not callable by anon). `src/features/instructor/courses.ts`: `getInstructorCourses`, pure status filter groups (Drafts / In review incl. approved / Needs changes = changes_requested+rejected / Published / Archived), search, counts, `summarizeInstructor` (KPIs, weighted rating, pending lists). Pages `/instructor` (route group `(home)`) and `/instructor/courses` (`(list)`) - loading.tsx sits in the groups so nested pages keep real 404s. Course cards link to `/instructor/courses/[courseId]` (built in T-059). Test gotcha: PostgREST bulk inserts with different key sets send NULL for missing columns (not defaults) - give every row the same explicit keys.
- Course basics (T-051): guided flow config in `src/features/course-authoring/steps.ts` (`built` flags: flip per task so the step bar never links to missing screens; T-052 must set curriculum built:true). `/instructor/courses/new` + `/instructor/courses/[courseId]/basics` share `BasicsForm`. Server actions `createCourseAction/updateBasicsAction` (FormData): zod `basicsSchema`, unique slug via `slugCandidates`, course + version 1 draft under RLS (orphan course removed with admin client if the version insert fails), edits only when the newest version is draft/changes_requested (`pickEditableVersion`), owner check (`getCourseForEditing` also blocks staff). Thumbnail: storage adapter `src/services/storage` (ADR-014, Supabase Storage bucket `course-thumbnails`, public read, no client write policies, 2 MB, PNG/JPEG/WebP validated by magic bytes in `src/lib/image.ts`, replaced files are deleted). CourseCard renders uploaded thumbnails. `/instructor/courses/[courseId]` is an interim redirect to /basics until T-059. Gotcha: never pass functions from a server page to a client component (use a string template). Read docs/CODING_AGENT_GUIDELINES.md before major features (user instruction).
- Curriculum builder (T-052): `/instructor/courses/[courseId]/curriculum`. Pure ordering helpers (`ordering.ts`: moveItem/moveBy/isPermutation/nextPosition); server actions in `curriculum-actions.ts` (add/rename/delete section+lesson, reorderSections/reorderLessons taking a full ordered id list that must be an exact permutation, moveLessonToSection) all pass through `authorize` (login -> own course -> newest version editable) and verify the section/lesson belongs to that version; RLS backs it up. UI `CurriculumBuilder`: native HTML5 drag & drop plus the accessible alternative (move up/down buttons, Move to section select), inline rename, two-step delete confirmation, aria-live status, rows wrap at 375px (a non-wrapping row overlapped the rename form on mobile). Migration `version_touch`: triggers on sections/lessons refresh the parent version updated_at and total duration_minutes. Lesson types video/text/quiz/assignment; quiz assessments attach in T-054, lesson content in T-053. Basics page links to the next built step (`nextBuiltStep`).
- Lesson editor (T-053): `/instructor/courses/[courseId]/lessons/[lessonId]` (Edit-content link on each curriculum row). Rich text = small contentEditable editor (`RichTextEditor`, execCommand; toolbar mousedown is cancelled so selection survives; paste is plain text) - NO new dependency; the server always sanitizes on save (`saveLesson`) and again on render; sanitizer now maps b/i to strong/em because Chrome emits them. Video: https link OR upload; uploads go browser -> Supabase Storage with a server-issued one-time signed upload token (`requestUpload`, never through Next), stored as `storage://course-videos/<courseId>/<lessonId>/<uuid>.ext` (`normalizeVideoRef` only accepts this course own files); learners get a 1h signed URL (`src/features/player/media.ts`) only after reading the lesson under their own RLS. Attachments: private bucket `lesson-assets` (10 MB, allow-listed mime types enforced by the bucket), `registerAsset` verifies path prefix + object existence, max 10 per lesson, 10-minute signed download links in the player Downloads list. Buckets: course-videos (private, 50 MB = Supabase free-plan cap, mp4/webm), lesson-assets. Storage adapter gained createSignedUpload/createSignedUrl/exists. Also fixed a T-051 bug: Next Server Actions cap bodies at 1 MB, so next.config now sets serverActions.bodySizeLimit 3mb (thumbnails up to 2 MB). Remaining gap: video content type is only enforced by bucket mime allow-list, not magic bytes (direct uploads bypass the server).
- Assessment builder (T-054): `/instructor/courses/[courseId]/assessments` (list + create, optionally attached to a quiz lesson via assessments.lesson_id, unique) and `.../assessments/[assessmentId]` (settings: pass mark, attempts or unlimited, time limit; questions: mcq, multi, true_false, short_answer, essay, coding with points, explanation, reorder, confirm-delete). Pure rules in `assessment-rules.ts` (`validateQuestion/validateSettings`, shared by UI and server). Question save is atomic via migration RPC `save_assessment_question` (security INVOKER, so RLS/can_edit_version still applies; replaces options + answer key in one transaction). Authoring reads keys through RLS (owner/staff only): `getAssessmentForAuthoring`; learners still only get `getLearnerAssessment`. Quiz lesson editor shows Create/Edit assessment (`QuizAssessmentLink`); curriculum header links to Assessments. Manual grading of essay/coding attempts is still missing (instructor review UI comes later). Test gotcha: a label containing a textarea has the textarea value in its accessible name.
- Pricing & settings (T-055): `/instructor/courses/[courseId]/pricing` (free/paid with money parsed to cents in `pricing-rules.ts`, min 1.00 / max 9,999.99, USD/EUR/GBP/INR; certificate on/off; visibility public|unlisted; up to 5 prerequisites from the instructor other courses with cycle detection `wouldCreateCycle`). Migrations: `pricing_settings` (course_versions.visibility, table `course_prerequisites` with RLS, search_courses now excludes unlisted - they stay reachable by URL) and `prerequisite_enforcement` (`prerequisites_met()` added to the self-enroll RLS policy so a direct API insert cannot bypass it; `get_prerequisite_titles`). `enrollInCourse` also checks prerequisites for a friendly message; course page lists them. Paid courses still cannot be bought (commerce phase). PostgREST gotcha: courses<->course_versions is ambiguous (two FKs), embed with `course_versions!course_versions_course_id_fkey`. Input inside a label adds its value to the accessible name, so E2E should target such inputs by placeholder.
- **Known issue — Leaked Password Protection disabled:** Supabase security advisor flags `auth_leaked_password_protection` (HaveIBeenPwned check on signup/reset) as off. It's a project-level Auth setting with no MCP/SQL control surface (same category as "Confirm email" was) — ask the user to enable it in the dashboard (Auth → Policies → Password) when convenient; not blocking any task's acceptance bar today.

## Source Prototypes Reviewed

### Learner

Prototype/project:
`LearnSphere`

Key screens:
- Dashboard
- My Learning
- Learning Path
- Course Player
- Quiz
- Progress
- Calendar
- Certificates
- AI Tutor
- Notifications
- Assessments
- Discussions
- Assignments

### Instructor

Prototype/project:
`LMS Instructor Portal Design`

Key screens:
- Dashboard
- My Courses
- Create Course
- Curriculum Builder
- Lesson Editor
- Assessment Builder
- Assignment Builder
- Question Bank
- Course Preview
- Course Readiness
- Review Submission
- Review Feedback
- Student Management
- Discussions
- Messaging
- Analytics
- Reviews
- Earnings
- Certificates
- Resource Library
- AI Assistant
- Settings

### Admin

Prototype/project:
`Admin Console prototype`

Key areas:
- Overview
- Users
- Instructors
- Organizations
- Roles & Permissions
- Courses
- Course Review
- Enrollments
- Assessments
- Certificates
- Commerce
- Content
- Moderation
- Analytics
- Notifications
- AI
- Knowledge Base / RAG
- Integrations
- Audit Logs
- Settings
- Security

## Current Design Direction

### Learner

Light interface:
- white sidebar,
- light gray workspace,
- blue primary,
- indigo/purple AI accent,
- progress-focused cards.

### Instructor

Dark sidebar:
- `#0F172A`
- indigo active state,
- light workspace,
- guided course creation.

### Admin

Enterprise operational console:
- information-dense,
- grouped navigation,
- tables,
- filters,
- pending actions,
- audit and security workflows.

## Current Recommended Stack

```text
Next.js
TypeScript
Tailwind CSS
PostgreSQL / Supabase
Supabase Auth
Git + GitHub
Playwright
Vercel
```

This is aligned with the supplied Vibe Coding guide's recommended web stack.

## Current Architecture Choice

Modular monolith.

No microservices unless a measured requirement later justifies extraction.

## Current Core Flow

```text
Authentication
→ Learner Dashboard
→ Course Catalog
→ Course Detail
→ Enrollment
→ Course Player
→ Progress
→ Assessment
→ Completion
→ Certificate
```

Instructor flow:

```text
Authentication
→ Dashboard
→ Create Course
→ Curriculum
→ Content
→ Assessment
→ Preview
→ Readiness
→ Submit
→ Review
→ Publish
→ Analytics
```

Admin flow:

```text
Authentication + MFA
→ Overview
→ Pending Actions
→ Users/Courses/Organizations
→ Operations
→ Analytics
→ AI/Security/System
→ Audit
```

## Completed Decisions

- [x] Separate learner/instructor/admin portals.
- [x] Shared design system.
- [x] Modular monolith.
- [x] PostgreSQL/Supabase.
- [x] Supabase Auth.
- [x] Explicit course states.
- [x] Course versioning.
- [x] Server-side authorization.
- [x] Playwright E2E.
- [x] Preview before production.
- [x] Vertical slice development.
- [x] AI treated as assistive.

## Immediate Next Work

### Phase 0 — Foundation

- [x] Create Next.js application.
- [x] Configure TypeScript.
- [x] Configure Tailwind.
- [x] Configure linting/formatting.
- [x] Configure Git.
- [x] Create environment template.
- [x] Establish shared design tokens.
- [x] Establish base UI components.

### Phase 1 — Authentication

- [ ] Learner login.
- [ ] Learner signup.
- [ ] Email verification.
- [ ] Password reset.
- [ ] Instructor role routing.
- [ ] Admin authentication.
- [ ] Admin MFA.
- [ ] Protected route tests.

### Phase 2 — Learner vertical slice

- [ ] Course catalog.
- [ ] Course detail.
- [ ] Enrollment.
- [ ] Course player.
- [ ] Lesson progress.
- [ ] Assessment.
- [ ] Completion.
- [ ] Certificate.

### Phase 3 — Instructor vertical slice

- [ ] Create course.
- [ ] Curriculum.
- [ ] Lesson.
- [ ] Assessment.
- [ ] Preview.
- [ ] Readiness.
- [ ] Submit for review.

### Phase 4 — Admin vertical slice

- [ ] Course review.
- [ ] Approval/rejection.
- [ ] User management.
- [ ] Audit event.
- [ ] Basic analytics.

## Known Prototype Limitations

The supplied prototypes are primarily UI prototypes and contain:
- local state,
- sample data,
- simulated interactions,
- prototype routing,
- simulated AI responses.

These must not be treated as production persistence.

## Known Design Improvements

1. ~~Replace emoji icons with one consistent icon set.~~ Done (lucide-react).
2. Normalize spacing and typography tokens.
3. ~~Add real URL routing.~~ Done for shells (ADR-027).
4. Add server-backed loading/error/empty states.
5. Add authorization-aware navigation.
6. Add confirmation for destructive operations.
7. Add accessible keyboard behavior.
8. Add real pagination/filter/query state.
9. Add real audit events.
10. Add real AI provider and usage tracking.

## Current Known Risks

- Scope expansion.
- Building UI before data model.
- Mixing authorization with UI state.
- Treating prototype data as real data.
- Overbuilding AI before core learning works.
- Creating too many screens before completing one vertical slice.
- Allowing AI coding agents to modify unrelated files.

## Working Method

For every feature:

```text
READ
→ UNDERSTAND
→ PLAN
→ IMPLEMENT
→ TEST
→ REVIEW
→ FIX
→ COMMIT
→ UPDATE DOCUMENTATION
```

This follows the final workflow in the supplied guide.
