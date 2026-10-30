# Retention schedule

Status: **draft for legal and product confirmation** (T-284, F-442). Periods marked *Implemented* are enforced
by a scheduled job today; periods marked *Proposed* are written here and have no job yet. Every period is a
proposal until someone signs it off: **Requires Legal Decision**. Nothing in this file says the platform is
GDPR compliant; see `docs/PRIVACY_GAP_REGISTER.md` for what is open.

Jobs run in Supabase (pg_cron) unless noted. Each job name below exists in `supabase/migrations/` and is
checked by `tests/unit/retention.test.ts`.

## 1. Database tables

| Data | Period | Enforced by | Status |
| --- | --- | --- | --- |
| Account and profile (`profiles`, `user_roles`, `organization_members`, and rows that cascade from the user) | Until the person deletes the account, then a 30-day grace period | `purge-expired-accounts-daily` (03:00 UTC, `purge_expired_accounts()`); a staff hold (`deletion_hold_reason`) pauses it | Implemented |
| Audit log (`audit_logs`, append-only) | 2 years | `purge-old-audit-logs-weekly` (Sundays 04:00 UTC, `purge_old_audit_logs()`) | Implemented |
| Login history (`login_history`) | 12 months | `purge-operational-data-daily` (03:30 UTC, `purge_operational_data()`) | Implemented |
| API request log (`api_request_log`) | 90 days | `purge-operational-data-daily` | Implemented |
| Rate-limit hits (`rate_limit_hits`) | 1 day | `purge-operational-data-daily` (and per key inside the rate-limit check) | Implemented |
| Enquiries from the marketing site (`enquiries`) | 24 months | `purge-operational-data-daily` | Implemented |
| Saved report exports (`report_exports`) | 30 days | scheduled-reports job in the app (T-277) | Implemented |
| Learning records (`enrollments`, `lesson_progress`, `lesson_time`, `assessment_attempts`, `assignment_submissions`) | Life of the account; deleted with it | `purge-expired-accounts-daily` (cascade) | Implemented |
| Certificates (`certificates`, `certificate_events`) | Life of the account; whether a verifiable record must outlive it is **Requires Legal Decision** | `purge-expired-accounts-daily` (cascade) | Implemented, open question |
| Messages and discussions (`direct_messages`, `discussion_posts`) | Life of the account; deleted with it | `purge-expired-accounts-daily` (cascade) | Implemented |
| Course content owned by an instructor (`courses` and children) | Until the owner deletes it | the owner, in the app | Implemented |

## 2. Storage buckets

| Bucket | Period | Enforced by | Status |
| --- | --- | --- | --- |
| `report-exports` (private) | 30 days | scheduled-reports job in the app (T-277) | Implemented |
| `resource-library` (private) | Optional per-item expiry; expired items are hidden and refused | expiry check in the app (T-279) | Implemented |
| `assignment-submissions` (private) | Life of the owning account | none: removing storage objects on account deletion is not verified | Proposed |
| `avatars`, `course-thumbnails` (public) | Life of the owning record | none | Proposed |
| `course-videos`, `lesson-assets`, `assignment-resources`, `scorm-packages`, `scorm-uploads` (private) | Life of the owning course | none | Proposed |

## 3. Server logs

| Log | Period | Enforced by | Status |
| --- | --- | --- | --- |
| Application logs on the Hostinger VPS (structured logs, no error-tracking vendor) | Set by the VPS log rotation; the period is not recorded in the repository | the host, outside this codebase | Proposed: **Requires Legal Decision** |
| Supabase platform logs | Set by the Supabase plan | Supabase | Per vendor |
| Hostinger Mail and Resend delivery logs | Per vendor | the vendor | Per vendor |

## 4. Exports

| Export | Period | Enforced by | Status |
| --- | --- | --- | --- |
| Self-service data export (`/privacy/export`) | Not stored: generated on request and streamed | nothing is kept | Implemented |
| Admin report CSVs | 30 days (see `report-exports` above) | scheduled-reports job | Implemented |

## 5. Backups

| Backup | Period | Enforced by | Status |
| --- | --- | --- | --- |
| Weekly database dump (GitHub Actions artifact, `.github/workflows/backup.yml`, Sundays 05:00 UTC) | 30 days (`retention-days: 30`) | GitHub artifact expiry | Implemented once the `SUPABASE_DB_URL` secret is set |
| Supabase platform backups | Per the Supabase plan | Supabase | Per vendor |
| Storage buckets | Not backed up | none | Gap |

A person's data cannot be removed from a backup one record at a time. A deleted account stays in a backup until
that backup expires (at most 30 days for the weekly dump), and a restore must re-apply deletions made since.
Whether this is acceptable is **Requires Legal Decision**.

## 6. Vendor tools

| Vendor | What it holds | Period | Status |
| --- | --- | --- | --- |
| Supabase (database, auth, storage) | everything above | as above; deletion is by the jobs above | Implemented |
| Hostinger VPS (ADR-045) | application logs | host log rotation | Proposed |
| Hostinger Mail or Resend (ADR-044) | recipient address and message while delivering | per vendor | Per vendor |
| Google sign-in | sign-in identity | per Google; removed from our side with the account | Per vendor |
| GitHub Actions | the weekly backup artifact | 30 days | Implemented |
| Dodo Payments | not connected yet (T-180) | to be decided before it is connected | Not Applicable |
| Error tracking | none configured | n/a | Not Applicable |
