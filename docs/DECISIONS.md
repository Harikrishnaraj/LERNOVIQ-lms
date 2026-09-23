# Modern LMS — Architecture & Product Decisions

This document records durable decisions so AI coding agents do not repeatedly reconsider established choices.

## ADR-001 — Use Next.js + TypeScript

**Decision:** Use Next.js with TypeScript.

**Reason:** The LMS needs a production web application with public pages, protected role portals, server-side authorization, APIs/server actions and SEO-friendly course pages. The supplied Vibe Coding guide also recommends Next.js + TypeScript for a serious beginner-to-production web project.

**Status:** Accepted.

## ADR-002 — Use PostgreSQL / Supabase

**Decision:** Use PostgreSQL through Supabase.

**Reason:** LMS data is relational: users, organizations, courses, curriculum, enrollments, assessments, certificates, payments and audit records. PostgreSQL also gives strong querying and transaction semantics.

**Status:** Accepted.

## ADR-003 — Use Supabase Auth

**Decision:** Use Supabase Auth for the initial authentication implementation.

**Reason:** It integrates with the PostgreSQL/Supabase stack and supports the authentication needs without creating a custom identity system.

**Status:** Accepted.

## ADR-004 — Modular Monolith First

**Decision:** Build a modular monolith rather than microservices.

**Reason:** The LMS has many domains but is still one product. A modular monolith reduces deployment and debugging complexity while preserving domain boundaries for later extraction.

**Status:** Accepted.

## ADR-005 — Three Separate Portal Shells

**Decision:** Learner, Instructor and Admin have separate route namespaces and navigation shells.

**Reason:** Their tasks, information density and permission models differ substantially. Sharing one shell would make the product harder to understand.

**Status:** Accepted.

## ADR-006 — Shared Design System

**Decision:** All portals use one shared component and token system.

**Reason:** The prototypes share visual language even though their layouts differ. Shared primitives prevent visual drift.

**Status:** Accepted.

## ADR-007 — Preserve the LearnSphere Learner IA

**Decision:** Use the learner prototype's navigation as the baseline.

**Reason:** It provides a coherent learning lifecycle around My Learning, Learning Paths, Progress, Assessments, Assignments, Calendar, Certificates and AI Tutor.

**Status:** Accepted.

## ADR-008 — Guided Instructor Course Builder

**Decision:** Use a multi-step course creation workflow.

**Reason:** The instructor prototype makes a complex workflow understandable through explicit stages. This is preferable to one enormous settings page.

**Status:** Accepted.

## ADR-009 — Admin Operational Console

**Decision:** Keep the admin console grouped by operational domain.

**Reason:** The supplied admin prototype clearly separates Users, Courses, Learning Operations, Commerce, Content, Analytics, Communication, AI, Organizations and System.

**Status:** Accepted.

## ADR-010 — Explicit Course State Machine

**Decision:** Course publishing uses explicit state transitions.

**Reason:** Course review and publishing require auditability and controlled permissions.

```text
draft
→ submitted
→ in_review
→ changes_requested
→ approved
→ published
→ archived
```

**Status:** Accepted.

## ADR-011 — Course Versioning

**Decision:** Published course content is versioned.

**Reason:** Learner history, certificates and audit requirements must not be invalidated by editing a currently published course.

**Status:** Accepted.

## ADR-012 — Server-Side Authorization

**Decision:** Every protected mutation is authorized on the server.

**Reason:** Client-side navigation and hidden buttons are not security boundaries.

**Status:** Accepted.

## ADR-013 — PostgreSQL Search First

**Decision:** Start search with PostgreSQL capabilities.

**Reason:** Course/user/admin search does not initially justify an additional search infrastructure dependency. Introduce a dedicated search engine only after measured requirements.

**Status:** Accepted.

## ADR-014 — Storage Abstraction

**Decision:** Store media in object storage and keep metadata in PostgreSQL.

**Reason:** Videos and documents should not be stored as database blobs.

**Status:** Accepted.

## ADR-015 — External Provider Adapters

**Decision:** Payments, email, AI and video services must be accessed through service adapters.

**Reason:** This reduces vendor lock-in and prevents provider-specific code from spreading throughout the application.

**Status:** Accepted.

## ADR-016 — AI Is Assistive

**Decision:** AI-generated content never publishes automatically.

**Reason:** Course quality, assessment integrity and platform safety require human review.

**Status:** Accepted.

## ADR-017 — AI Retrieval Is Permission-Aware

**Decision:** AI retrieval must enforce the same access rules as the underlying application.

**Reason:** A user must not retrieve private organization/course material simply because an embedding exists.

**Status:** Accepted.

## ADR-018 — Playwright for E2E

**Decision:** Use Playwright for browser-level user-flow tests.

**Reason:** The supplied guide recommends Playwright and specifically emphasizes testing complete user flows from the user's perspective.

**Status:** Accepted.

## ADR-019 — Preview Before Production

**Decision:** Every meaningful feature goes through preview/QA before production.

**Reason:** The guide's deployment flow is local → preview → QA → production.

**Status:** Accepted.

## ADR-020 — Vertical Slice Delivery

**Decision:** Implement complete flows instead of entire technical layers.

**Reason:** A working signup → dashboard → course flow provides earlier validation and reduces integration risk.

**Status:** Accepted.

## ADR-021 — Documentation Is Source of Project Context

**Decision:** AI agents must read PRD, architecture, design, rules, tasks and relevant memory before significant implementation.

**Reason:** The supplied guide explicitly recommends giving the AI project context before coding and using structured prompts.

**Status:** Accepted.

## ADR-022 — Do Not Copy Reference Platforms

**Decision:** Coursera/Udemy/Udacity may inform interaction patterns but not copied branding, assets or exact layouts.

**Reason:** The LMS must have its own product identity and design system.

**Status:** Accepted.

## ADR-023 — Prototype Data Is Not Production Data

**Decision:** Sample users, courses, metrics and AI responses from the prototypes are fixtures/demo content only.

**Reason:** They demonstrate UI behavior and information hierarchy but must not become an implicit database design.

**Status:** Accepted.

## ADR-024 — Current Prototype Design Strengths

Keep:
- learner progress visibility,
- instructor course readiness,
- admin pending-action workflow,
- contextual AI,
- analytics drill-down,
- status-driven operations,
- role-specific shells.

Improve:
- replace emoji icons,
- normalize typography/tokens,
- make all states persistent,
- make URL state shareable,
- add permission-aware empty/error/loading states.

## ADR-025 — Avoid Premature Feature Expansion

**Decision:** Core learning lifecycle is implemented before advanced AI, community, mobile and broad commerce.

**Reason:** The supplied guide warns against starting with every feature and recommends defining MVP and out-of-scope functionality first.

## ADR-026 — Self-Hosted Fonts

**Decision:** Load Inter, Plus Jakarta Sans and JetBrains Mono from `@fontsource-variable/*` via `next/font/local`, not `next/font/google`.

**Reason:** Builds must not depend on reaching Google Fonts (sandboxed CI failed with it). Self-hosting also removes a third-party request from the CSP surface (SECURITY.md §22).

**Status:** Accepted.

## ADR-027 — Placeholder Routes From Navigation Config

**Decision:** Each portal has a `[...section]` catch-all that renders a placeholder for any href in `src/config/navigation.ts` (404 otherwise). A real screen is added by creating an explicit route file, which takes precedence.

**Reason:** Real URL routing and navigation exist from day one without shipping fake prototype data (ADR-023). Every nav item carries the TASKS.md ID that builds it.

**Status:** Accepted.

## ADR-028 — Feature Registry Is the Definition of Done

**Decision:** `docs/FEATURES.md` lists every feature from the PRD and the three prototypes. Every task in `TASKS.md` names the features it implements, and `scripts/check-features.mjs` checks both files and the navigation config against each other. `npm run features:strict` must pass before the project is called complete.

**Reason:** AI-assisted builds tend to drop or quietly shrink features. A machine-checked link between features and tasks makes gaps visible, and a feature can only be removed through an explicit ADR. This supersedes the "Later" bucket in the original task list: deferred features are now scheduled in Phases 5–12, not dropped.

**Status:** Accepted.
