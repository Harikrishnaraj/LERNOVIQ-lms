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

**Next task:** T-018 (role-aware redirect after login).

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
