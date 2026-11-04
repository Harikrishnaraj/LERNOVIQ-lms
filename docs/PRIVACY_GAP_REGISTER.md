# Privacy & technical gap register

F-446 (T-288). One row per requirement of the GDPR readiness assessment (Phase 17), with what exists, who owns
it and what proves it. Nothing in this file says the platform is GDPR compliant. That claim may only be made
when every row is Implemented or Not Applicable, and legal/privacy stakeholders have approved the register.

**Status** is one of: Implemented, Partially Implemented, Missing, Not Applicable, Requires Legal Decision.
**Owner** is a role: Engineering, Operations (runs the VPS and vendor accounts), Legal/Privacy (the
controller's privacy lead, not yet named).

| Category | Item / Feature | Status | Owner | Risk Level | Evidence / Artifact | Implementation Task | Test Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Data-processing register | Register of the 14 data categories | Implemented | Engineering | Low | `docs/PRIVACY_REGISTER.md` | T-282 | `tests/unit/privacy-register.test.ts` |
| Data-processing register | Lawful basis per category | Requires Legal Decision | Legal/Privacy | High | `docs/PRIVACY_REGISTER.md` (each basis marked proposed) | T-282 | None (legal sign-off) |
| Data-processing register | Named controller, breach-response owner | Requires Legal Decision | Legal/Privacy | High | `docs/PRIVACY_REGISTER.md` | T-282 | None (legal sign-off) |
| Data-processing register | International transfer status for each processor | Requires Legal Decision | Legal/Privacy | High | `docs/PRIVACY_REGISTER.md`; processors: Supabase, Hostinger, Resend | T-282 | None (legal sign-off) |
| Self-service export | Machine-readable, role-gated, rate-limited, logged export | Implemented | Engineering | Medium | `src/features/privacy/account.ts`, `/privacy/export` | T-243, T-283 | `tests/unit/privacy-account.test.ts`, `tests/integration/account-privacy.test.ts`, `tests/e2e/account-privacy.spec.ts` |
| Self-service export | Export covers every category held about the person | Partially Implemented | Engineering | Medium | Export now adds lesson progress, learning time, assessment attempts, own discussion threads and posts, sent messages and login history. Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-295 | `tests/unit/privacy-export-coverage.test.ts`, `tests/integration/account-privacy.test.ts` |
| Account deletion | Identity check, 30-day grace, notices, completion log | Implemented | Engineering | Medium | Migration `20260928050000_account_privacy.sql`, `purge_expired_accounts()`, `account.deleted` audit row | T-243, T-283 | `tests/integration/account-privacy.test.ts`, `tests/e2e/account-privacy.spec.ts` |
| Account deletion | Legal-retention exceptions: what must be held and for how long | Requires Legal Decision | Legal/Privacy | Medium | `profiles.deletion_hold_reason` exists; the rules for using it do not | T-283 | `tests/integration/account-privacy.test.ts` (hold skips purge) |
| Account deletion | Uploaded files removed with the account | Partially Implemented | Engineering | High | `orphaned_storage_objects()` + `/api/cron/storage-cleanup` remove avatars and submissions of deleted accounts. Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-294 | `tests/unit/storage-cleanup.test.ts`, `tests/integration/orphaned-storage.test.ts` |
| Report minimisation | No names or emails in exports, short links, 30-day retention, downloads logged | Implemented | Engineering | Low | `src/features/admin/report-export-policy.ts`, `docs/DPIA.md` §5 | T-277, T-289 | `tests/unit/report-export-policy.test.ts`, `tests/unit/dpia.test.ts` |
| Analytics | Aggregated or pseudonymised where identity is unnecessary | Implemented | Engineering | Low | `docs/DPIA.md` §5 | T-287 | `tests/unit/dpia.test.ts` |
| Retention | Database tables | Implemented | Engineering | Low | `docs/RETENTION.md` §1, `purge-operational-data-daily` | T-284 | `tests/unit/retention.test.ts`, `tests/integration/retention-jobs.test.ts` |
| Retention | Storage buckets (submissions, avatars, course files) | Partially Implemented | Engineering | Medium | Avatars and submissions enforced by the storage-cleanup job; course-content buckets stay Proposed (kept until the owner deletes the course). Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-300 | `tests/unit/storage-cleanup.test.ts` |
| Retention | VPS application log rotation period | Missing | Operations | Medium | `docs/RETENTION.md` §3: period not recorded | T-250 (production deploy) | None |
| Retention | Database backups (30 days) | Partially Implemented | Operations | Medium | `.github/workflows/backup.yml`; needs the `SUPABASE_DB_URL` secret before it runs | T-284 | `tests/unit/retention.test.ts` (period in step) |
| Retention | Storage bucket backups | Missing | Operations | Medium | `docs/RETENTION.md` §5: buckets not backed up | New task needed | None |
| Retention | Vendor tools | Requires Legal Decision | Legal/Privacy | Low | `docs/RETENTION.md` §6: periods set by each vendor | T-284 | None |
| Consent | Consent records with policy version, time, purpose, withdrawal state | Implemented | Engineering | Low | `consent_records`, `src/features/privacy/consent.ts` | T-285 | `tests/integration/consent-records.test.ts` |
| Consent | Withdrawal by the person themself | Partially Implemented | Engineering | Low | Settings → Privacy → Withdraw my consents (`withdrawMyConsentsAction`). Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-299 | `tests/integration/subject-requests.test.ts` |
| Subject rights | Request queue with one-month deadline and audit trail | Implemented | Engineering | Medium | `subject_requests`, Admin → Privacy requests | T-286 | `tests/unit/subject-requests.test.ts`, `tests/integration/subject-requests.test.ts`, `tests/e2e/account-privacy.spec.ts` |
| Subject rights | Tracked path for people without an account | Partially Implemented | Engineering | Medium | Public form `/privacy/request` (rate limited, honeypot) into the staff queue. Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-296 | `tests/integration/subject-requests.test.ts`, `tests/e2e/marketing.spec.ts` |
| Subject rights | Reminder before a request goes overdue | Partially Implemented | Engineering | Medium | `/api/cron/privacy-reminders` notifies privacy staff 7 days before and once overdue. Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-297 | `tests/unit/privacy-request-reminders.test.ts` |
| Subject rights | Erasure request linked to account deletion | Partially Implemented | Engineering | Low | Completing an erasure request starts the account deletion first and records `deletion_started_at`. Code and tests on branch `feature/gdpr-gaps`; migrations not applied and CI not yet run (2026-11-04). | T-298 | `tests/integration/subject-requests.test.ts` |
| Subject rights | Retention of closed requests | Requires Legal Decision | Legal/Privacy | Low | Closed requests are kept indefinitely | T-286 | None |
| DPIA | Decision log for profiling, monitoring, sensitive data, AI | Implemented | Engineering | Low | `docs/DPIA.md` | T-287 | `tests/unit/dpia.test.ts` |
| DPIA | Full DPIA for employer monitoring and for AI | Requires Legal Decision | Legal/Privacy | High | `docs/DPIA.md` §2, §4 | Before selling to employers; before T-200 | None |
| Security | Audit log of privileged actions | Implemented | Engineering | Low | `audit_logs`, `recordAudit()` | T-240 | `tests/integration/audit-logs.test.ts`, `tests/e2e/admin-audit.spec.ts` |
| Security | Rate limits on public, export and privacy endpoints | Implemented | Engineering | Low | `src/services/rate-limit` | T-241, T-283 | `tests/unit/rate-limit.test.ts`, `tests/e2e/rate-limit.spec.ts` |
| Security | Breach detection and notification procedure | Partially Implemented | Legal/Privacy | High | `docs/RUNBOOKS.md` breach section with deadlines and a breach record; owners not yet named | T-301 | `tests/unit/breach-runbook.test.ts` |

## Before claiming compliance

1. Legal/Privacy closes every **Requires Legal Decision** row.
2. Engineering closes every **Missing** and **Partially Implemented** row, or legal accepts the risk in writing.
3. Legal/Privacy approves this register, with the date and approver recorded here.
