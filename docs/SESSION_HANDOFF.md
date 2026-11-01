# LERNOVIQ — Session Handoff (as of 2026-10-16)

This file is for an AI agent or engineer continuing the work. It summarises the Claude Code sessions
that built the marketing website, the Hostinger email integration, and the VPS deployment. Read
`CLAUDE.md`, `docs/RULES.md`, `docs/DECISIONS.md` (ADR-037 to ADR-045) and `docs/TASKS.md` (Phases 13
and 14) before changing anything. Nothing here overrides those documents.

---

## 1. Who the user is and how they work

- **Owner:** Hari Krishna Raj (harikr1raj@gmail.com). GitHub user `Harikrishnaraj`. Address the user as
  "you"; use they/them if pronouns are ever needed.
- **Working style:** they want outcomes, short replies, and a clear "what is left". They want
  **VPS-only deployment** (no Vercel, Netlify, or other cloud platforms, and no Hostinger web hosting).
- **Approval rule (strict):** do not apply database migrations, delete data, or change shared
  infrastructure without an explicit "yes" from the user in chat. Read-only checks are fine.
- **Company stance:** the platform sells courses. **Instructors are not paid** through the app
  (ADR-037). Do not reintroduce instructor payouts.
- **Support mailbox:** `support@lernoviq.com` (contact notifications, sender).

## 2. Product and repository

- **Product:** LERNOVIQ — a multi-role LMS (learner, instructor, admin, org admin) plus a public
  marketing site. Stack: Next.js 16 (App Router, `output: standalone` in Docker), React 19, Tailwind 4,
  Supabase (Postgres, Auth, Storage, RLS), Vitest, Playwright.
- **Repo:** `Harikrishnaraj/LERNOVIQ-lms` (formerly `modern-lms`). Local folder:
  `C:\Users\Hari Krishna Raj CV\Desktop\LMS dev\Lernoviq`.
- **Branches:**
  - `main` — production. Every push deploys to the VPS.
  - `website-v2` — the active branch for this work. PR #9 (`website-v2` → `main`) was **merged** on
    2026-10-15; the branch has commits after the merge (formatting, deploy-key fix).
- **Project rules:** `CLAUDE.md` and `docs/RULES.md`. Work is tracked in `docs/FEATURES.md` (F-IDs) and
  `docs/TASKS.md` (T-IDs). The feature checker is `npm run features` (must stay consistent). The
  "Definition of finished" is `npm run features:strict` passing — it does not yet, by design.
- **Commit style:** `feat:`, `fix:`, `docs:`, `chore:`, `style:`. Commit messages end with
  `Co-Authored-By: Claude <model> <noreply@anthropic.com>`. PR bodies end with the Claude Code line.

## 3. Key decisions (ADRs from this period)

| ADR | Decision |
|---|---|
| 037 | No instructor commerce. The platform sets prices (`course.price` permission). Instructor payout details removed. |
| 038 | Learner payments use **Dodo Payments** (test mode first). Supersedes ADR-031 (Stripe). Not built yet. |
| 039 | Rebrand to LERNOVIQ. `BrandLogo` component enforces logo rules. Colour tokens. |
| 040 | Repo/product rename, infra names `lernoviq-lms` (renumbered from a parallel branch's ADR-037). |
| 041 | Content server: sell SCORM courses to other companies' LMSs via dispatch packages (renumbered from ADR-038). |
| 042 | Marketing site built inside the app from the Claude Design export (`Lernoviq landing page design/export/website-v2`). Cart is localStorage; checkout waits for Dodo. Contact form stores enquiries in the DB and emails them. |
| 043 | Hosting split. **Static-site part superseded by ADR-045.** App at `lms.`, content at `content.`. Contact form posts to `POST /api/enquiries` on the app. |
| 044 | Email through **Hostinger Mail API** (`hostinger-mail-api-sdk`) when `HOSTINGER_MAIL_API` is set; Resend is the fallback. Sender mailbox from `HOSTINGER_MAIL_FROM`. |
| 045 | **Everything on the VPS.** Caddy serves the static site at `lernoviq.com` (www redirects to apex). No other hosting. |

Also in `docs/SECURITY.md`: §27 content server, §28 public contact form. `docs/TEST_PLAN.md` §25 content server, §26 marketing.

## 4. Production infrastructure

### VPS (Hostinger KVM, Ubuntu)
- **Public IPv4:** `187.127.185.95` (the `VPS_HOST` secret is set to this).
- **Deploy user:** `deploy` (member of `docker` group). Login by SSH key only, from GitHub Actions and from the
  local key pair.
- **Root:** logged in once through Hostinger's browser console to run setup. Password login for SSH is
  still **enabled** (see pending security work).
- **Stack directory on server:** `~/lernoviq-lms` containing `docker-compose.yml`, `Caddyfile`,
  `.env` (written by CI, mode 600), `website/` (static site copied by CI).
- **Containers (compose project `lernoviq-lms`):** `app` (Next.js standalone, port 3000 internal),
  `caddy` (TLS + reverse proxy, ports 80/443), `cron` (hourly scheduled-reports trigger).
- **Firewall (ufw):** OpenSSH, 80/tcp, 443/tcp, 443/udp.
- **Caddy routes:** `lernoviq.com` → static files `/srv/website`; `www.lernoviq.com` → 301 to apex;
  `lms.lernoviq.com` → app; `content.lernoviq.com` → app (content-origin only, 404 elsewhere).

### DNS (domain registered with Hostinger; DNS zone managed there)
- `lernoviq.com` A `@` → `187.127.185.95` (the old `147.93.109.65` Hostinger web-host record was **removed**;
  AAAA record for apex **removed**). Mail records kept: MX (mx1/mx2.hostinger.com), SPF, DKIM
  (hostingermail-a/b/c), DMARC, autodiscover/autoconfig.
- `www`, `lms`, `content` A → `187.127.185.95`.

### Certificates
- Caddy issues Let's Encrypt certificates automatically (stored in the `caddy_data` volume).
- The apex certificate was delayed by a stale DNS cache at Let's Encrypt. **Fixed 2026-10-16** by
  restarting the Caddy container. `https://lernoviq.com` returns 200.

### GitHub Actions (CI/CD)
- Workflow: `.github/workflows/ci.yml`. Jobs: `Check` (typecheck, lint, unit tests, features, build),
  six E2E shards (Playwright, local Supabase stack per job), `Deploy to VPS (production)`.
- **Deploy runs** on push to `main` or manual `workflow_dispatch` (pick the branch in the Actions UI or
  `gh workflow run ci.yml --ref <branch>`). The deploy job copies the stack, writes the server `.env`,
  copies the site, builds and pushes the image to GHCR, then runs `docker compose pull && up -d`.
- **Last successful deploy:** `main` run `38775075040` after the PR #9 merge.
- **Deploy script details to know:**
  - Key file is written with `tr -d '\r'` (strips Windows line endings from the secret).
  - Site files are copied from `Lernoviq landing page design/export/website-v2/.` into
    `~/lernoviq-lms/website/`.
  - `.env` on the server gets: `APP_IMAGE`, `APP_HOST`, `CONTENT_HOST`, `SITE_HOST`,
    `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SCORM_CONTENT_ORIGIN`, Supabase URL/anon/service key, Resend key,
    `RESEND_FROM_EMAIL`, `CRON_SECRET`, `CONTACT_NOTIFY_EMAIL`, `MARKETING_SITE_ORIGINS` (if set),
    `HOSTINGER_MAIL_API`, `HOSTINGER_MAIL_FROM`.

### GitHub configuration (repo `Harikrishnaraj/LERNOVIQ-lms`)
- **Repository variables (read by CI):** `PROD_APP_HOST=lms.lernoviq.com`,
  `PROD_CONTENT_HOST=content.lernoviq.com`, `PROD_SITE_HOST=lernoviq.com`,
  `PROD_HOSTINGER_MAIL_FROM=support@lernoviq.com`,
  `PROD_MARKETING_SITE_ORIGINS=https://lernoviq.com,https://www.lernoviq.com`,
  `PROD_CONTACT_NOTIFY_EMAIL=support@lernoviq.com`.
- **Secrets:** `VPS_HOST` (187.127.185.95), `VPS_USER` (deploy), `VPS_SSH_KEY` (private key, new pair created
  2026-10-15), `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY`, `PROD_SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `HOSTINGER_MAIL_API`, `GROQ_AI_API_KEY`, `NEXT_PUBLIC_APP_URL`. Optional: `PROD_RESEND_API_KEY`,
  `PROD_RESEND_FROM_EMAIL`, `PROD_CRON_SECRET`, `VPS_KNOWN_HOSTS`.
- The five duplicate host settings that had been stored as *secrets* were deleted (the workflow reads
  variables).

### SSH key material (local only — never commit)
- **Folder:** `C:\Users\Hari Krishna Raj CV\lernoviq-keys\` (outside the repo).
- `lernoviq-lms-deploy` (private) and `lernoviq-lms-deploy.pub` (public, ED25519,
  comment `github-actions-deploy`). The public key is in `/home/deploy/.ssh/authorized_keys` on the VPS.
- Login test that works: `ssh -i lernoviq-lms-deploy deploy@187.127.185.95`.

## 5. Supabase (database, auth, storage)

- **Production project in use:** `ctrizucnfaqescligsuu` — name `modern-lms`, region `ap-south-1` (Mumbai),
  Postgres 17. Used by `.env.local`, the GitHub `PROD_SUPABASE_*` secrets, and 13 references in the code.
- **Unused project:** `xqjodmdvdlfwadidxcgg` ("harikr1raj@gmail.com's Project", `ap-northeast-1`,
  created 2026-07-17). Nothing references it. **Deletion awaits user confirmation.**
- **Local CI database:** `supabase/config.toml` `project_id = "lernoviq"` is only the local stack name
  used by CI. It is not a hosted project.

### Migrations
Applied to `ctrizucnfaqescligsuu` (latest files in `supabase/migrations/`):
- Enquiries (`20261014100000_enquiries.sql`) — applied 2026-10-15. Table `enquiries`, permission
  `enquiry.read`.
- Content server (`20261012100000_content_server.sql`) and content server launch
  (`20261012110000_content_server_launch.sql`) — applied 2026-10-15.
- Manual grading (`20261006121721`) was already applied.

**Pending:**
- `20261005100000_platform_course_pricing.sql` — **NOT applied.** It adds the `course.price` permission,
  revokes instructor price writes, adds `admin_set_course_price`, and **drops `instructor_payout_details`**.
  The migration tool's permission check blocks it (a drop). Needs user approval; the user can run it in the
  Supabase SQL Editor.
- `20261007100000_payout_details_least_privilege.sql` — guarded no-op once the pricing migration has dropped
  the table. Safe to skip.

### Test-data cleanup (NOT executed)
- Backup taken before any cleanup: `Claude outputs/db-backup-2026-10-14/` (JSON per table, 73 tables,
  7,600 rows, plus `auth_users.json`, 552 users).
- Cleanup script: `Claude outputs/db-cleanup-2026-10-14.sql`. It deletes ~550 auth users except
  `harikr1raj@gmail.com`, all 167 courses, enrollments, the seed learning path, SCORM package records,
  cohorts, and the 2 test organizations. It is one transaction. The user approved deletion of the test data,
  the seed/demo courses and `ins@gmail.com` (not real). **Blocked by the same permission check** — the user
  must run it in the SQL Editor or allow the tool.

### Data facts
- Platform-wide roles: `admin`, `super_admin`, `support_agent`, `instructor`, `learner`, `org_admin` etc.
  Permissions in `public.permissions`, mapped by `role_permissions`. RLS everywhere.

## 6. Marketing website (ADR-042, 043, 045)

- **Source of truth for the static site:** `Lernoviq landing page design/export/website-v2/` (10 pages +
  `support.js`, `lv-store.js`, `back-to-top.js`, `assets/`, `brand/`). Edit here; CI copies it to the VPS.
  - Pages: `Home`, `About`, `Solutions`, `LMS`, `Industries`, `Delivery`, `Contact`, `FAQs`, `Courses`
    (redirects to LMS), `Cart` (redirects to LMS).
  - `lv-store.js` now only holds `LMS_URL` (`https://lms.lernoviq.com`) and `lmsUrl()`. Sample course data
    and cart state were removed. No `TO_CONFIRM`/`TO_GENERATE` placeholder text remains.
  - Back-to-top button: `back-to-top.js` on static pages; `BackToTop` component in the app.
  - Contact form posts JSON to `https://lms.lernoviq.com/api/enquiries`.
- **In-app marketing site** (served by the Next.js app at `lms.lernoviq.com`): route group
  `src/app/(marketing)/` (Home, About, Solutions, LMS, Industries, Delivery, FAQs, Contact, Cart),
  plus `/courses` (live catalogue) and `/courses/[slug]`. Shared shell `src/components/marketing/site-shell.tsx`
  (header, footer, back-to-top). Design tokens `--color-landing-*` in `src/app/globals.css`.
  Design-system copy is in the export's `documentation/` folder.
- **Cart:** `src/features/cart/cart.ts` (localStorage). Checkout is disabled with a notice until Dodo
  (T-180) is built.
- **Enquiries:** `src/features/enquiries/` (zod schema, `submitEnquiry` server action with rate limit
  `contact-enquiry`, insert via service-role admin client, Resend/Hostinger email to
  `CONTACT_NOTIFY_EMAIL`). Route `src/app/api/enquiries/route.ts` (CORS from `MARKETING_SITE_ORIGINS`,
  16 KB limit, JSON only). Admin inbox `src/app/admin/enquiries/` (permission `enquiry.read`).
- **Email:** `src/services/email/index.ts`. Hostinger Mail (ADR-044) when `HOSTINGER_MAIL_API` is set,
  else Resend. Never throws.

## 7. Work completed (highlights)

- Marketing site T-260…T-263 built and tested (unit + E2E). T-264 (contact) and T-265 (tests) are
  marked in progress in `docs/TASKS.md`; the E2E contact-form test passes once the enquiries table exists
  (it does now).
- Export fidelity checked: page heights within ~30 px of the design at 1280 px, same sections.
- Static site cleaned of sample courses and placeholders. Back-to-top added to both static and app
  pages. Tested in headless Chromium at 1280 and 375 px.
- Hostinger Mail SDK installed; `services/email` switched; unit tests for both paths.
- Rate-limit test fixed (`tests/setup.ts` stubs the limiter; the enquiry integration test unmocks it).
- Prefetch disabled on site header/footer (it kept prod pages busy and broke E2E "networkidle" waits).
- Prettier formatting applied to marketing/enquiry/email code only (not repo-wide; many other files
  still show style warnings).
- VPS: setup done as root, `deploy` user created, Docker installed, firewall on, key login tested.
- DNS fixed for `lernoviq.com`; certificates issued for all four hosts.

## 8. Known issues and gotchas

- **Line endings:** `.github/workflows/ci.yml`, `docs/*.md`, and `deploy/*` have CRLF in the working
  tree (git warns "CRLF will be replaced by LF"). When editing with Python, read/write bytes carefully:
  `"\\n"` inside Python strings can turn into real newlines. Prefer raw strings or `sed` on single lines.
  Break was caused exactly this way once; always run `python -c "import yaml; yaml.safe_load(...)"` on
  the workflow after editing.
- **`python3` is not on PATH** on this Windows machine; use `python`.
- **Dev server output** under `.next/dev` produces spurious `tsc` errors. Use
  `npx tsc --noEmit | grep "^src/\|^tests/"` for real source errors.
- **Browser pane:** scripted scrolls do not fire `scroll` events in the preview pane; test with
  headless Playwright (`@playwright/test` chromium) instead.
- **Playwright on Windows** prints a harmless `UV_HANDLE_CLOSING` assertion at exit.
- **E2E webServer** runs `npm run build && npm run start`; the build must succeed first.
- **Caddy** retries certificate issuance with growing back-off. After a DNS fix, restart the container
  (`docker compose restart caddy`) to retry immediately. Let's Encrypt caches DNS for up to the record TTL.
- **Secrets vs variables:** `vars.*` reads repository variables, `secrets.*` reads secrets. They are
  separate namespaces; put non-secret hosts in variables.
- **Migration tool permission:** the Supabase MCP `apply_migration` is blocked by the auto-mode classifier
  for destructive statements (drops/mass deletes). Do not work around it; ask the user to run the SQL.
- **`.claude/launch.json`** has a `design-export` entry serving the export on port 4400 (for comparing with
  the Claude Design original). The `dev` entry runs the app on port 3000.
- Untracked folders to leave alone: `.claude/worktrees/`, `Claude outputs/` (backups, zips, SQL scripts),
  `images/`, `Lernoviq landing page design.zip`.

## 9. Pending work (ordered by urgency)

1. **Security (high):**
   - Run the test-data cleanup (section 5) so test accounts and demo courses are removed.
   - On the VPS as root: set `PasswordAuthentication no` in `/etc/ssh/sshd_config`, `systemctl restart ssh`
     (keep the key session open), install and enable `unattended-upgrades`.
   - Rotate the Supabase service-role key and the deploy key (both were pasted into the chat during the
     session), then update the GitHub secrets and the server `.env` via a deploy.
2. **Database:**
   - Apply `20261005100000_platform_course_pricing.sql` (needs user approval; user may run it in the SQL Editor).
   - Run the test-data cleanup (`Claude outputs/db-cleanup-2026-10-14.sql`) after a fresh backup check.
   - Optionally empty old Storage buckets (thumbnails, SCORM test files). SQL does not touch Storage.
   - Delete the unused project `xqjodmdvdlfwadidxcgg` if the user confirms.
3. **Email verification:**
   - Send one real test email from the server (Hostinger Mail token is set; `HOSTINGER_MAIL_FROM=support@lernoviq.com`).
   - Submit the contact form from `https://lernoviq.com` and confirm the row appears in Admin → Enquiries and
     the notification arrives. Requires explicit approval (creates a real enquiry).
4. **Hostinger leftovers:** in hPanel, delete the old web-hosting site files for `lernoviq.com`. Keep all
   mail DNS records.
5. **Repository hygiene:**
   - Merge is done; keep `main` and `website-v2` in sync (`website-v2` has later commits: formatting and the
     CR fix for the deploy key). Consider merging those into `main` via a new PR.
   - Run `npm run features` and keep the registry consistent. Mark T-264/T-265 done when verified in CI.
   - Other Prettier warnings remain repo-wide (not touched).
6. **Product roadmap (TASKS.md):**
   - Payments: T-180 (Dodo adapter) through T-188 — needs Dodo test keys from the user.
   - Phase 10 AI (T-200 to T-205) and Phase 11 knowledge base (T-220 to T-225): not started.
   - T-250 production QA checklist (TEST_PLAN §23).
   - T-270 done (static site on VPS). T-271 (VPS provisioning) and T-272 (first production checks):
     partially done — VPS is running and the deploy works; T-272 needs the remaining checks above.
7. **Deploy process improvement:** migrations are not applied by CI. Consider a migration step in the
   deploy job (`supabase db push` with a service connection) so schema changes ship with code.

## 10. Useful commands

```bash
# Local checks (what CI runs, minus E2E)
npm run typecheck && npm run lint && npx vitest run tests/unit && npm run features && npm run build

# Trigger a production deploy from a branch
gh workflow run ci.yml --repo Harikrishnaraj/LERNOVIQ-lms --ref website-v2

# Check a deploy run
gh run view <id> --repo Harikrishnaraj/LERNOVIQ-lms --json status,conclusion,jobs

# SSH to the VPS (key stays outside the repo)
ssh -i "C:/Users/Hari Krishna Raj CV/lernoviq-keys/lernoviq-lms-deploy" deploy@187.127.185.95

# On the VPS
cd ~/lernoviq-lms && docker compose ps && docker compose logs caddy --tail 100
docker compose restart caddy        # retry certificate issuance
docker compose logs app --tail 100  # app errors

# Check public hosts
for h in lernoviq.com www.lernoviq.com lms.lernoviq.com content.lernoviq.com; do curl -s -o /dev/null -w "$h %{http_code}\n" https://$h/; done

# Supabase (Supabase MCP): project id ctrizucnfaqescligsuu; list_migrations, list_tables, execute_sql
```

## 11. Where things are

| What | Where |
|---|---|
| Architecture, rules, PRD, design | `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PRD.md`, `docs/DESIGN.md` |
| Decisions | `docs/DECISIONS.md` (ADR-001 to ADR-045) |
| Features and tasks | `docs/FEATURES.md`, `docs/TASKS.md` |
| Security notes | `docs/SECURITY.md` (§27 content server, §28 contact form) |
| Test plan | `docs/TEST_PLAN.md` (§25, §26 added) |
| Deploy guide | `docs/DEPLOY.md` (VPS-only hosting section) |
| Runbooks, backups | `docs/RUNBOOKS.md` |
| Memory of decisions | `docs/MEMORY.md` (dated entries) |
| Deploy and CI | `.github/workflows/ci.yml`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/setup-vps.sh`, `Dockerfile` |
| Migrations | `supabase/migrations/` |
| Marketing site (static) | `Lernoviq landing page design/export/website-v2/` |
| Marketing site (app) | `src/app/(marketing)/`, `src/components/marketing/`, `src/features/cart/`, `src/features/enquiries/` |
| Email | `src/services/email/index.ts`, `tests/unit/email.test.ts` |
| Backups and scripts | `Claude outputs/` (not in git) |
