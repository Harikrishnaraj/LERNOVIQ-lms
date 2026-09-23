# Modern LMS

A multi-role learning platform with separate **Learner**, **Instructor** and **Admin** portals on one shared design system.

**Status:** Phase 0 (Foundation) complete. Authentication (Phase 1) is next. See `docs/MEMORY.md`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · lucide-react · Vitest · Playwright.
Coming in Phase 1: Supabase (Postgres + Auth + RLS), zod.

## Getting started

Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev                    # http://localhost:3000
```

Portals: `/learner`, `/instructor`, `/admin` (open without login until Phase 1).

## Scripts

| Command             | What it does                                                                       |
| ------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`       | Dev server                                                                         |
| `npm run typecheck` | TypeScript, no emit                                                                |
| `npm run lint`      | ESLint                                                                             |
| `npm test`          | Vitest unit/integration tests                                                      |
| `npm run test:e2e`  | Playwright (builds + starts the app). First run: `npx playwright install chromium` |
| `npm run build`     | Production build                                                                   |
| `npm run check`     | typecheck → lint → test → build (the gate before any commit)                       |
| `npm run format`    | Prettier (sorts Tailwind classes)                                                  |
| `npm run features`  | Feature coverage report + next task (`features:strict` fails until all are built)  |

## Project docs — read before changing code

| File                                           | Answers                        |
| ---------------------------------------------- | ------------------------------ |
| [`docs/PRD.md`](docs/PRD.md)                   | What are we building and why?  |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How is it built?               |
| [`docs/DESIGN.md`](docs/DESIGN.md)             | How should it look and feel?   |
| [`docs/RULES.md`](docs/RULES.md)               | How should humans and AI code? |
| [`docs/FEATURES.md`](docs/FEATURES.md)         | What must ship? (all features) |
| [`docs/TASKS.md`](docs/TASKS.md)               | What do we build next?         |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | Why was it decided this way?   |
| [`docs/MEMORY.md`](docs/MEMORY.md)             | What is the current state?     |
| [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md)       | How do we know it works?       |
| [`docs/SECURITY.md`](docs/SECURITY.md)         | How do we protect it?          |

## Layout

```text
src/
├── app/               routes: (landing), learner/, instructor/, admin/
├── components/
│   ├── ui/            Button, Input, Card, Badge, StatusBadge, Skeleton
│   ├── feedback/      Empty / Error / Permission-denied / Loading states
│   └── layout/        PortalShell, PageHeader, PlaceholderPage
├── config/            navigation.ts — single source for all portal nav
├── features/          domain logic (courses/course-status.ts …)
├── lib/utils/         cn()
└── types/
tests/
├── unit/
├── integration/
└── e2e/
```

## Working with Claude Code

Open the folder in Claude Code. It reads `CLAUDE.md` automatically. Then, for every task:

```text
/next-task
```

It picks the next task from `npm run features`, plans, implements, tests, ticks and commits.
To audit a feature: `/verify-feature F-105`. The project is finished when `npm run features:strict` passes.
