# LERNOVIQ — Architecture & Product Decisions

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

## ADR-029 — SCORM Delivery: Signed Asset Tokens and an Optional Content Origin

**Decision:** SCORM package files are served at `/api/scorm/<lessonId>/<token>/<path>`, where the token is a short-lived HMAC (user + lesson + expiry, key derived from the service-role key) minted only after RLS lets the viewer read the lesson. The route trusts the token, not a cookie. Every HTML file gets the API shim, and a generated host frame (`__lms_frame.html`) holds the API in the parent window for drivers that use the ADL parent search (Rustici scormdriver, i.e. Articulate Storyline). When `NEXT_PUBLIC_SCORM_CONTENT_ORIGIN` names a host distinct from the app, the player frame is served from it with `allow-scripts allow-same-origin allow-modals`, and the proxy returns 404 for everything on that host except `/api/scorm`. Without it, the T-138 behaviour stands: a fully isolated `allow-scripts` sandbox on the app origin.

**Reason:** Manual QA with a real Storyline package showed three blockers. HTML came back from storage as `text/plain`. The sandboxed frame never sends the session cookie, so every sub-file returned 401. The driver only looks for the API in `window.parent`, which is cross-origin under a unique-origin sandbox. The strict same-origin sandbox chosen in T-138 therefore can only run single-page packages. Authoring-tool exports need their frames to share one origin that is not the app's.

**Status:** Proposed. The content origin partly revisits the T-138 choice of no separate subdomain, so it needs the user's confirmation. Production needs a DNS name pointing at the same deployment.

## ADR-030 — Adding Assignments to a Live Course

**Decision:** An instructor may **add** a new assignment to their own published (live) course from the Assignments page, without starting a new version. It is created in the published version, so enrolled learners see it straight away, and — when a newer editable draft exists on top — in that draft too, so the next publish does not drop it. This is additive only: existing live assignments stay locked for editing and deleting, exactly as ADR-011 requires, and everything else in a live course still goes through a new draft version and review. Learners pinned to an older archived version do not get the new assignment. When the newest version is in review (not editable), the assignment goes to the live version only.

**Reason:** Instructors need to set new work for a running cohort (the Assignments page mockup assigns to a live course that already has submissions). Adding a new, separate assignment cannot rewrite any learner's existing history, submission, grade or certificate, which is what ADR-011 protects; changing or removing an assignment that learners may already be working on could, so that stays locked.

**Status:** Accepted (user decision, T-114). Narrows ADR-011; does not replace it.

## ADR-031 — Stripe for Payments (Test Mode First)

**Decision:** Commerce (T-180–T-188) uses **Stripe**, behind the payment adapter required by ADR-015. Development and QA use Stripe **test mode** only; live keys are a separate, later decision. Enrollment in a paid course happens only after a verified Stripe webhook (signature checked, event ID stored for idempotency), never from the browser redirect.

**Reason:** User decision (2026-10-01). Stripe covers checkout, subscriptions, coupons, refunds and payouts (Connect) in one provider; the adapter keeps a second provider (for example Razorpay for India) possible later without touching feature code.

**Status:** Superseded by ADR-038 (Dodo Payments, 2026-10-07). Was: Deferred (2026-10-01) — the user put the payment provider decision on hold shortly after choosing Stripe ("for payment we will decide later"). Kept as the leading option; commerce tasks T-180–T-188 stay open until a provider is confirmed.

## ADR-032 — Production Hosting on Cloudflare Workers (vinext)

**Decision:** Preview and production deployments run on **Cloudflare Workers** using **vinext** (Cloudflare's Vite-based reimplementation of the Next.js API surface), not Vercel. The Worker is named `modern-lms` (already created in the user's Cloudflare account). Supabase stays the database, auth and storage provider. CI keeps running the normal `next build` as well, so the app stays deployable to any standard Next.js host.

**Reason:** User decision (2026-10-01). Checked before choosing the adapter: Next.js 16 runs `src/proxy.ts` on the Node.js runtime with no option to change it, and Cloudflare's OpenNext adapter documents Node.js middleware as "not yet supported" — our session refresh, portal guards, MFA and idle-timeout checks all live in the proxy, so OpenNext is not viable today. Cloudflare recommends vinext for Next.js 16 apps; `npx vinext check` reports this project 95% compatible (all `next/*` imports, the App Router, server actions, route handlers and `src/proxy.ts` supported). The one flagged issue is `__dirname` in a test helper (`tests/e2e/support/env.ts`), not app code.

**Risks:** vinext is in beta. Mitigations: full E2E suite against the Cloudflare preview before any production promotion (ADR-019); keep `next build` green in CI as a fallback path.

**Status:** Superseded by ADR-035 (2026-10-02). Narrowed the "Vercel or equivalent" line in ARCHITECTURE.md; T-248 previews had moved to Cloudflare.

## ADR-033 — Organization SSO via OIDC First

**Decision:** Organization SSO (T-165, F-504) is built on Supabase Auth **custom OIDC providers**, which work on the current Free plan (up to 3 providers per project). Each organization is linked to one provider; a user who signs in through it is placed in that organization. **SAML 2.0** (Pro plan and above) is added later, when a customer needs it, behind the same organization ↔ provider mapping.

**Reason:** User decision (2026-10-01). Verified in Supabase's docs: SAML SSO requires Pro ($25/month, 50 SSO MAU included, $0.015 per extra); custom OIDC providers are available on Free (3 providers; unlimited on Pro). Microsoft Entra, Okta, Google Workspace and Auth0 all speak OIDC.

**Notes:** Supabase does not link an SSO identity to an existing password account with the same email, so the design must handle a person who already signed up with a password.

**Status:** Accepted (user decision).

## ADR-034 — CI Tests Run Against a Local Supabase Stack

**Decision:** Every CI job (Check and each E2E shard) starts its own Supabase stack with the Supabase CLI (Docker) from `supabase/config.toml` and `supabase/migrations`, seeds it with `scripts/seed.mjs`, and runs the integration and E2E tests against it. CI no longer uses the hosted `modern-lms` project or its secrets. `config.toml` mirrors the hosted Auth settings the tests rely on (email confirmation on, TOTP MFA on, Google provider on, sign-ups open, anonymous sign-ins off) and raises per-IP auth rate limits for the suite. The CSP allows the configured Supabase origin when it is not a `*.supabase.co` host, so production's policy is unchanged.

**Reason:** User decision (2026-10-02, T-251). Six E2E shards sharing the free-tier project took it down about 10 minutes into each run (statement timeouts, Auth 504s, no DB connections), failing every shard and making the dev database unusable meanwhile. Throttling to two workers kept it up but made CI take about 2.5 hours. A stack per job is isolated, has no cross-region latency (GitHub's runners are in the US, the project is in ap-south-1) and lets fork PRs run the full suite.

**Notes:** The hosted project is still the source of truth for production settings; a hosted Auth setting a test depends on must be mirrored in `config.toml`. Testing against the real deployment belongs to the production QA checklist (T-250).

**Status:** Accepted (user decision).

## ADR-035 — Cloudflare Removed; Hosting Not Chosen Yet

**Decision:** The Cloudflare Workers / vinext setup from ADR-032 is removed: `cloudflare.config.ts`, `vite.config.ts`, the vinext and Cloudflare packages and scripts, the `build:vinext` CI step, the GitHub Actions deploy job, and the Cloudflare Claude Code plugin config. The app builds and runs only as standard Next.js (`next build` / `next start`). No hosting provider is chosen; CI keeps proving every change is deployable (Check + full E2E on a local Supabase stack, ADR-034).

**Reason:** User decision (2026-10-02): "No need for cloudflare", remove it all, no hosting preference yet. Cloudflare Workers Builds failed on every push (dashboard build settings), and the vinext path added a second, beta build to keep green. The user has also floated a VPS with a self-hosted open-source AI model, which a plain Next.js server fits directly.

**Consequences:** T-248 (preview deployments) and T-250 (production deploy) stay open and are blocked on the hosting decision; their IDs and F-947 are unchanged. Kept from the vinext work because they stand on their own: React 19.3, `"type": "module"`, `next typegen` before `tsc`, and the unique MFA factor name per enrolment (a real double-render race). The Cloudflare Workers Builds Git integration and the `modern-lms` Worker live in the user's Cloudflare account and must be disconnected/deleted there.

**Status:** Accepted (user decision). Supersedes ADR-032. Hosting chosen in ADR-036 (VPS).

## ADR-036 — Production on a VPS with Docker, Deployed by GitHub Actions

**Decision:** Production runs on the user's Ubuntu VPS. The stack has three containers (`deploy/docker-compose.yml`): the Next.js **standalone** server (built from `Dockerfile` with `NEXT_OUTPUT=standalone`), **Caddy** for HTTPS and reverse proxy, and a tiny **cron** container that calls `/api/cron/scheduled-reports` hourly. The CI workflow's `deploy` job runs after Check and every E2E shard pass, on pushes to `main` or a manual "Run workflow". It builds the image, pushes it to GHCR (private) and deploys over SSH as a `deploy` user. The job writes the server `.env` from repository secrets on each deploy, then runs `docker compose pull && up -d` and a smoke check. Until the user has a domain, hostnames default to sslip.io names derived from the IP (`<ip-dashed>.sslip.io` for the app, `content-<ip-dashed>.sslip.io` as the SCORM content origin), so HTTPS works from day one; `PROD_APP_HOST`/`PROD_CONTENT_HOST` override them. Setup steps: `docs/DEPLOY.md`.

**Reason:** User decision (2026-10-02): host on their VPS (no domain yet). A plain Next.js server needs no adapter, matches what CI already tests (`next build`), and leaves room for the self-hosted open-source AI model the user has mentioned. Serving plain HTTP by IP is not an option: the CSP has `upgrade-insecure-requests`, HSTS is on, and the SCORM content origin must be a second host. sslip.io gives two real hostnames with valid certificates without buying a domain.

**Consequences:** `NEXT_PUBLIC_*` values are build arguments (inlined into the client bundle), so a hostname change needs a new build, which a re-run of the deploy job does. Server secrets live only in GitHub secrets and the server's `.env` (mode 600). There is a single instance and no zero-downtime rollout: the restart takes a few seconds. Preview deployments per PR (the rest of F-947 / T-248) are not covered yet. Running them on the same VPS (one stack per PR under its own sslip.io name) is the follow-up. Supabase Auth's Site URL and redirect list must include the production host.

**Status:** Accepted (user decision).

## ADR-037 — No Instructor Commerce; the Platform Sells Courses

**Decision:** Instructors are not paid through the platform and do not set prices.

Removed:
- the instructor "Earnings" link and its planned page (F-604 / T-186, now Descoped);
- the payout details form and its table (`instructor_payout_details`, dropped);
- revenue from the instructor Analytics page;
- the Revenue and Payout details cards on the admin Instructor detail page.

Price and currency now belong to the platform:
- a new `course.price` permission (admin, super_admin);
- a security-definer `admin_set_course_price(course, cents, currency)` that updates every version of the course, so a draft that is later published keeps the platform's price;
- a "Price" control on Admin → Courses → course detail, audited as `course.price_changed`.

Instructors' column grants on `course_versions.price_cents` and `currency` are revoked, so a direct API call cannot set a price. The instructor step "Pricing & settings" becomes "Settings": certificate, visibility and prerequisites, with the price shown read-only. Its URL (`/pricing`) is kept to avoid breaking links.

**Reason:** User decision (2026-10-05): "We don't need commerce for the instructor"; remove instructor money entirely; the platform sells courses.

**Consequences:**
- Learner commerce stays planned, now as platform revenue: checkout, webhooks, subscriptions, coupons, refunds (T-180–T-185) and the admin revenue report (T-187).
- Prices already set on existing courses are kept.
- `create_draft_version` still copies the price into new drafts; it runs as security definer, so the revoked grants do not affect it.
- The instructor analytics RPC still returns revenue figures; the UI no longer shows them.
- Payout details previously saved by instructors are deleted by the migration.

**Status:** Accepted (user decision). Descopes F-604 / T-186; amends F-202, F-220 and F-403.

## ADR-038 — Dodo Payments Replaces Stripe (Test Mode First)

**Decision:** Learner commerce (T-180–T-185, T-187, T-188) uses **Dodo Payments** (a Merchant of Record), behind the payment adapter required by ADR-015. This supersedes ADR-031. Development and QA use Dodo **test mode** only (`environment: "test_mode"`); live keys are a separate, later decision. Enrollment in a paid course happens only after a verified Dodo webhook (Standard Webhooks signature checked via the SDK `unwrap()`, `webhook-id` stored for idempotency), never from the browser return URL.

**Reason:** User decision (2026-10-07). Dodo handles tax/VAT and chargebacks as the legal seller. The platform is the only seller (ADR-037: instructors are not paid in the app, T-186 descoped), so Dodo's lack of split payouts does not matter. Design notes: checkout uses pre-created Dodo products, so each paid course maps to a Dodo `product_id`; discount codes are created in Dodo and passed via `discount_codes`, so T-184 coupons mirror them.

**Status:** Accepted. Needs the user to supply test-mode `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` before T-180 can be built.

## ADR-039 — Rebrand to LERNOVIQ

**Decision:** The product is named **LERNOVIQ** (LERNOVIQ AI TECHNOLOGIES PRIVATE LIMITED) and follows `docs/brand/LERNOVIQ_Brand_Guidelines.pdf` v1.1. The logo is shown only as the supplied artwork through `BrandLogo`, which enforces the minimum sizes and clear space; the wordmark is never retyped and the L emblem is never used alone. Colour tokens move to the brand palette: Navy text and instructor sidebar, brand Blue primary, and a darker blue (`#0052CC`) for text on blue tints, where brand Blue misses WCAG AA. Fonts stay Inter and Plus Jakarta Sans: the guide's preferred Aptos has no web licence. Places too small for the minimum logo size (the 64 px mobile top bar, the browser favicon) show no logo rather than an unapproved derivative.

**Reason:** User decision (2026-10-07): "understand the style guidelines and logos design and implement all the changes" and "name this project as LERNOVIQ".

**Consequences:**
- Everything this repo names was renamed too (2026-10-07, user request "rename all"): VPS folder `~/lernoviq` and compose project `lernoviq` (safe: no production deploy has run yet, T-250 is open), backup artifacts, Supabase local `project_id`, the SCORM message tag `lernoviq-scorm`. Names of outside resources keep `modern-lms` until those are renamed: the GitHub repo `Harikrishnaraj/modern-lms` (and the GHCR image derived from it), the hosted Supabase project (ref `ctrizucnfaqescligsuu`), the local folder, and the deleted Cloudflare Worker in history entries.
- The browser favicon is still Next.js's default until approved favicon artwork exists.

**Status:** Accepted.

## ADR-040 — Product and Repository Renamed to LERNOVIQ

*Numbered ADR-037 on a parallel branch; renumbered when the branches merged (2026-10-12). It overlaps ADR-039, which governs branding and the logo; this entry settles the infrastructure names: VPS folder, compose project, deploy key and backup artifacts use `lernoviq-lms`, superseding the `lernoviq` names in ADR-039's consequences.*

**Decision:** The product is called **LERNOVIQ** (all caps) everywhere users see it: page titles, portal and auth headers, the landing page, certificate verification text, the apply-to-teach copy, and the course page's structured data. The GitHub repository is `Harikrishnaraj/LERNOVIQ-lms` and the npm package is `lernoviq-lms`. The internal SCORM `postMessage` tag is `lernoviq-scorm`; the shim is injected when content is served, so stored packages need no change.

**Reason:** User decision (2026-10-07): the repository and local folder were renamed from `modern-lms` to `LERNOVIQ-lms`, and the user chose to rebrand the app as "LERNOVIQ".

**Consequences:** The hosted Supabase project keeps its name (`modern-lms`, `ctrizucnfaqescligsuu`), and so does `supabase/config.toml`'s `project_id`, which mirrors it. Historical entries in `MEMORY.md`, earlier ADRs and `docs/audits/` keep the old name. A follow-up (2026-10-07) also renamed the VPS deploy directory to `~/lernoviq-lms`, the compose project to `lernoviq-lms`, the deploy key file names and the backup artifact names. Nothing needed moving on the server: the deploy job had never run, because its secrets were not set yet.

**Status:** Accepted (user decision).

## ADR-041 — Content Server: Dispatching SCORM Courses to Other LMSs (Phase 1)

*Numbered ADR-038 on a parallel branch; renumbered when the branches merged (2026-10-12).*

**Decision:** LERNOVIQ can act as a content server for customers who run their own LMS, the model KESDEE's K-LMS calls the "Content Server Approach" (the industry term is SCORM dispatch). An admin creates a **content client** (customer) with a **licence**: the courses it may use, a seat limit, an expiry date, the LMS domains allowed to embed the content, and a revoke switch. For each licensed course the admin downloads a **dispatch package**: a small SCORM 1.2 zip that holds only a manifest and a launcher page, never the course files. The customer uploads it into their LMS. At launch the launcher calls LERNOVIQ with the dispatch's signed ID; LERNOVIQ checks the licence, seats and embedding domain, issues a short-lived content token, and serves the real course from the existing SCORM content origin (ADR-029). The course's SCORM calls are relayed through the launcher to the customer LMS's own SCORM API, so tracking, completion and reporting live in the customer's LMS. LERNOVIQ keeps only what licensing needs: one registration per (dispatch, LMS learner ID), with the learner ID stored as a keyed hash, plus launch counts and timestamps for usage reports.

**Phase 1 scope:** courses that are already SCORM packages in LERNOVIQ; SCORM 1.2 dispatch packages (matching K-LMS); licences, seats, expiry, domain allowlist, revoke; usage report and audit events. **Later phases (not in scope here):** dispatching LERNOVIQ's own native courses (needs a standalone player), SCORM 2004 / cmi5 dispatch, automatic billing (depends on the payment decision, now ADR-038), a customer-facing usage portal.

**Reason:** User decision (2026-10-12), after comparing LERNOVIQ with K-LMS: the content-server model lets customers who already own an LMS buy KESDEE content without leaving their system. Most of the machinery exists: SCORM storage, validation, the isolated content origin, signed content tokens (`services/scorm/token.ts`) and the postMessage relay between frames.

**Consequences:** New tables (content clients, licences, dispatches, registrations) with RLS that only admins with a new `content_server.manage` permission can use; the launch and content endpoints are public but gated by signatures, licence state and rate limits (SECURITY §27). Content served to a dispatch must be embeddable from the client's allowed LMS origins, so the content origin's `frame-ancestors` becomes per-licence for dispatch launches only; the app origin's CSP is unchanged. Pricing model (per active learner, per licence or flat fee) is still open; Phase 1 records registrations so any of them can be billed later. Tests need a stand-in LMS page that implements the SCORM 1.2 API.

**Status:** Accepted (user decision). Features F-520–F-525, tasks T-170–T-177.

## ADR-042 — Marketing Website from the Claude Design Export

**Decision:** The public marketing site follows the Claude Design export `Lernoviq landing page design/export/website-v2` (10 pages, shared header and footer) and is built inside the Next.js app, not as a separate static site: Home `/`, `/about`, `/solutions`, `/lms`, `/industries`, `/delivery`, `/contact`, `/faqs`, the course catalogue `/courses` (restyled, live data) and `/cart`. Design colours become `--color-landing-*` tokens; all text uses Plus Jakarta Sans as in the export. Adaptations:
- **Courses:** the live catalogue (`search_courses`) replaces the export's sample courses (ADR-023). Prices stay in each course's own currency; the export's INR/USD toggle is dropped because courses have one price.
- **Cart:** built as designed (Myself / My company, seats, GSTIN, order summary) in the browser's localStorage, but checkout is disabled with a notice until learner commerce ships with Dodo Payments (ADR-038). The export's Razorpay checkout is not built.
- **Contact:** enquiries are validated and rate-limited server-side, stored in a new `enquiries` table readable by admins (new `enquiry.read` permission, Admin → Enquiries), and emailed to `CONTACT_NOTIFY_EMAIL` via Resend when that is set.
- Unverified items the export marks TO_CONFIRM (contact details, privacy/terms links) are not invented.

**Reason:** User decisions (2026-10-14): "The design was multi pager … first understand the design in all pages and then start applying"; Courses/Cart: "Also build cart UI"; Contact: save to database and email ("Both"); track as a new phase.

**Consequences:** The old `website/` static page and the one-page landing are superseded. Routes `/about` … `/cart` are public (no portal prefix). The cart holds a snapshot of title/price at add time; real checkout must re-price server-side.

**Status:** Accepted (user decision). Features F-960–F-963, tasks T-260–T-265.

## ADR-043 — Hosting Split: Static Marketing Site and LMS on the VPS

**Decision:** `lernoviq.com` and `www` serve the static Claude Design export (`website-v2`) from Hostinger web hosting. `lms.lernoviq.com` serves the LMS app and `content.lernoviq.com` the SCORM content origin, both from one Hostinger KVM VPS through the existing Docker/Caddy deploy (ADR-036): repository variables `PROD_APP_HOST=lms.lernoviq.com` and `PROD_CONTENT_HOST=content.lernoviq.com`, DNS A records for `lms` and `content` pointing at the VPS. `lms.lernoviq.com/` keeps serving the in-app marketing pages (ADR-042) with live courses and the cart. On the static site, sample courses are removed and course/cart links go to `https://lms.lernoviq.com/courses` and `/cart`; its contact form posts JSON to a public route on the app, `POST /api/enquiries`, which reuses the in-app validation, rate limit, storage and email, and answers browsers only from `MARKETING_SITE_ORIGINS` (default `https://lernoviq.com,https://www.lernoviq.com`). The current hosted Supabase project (`ctrizucnfaqescligsuu`) becomes production after its missing migrations are applied and its test data and seed accounts are removed (both only with the user's approval of the exact list).

**Reason:** User decisions (2026-10-14): Hostinger deployment plan; "Serve in-app marketing pages" on lms.lernoviq.com; static form "POST to the app"; production database "Clean up current project".

**Consequences:** Two copies of the marketing content exist (static export and in-app pages); copy changes must be made in both until one is retired. The static site depends on the app for the contact form and catalogue. Production cleanup deletes data irreversibly, so it needs a backup first (`docs/RUNBOOKS.md`) and explicit approval.

**Status:** Accepted (user decision).

## ADR-044 — Email Through Hostinger Mail

**Decision:** Outgoing email (announcements, contact-form notifications) is sent through the Hostinger Mail API (`hostinger-mail-api-sdk`, published by Hostinger) from the lernoviq.com mailbox whenever `HOSTINGER_MAIL_API` (API token) is set; `HOSTINGER_MAIL_FROM` picks the mailbox (default: the token's first mailbox), sender name "LERNOVIQ". Resend (T-141) remains the fallback when no token is set, so local development and tests are unchanged. `services/email` stays the only place that sends mail and keeps its never-throw contract.

**Reason:** User decision (2026-10-14): installed the Hostinger Mail SDK and added the `HOSTINGER_MAIL_API` repository secret; the domain's mail is hosted at Hostinger, and Resend's sandbox sender cannot deliver to `support@lernoviq.com`.

**Consequences:** Sent messages are also saved to the mailbox's Sent folder. The API returns no message ID, so delivery logs record an empty provider ID. The deploy job writes `HOSTINGER_MAIL_API` / `HOSTINGER_MAIL_FROM` to the server `.env`.

**Status:** Accepted (user decision).
