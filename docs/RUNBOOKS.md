# Operational Runbooks

## Backup and recovery (T-249, F-948, SECURITY.md §24)

### Current posture

This project's Supabase project (`ctrizucnfaqescligsuu`, organization plan: **Free**) does not get
Supabase's automated daily backups or Point-in-Time Recovery — both are Pro-plan features
([Supabase docs](https://supabase.com/docs/guides/platform/backups)). Supabase's own guidance for
Free-plan projects is to run manual exports and keep an off-site copy. This runbook documents that
process for this project. If the project is ever upgraded to Pro, prefer Supabase's built-in daily
backups / PITR (Dashboard → Database → Backups) over this workflow, and keep this one as a second,
independent copy rather than the only one.

**Schema** is already backed up and version-controlled: every schema change is a file under
`supabase/migrations/`, committed to git. **Data** is backed up by `.github/workflows/backup.yml`,
a scheduled `pg_dump` (see setup below). **Storage objects** (course videos, thumbnails, lesson
attachments, submissions, resource library, SCORM packages) are not covered by either — Supabase's
own database backups explicitly exclude Storage objects, and this project has no separate object
backup yet. See "Object storage" below.

### One-time setup: the `SUPABASE_DB_URL` secret

The backup workflow needs the project's **direct** (not pooled) Postgres connection string as a
GitHub Actions repository secret:

1. Supabase Dashboard → this project → **Settings → Database → Connection string** → **URI** tab.
   Use the **direct connection** (port `5432`), not the "Transaction pooler" (`6543`) one —
   `pg_dump` needs session-level behavior the pooler doesn't support.
2. GitHub → this repo → **Settings → Secrets and variables → Actions** → **New repository secret**
   → name it `SUPABASE_DB_URL`, paste the connection string (with the database password filled in).
3. The workflow then runs automatically every Sunday, and can also be triggered manually from the
   **Actions** tab (`Database backup` → **Run workflow**).

Until that secret is set, the workflow runs on schedule but fails loudly (a red run in the Actions
tab) rather than silently skipping, so a missing backup is visible rather than silent.

### Restoring data from a backup

1. Download the `lernoviq-lms-db-backup-<run-id>` artifact from the relevant workflow run (Actions
   tab → the run → Artifacts), or use one downloaded and stored off-platform.
2. Restore into a project with the schema already in place (a fresh project after step "Restoring
   the schema" below, or the existing project in a genuine recovery scenario):
   ```bash
   pg_restore --dbname="$SUPABASE_DB_URL" --clean --if-exists lernoviq-lms-backup.dump
   ```
   `--clean --if-exists` drops existing objects before recreating them, so this is safe to run
   against a project that already has the schema (from migrations) but stale or no data.
3. Custom roles' passwords are never included in a backup (matches Supabase's own daily-backup
   behavior) — this project doesn't define any custom Postgres roles beyond Supabase's own, so
   there is nothing to reset here.

**Not yet tested live end-to-end in this session** — the person operating this project chose to
document the procedure rather than have an agent session spin up and tear down a real Supabase
project to rehearse it (a temporary but real cloud resource). Before relying on this runbook in a
genuine incident, run it once against a scratch project to confirm the exact commands above work
as written.

### Restoring the schema

The full schema is reproducible from scratch on any empty Postgres 17 database (a fresh Supabase
project, or `supabase start` locally):

```bash
supabase link --project-ref <target-project-ref>
supabase db push   # applies every file in supabase/migrations/, in filename order
```

Equivalently, apply each file in `supabase/migrations/` in filename order via `psql` or the
Supabase MCP `apply_migration` tool if the CLI isn't available. Every migration in this repo was
written and applied incrementally in that same order during development, which is the same
sequence a from-scratch restore replays — the strongest evidence available that it works is that
it already has, once per migration, throughout this project's history. A dedicated from-empty
replay (creating a temporary project purely to prove this) was considered and declined for this
task (see above) — this remains the one part of T-249 recommended for an explicit rehearsal before
depending on it in a real incident.

### Object storage

SECURITY.md §24 also asks for a backup/retention strategy for critical object storage
(`course-videos`, `course-thumbnails`, `lesson-assets`, `assignment-submissions`,
`resource-library`, `scorm-packages`, `avatars`). This project does not yet have one. The
recommended approach, not yet implemented: a scheduled job (e.g. a second GitHub Actions workflow)
using `rclone` or the Supabase CLI (`supabase storage cp -r ...`) to mirror each bucket to a
separate object store (an S3-compatible bucket, or another Supabase Storage project). This needs
its own credentials/decision from whoever operates the project and was out of scope for this pass
— recorded here rather than silently left undocumented.

## Personal-data breach response (T-301, F-450, GDPR Art. 33–34, DPDP Act s.8(6))

A breach is any security incident that leads to personal data being lost, destroyed, changed, disclosed
or accessed without authority, including by mistake (a report sent to the wrong customer, a leaked key).
The legal positions behind these steps are in `docs/GDPR_LEGAL_POSITIONS.md` §5 and still need legal sign-off.

### Owners

| Role | Person | Contact |
| --- | --- | --- |
| Breach owner | **Requires Legal Decision** (not yet named) | |
| Deputy | **Requires Legal Decision** (not yet named) | |
| EU / UK representative | **Requires Legal Decision** | |

### Clock

| Deadline | From | To whom |
| --- | --- | --- |
| Same day | Anyone suspects a breach | Breach owner |
| 48 hours | We become aware, as a processor for an employer or content-server customer | That customer (the controller) |
| 72 hours | We become aware, as controller | Lead EU supervisory authority (through the EU representative) and the ICO for UK data, unless the breach is unlikely to risk people's rights |
| Without delay | We become aware | Data Protection Board of India and affected people (DPDP Rules) |
| Without undue delay | High risk to people | Affected people directly |

### Steps

1. **Report.** Tell the breach owner the same day, with what you saw and when. Do not delete evidence.
2. **Open a record.** Add a row to the breach record below: what data, whose, how many people, when it
   started, when we became aware, how it was found.
3. **Contain.** As needed: rotate the exposed keys (`docs/DEPLOY.md` secrets), suspend affected accounts in
   Admin → Users, revoke content-server licences, take a fresh backup before restoring
   (see "Restoring data from a backup" above).
4. **Assess the risk.** Note the data categories (`docs/PRIVACY_REGISTER.md`), whether it was encrypted,
   and the likely effect on people. Decide whether each notice in the clock table is required, and why.
5. **Notify.** Send the notices that apply, inside their deadlines. If facts are still missing at 72 hours,
   notify with what is known and follow up.
6. **Review.** Within two weeks, record the cause and what changed so it does not recur.

### Breach record

Every breach goes here, including ones not reported to an authority, with the reason.

| Date aware | Summary | Data and people affected | Notified (who, when) | Reason if not notified | Closed |
| --- | --- | --- | --- | --- | --- |
