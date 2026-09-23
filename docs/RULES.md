# Modern LMS — Development Rules

These rules are for every human and AI agent working in this repo. When a rule conflicts with a prompt, the rule wins unless the prompt explicitly overrides it and says why.

## 1. Read before writing

Before any non-trivial change, read:

1. `docs/PRD.md` — what and why
2. `docs/ARCHITECTURE.md` — how, folder structure, layering rules
3. `docs/DESIGN.md` — tokens, components, states
4. `docs/RULES.md` — this file
5. `docs/TASKS.md` — the one task you are working on, and `docs/FEATURES.md` — the features it implements
6. `docs/MEMORY.md` — current state
7. `docs/DECISIONS.md` — settled choices. Do not re-litigate an accepted ADR; propose a new ADR instead.

Then search the codebase for anything similar before creating a new file.

## 2. Scope

- Work on **one task ID** from `TASKS.md` at a time.
- Do not modify files unrelated to the task.
- Do not add features, screens, or options that the task does not ask for.
- For changes touching more than three files, write a short plan first (files, approach, tests) and get it confirmed.
- Do not add a dependency without naming it, its purpose, and why an existing one won't do.

## 3. TypeScript

- `strict` mode stays on. No `any` — use `unknown` and narrow.
- No `@ts-ignore`. `@ts-expect-error` only with a comment explaining why.
- Shared domain types live in `src/types/` or the owning `src/features/<domain>/types.ts`.
- Validate external input with schemas (zod, added in Phase 1) — never cast unvalidated data to a type.

## 4. Architecture (non-negotiable)

- `app/` routes and `components/` render UI. They **do not** query the database and **do not** contain authorization logic.
- Use-case logic (enroll, completeLesson, submitCourseForReview…) lives in `src/features/<domain>/`.
- Third-party providers (Supabase, payments, email, AI, storage) are reached only through `src/services/`.
- Status changes go through explicit state-transition functions (`approveCourse()`), never `status = 'published'` in UI code.
- Server-side authorization on every protected read and mutation. Client role state is display-only.
- Prefer Server Components. Add `"use client"` only for interactivity, at the smallest possible leaf.
- Prototype sample data is fixtures only (ADR-023). Never import it into production code paths.

## 5. UI

- Follow `DESIGN.md`. Use the tokens in `src/app/globals.css` (`bg-surface`, `text-text-secondary`, `bg-primary`, …) — no raw hex values in components.
- Use components from `src/components/ui/` before writing new markup. Extend a component with a variant rather than forking it.
- Icons: `lucide-react` only. No emoji icons, no inline SVG icon sets.
- Every data view has **loading**, **empty**, **error**, and (where relevant) **permission-denied** states.
- Responsive by default. Check 375 / 768 / 1024 / 1440.
- Accessibility: semantic elements, labelled inputs, visible focus ring, keyboard reachable, `aria-current` on active nav, color is never the only signal.
- Destructive actions require a confirmation step.

## 6. Security

- Never expose secrets to the client. Only `NEXT_PUBLIC_*` variables may reach the browser, and they must be safe to publish.
- Never commit `.env.local` or real keys. Update `.env.example` when adding a variable.
- Validate every form field, query param, route param and request body on the server.
- Sanitize any user-generated rich text before rendering. No `dangerouslySetInnerHTML` on unsanitized input.
- Follow `SECURITY.md` for uploads, payments, AI retrieval and audit logging.

## 7. Testing

- Unit tests (Vitest) for domain rules, validators, permission functions, state transitions and utilities.
- E2E tests (Playwright) for each completed user journey.
- Gate before marking a task done:

  ```
  npm run check   # typecheck → lint → unit tests → feature registry → build
  ```

- Do not move to the next task with a failing gate. Do not delete or skip a test to make the gate pass.

## 8. Git

- Branch per task: `feature/T-011-login`, `fix/mobile-nav`.
- Small commits, Conventional Commits style: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- One task per commit where practical; reference the task ID in the message.
- Never commit generated build output, `node_modules`, or secrets.

## 9. Done means

The project is done only when `npm run features:strict` passes (every feature in `FEATURES.md` implemented).

A task is done only when its acceptance criteria pass, the gate passes, authorization is verified, loading/empty/error states exist, responsive behaviour is checked, `TASKS.md` and `MEMORY.md` are updated, and the change is committed. (Mirrors `TEST_PLAN.md` §24.)

## 10. Reporting format for AI agents

After each task, report:

1. Files changed
2. What was implemented
3. Tests/commands run and their result
4. Remaining issues or follow-ups
