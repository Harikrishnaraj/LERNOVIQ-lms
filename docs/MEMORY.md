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

**Next task:** T-014 (wire signup to Supabase Auth + `/verify-email`).

**Supabase project:** `modern-lms` (`ctrizucnfaqescligsuu`, ap-south-1) — created for this repo via the Supabase MCP. The account's two other projects (`trenning-lms`, and the account default project, now paused) have unrelated pre-existing schemas/data and must not be touched by this repo's migrations. `.env.local` (gitignored) points at `modern-lms`.

**Auth setting to revert before T-014:** "Confirm email" is OFF on the `modern-lms` project's Auth settings, so `tests/integration/profiles-roles.test.ts` can sign in immediately after `signUp()` without a service-role key. T-014 implements real email verification and TEST_PLAN §3 checks "Verification flow works" — turn "Confirm email" back on (Dashboard → Authentication → Sign In / Up → Email) before or during that task, or switch the integration test to the admin API with a service-role key first.

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

- `src/lib/supabase/{env,client,server,middleware}.ts` (T-011): `client.ts` for Client Components (`createBrowserClient`), `server.ts` for Server Components/Actions/Route Handlers (`createServerClient` + `next/headers` cookies), `middleware.ts` exports `updateSession(request)` for session refresh — not yet wired into a root `middleware.ts` (that lands with route guards, T-016/T-019). `env.ts` zod-validates `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` and throws a clear error if missing, rather than connecting to `undefined`.
- `supabase/migrations/20260923102957_profiles_roles_permissions.sql` (T-012): `profiles` (`id` → `auth.users`, `full_name`, `avatar_url`, `status` active/suspended, timestamps) auto-populated on signup via a `SECURITY DEFINER` trigger (execute revoked from `public`/`anon`/`authenticated` — it must only run as a trigger); `roles`/`permissions`/`role_permissions`/`user_roles` (text-slug PKs). RLS on all 5 tables: `profiles`/`user_roles` are select-own-row only, `roles`/`permissions`/`role_permissions` are select-all-for-`authenticated` (non-sensitive reference data). No client-side insert/update/delete policies anywhere. Seeded the 7 roles from SECURITY §3; `permissions`/`role_permissions` are left empty until a task needs specific grants. Verified via `tests/integration/profiles-roles.test.ts` (skipped automatically when `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` aren't set) and the Supabase security advisor (0 findings).
- `/signup` (T-013): `src/features/auth/schemas.ts` (`signUpSchema`, zod), `src/components/forms/signup-form.tsx` (client-validated form, loading/error states, no new form-library dependency), `src/app/(auth)/signup/page.tsx`. The page's `onSubmit` is `src/features/auth/sign-up.ts`'s `signUp` Server Action, currently a stub returning `{ error: "Sign-up isn't connected yet — lands in T-014." }` — honest placeholder, not fake success. T-014 replaces its body with the real Supabase call + `/verify-email` redirect.

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
