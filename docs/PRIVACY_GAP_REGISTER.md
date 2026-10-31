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
| Self-service export | Export covers every category held about the person | Partially Implemented | Engineering | Medium | Export has profile, roles, enrolments, submissions, certificates, reviews, memberships, consents; it omits lesson progress, assessment attempts, discussions, messages and login history | New task needed | `tests/integration/account-privacy.test.ts` (present fields only) |
| Account deletion | Identity check, 30-day grace, notices, completion log | Implemented | Engineering | Medium | Migration `20260928050000_account_privacy.sql`, `purge_expired_accounts()`, `account.deleted` audit row | T-243, T-283 | `tests/integration/account-privacy.test.ts`, `tests/e2e/account-privacy.spec.ts` |
| Account deletion | Legal-retention exceptions: what must be held and for how long | Requires Legal Decision | Legal/Privacy | Medium | `profiles.deletion_hold_reason` exists; the rules for using it do not | T-283 | `tests/integration/account-privacy.test.ts` (hold skips purge) |
| Account deletion | Uploaded files removed with the account | Missing | Engineering | High | `docs/RETENTION.md` storage buckets: no job removes an account's storage objects | New task needed | None |
| Report minimisation | No names or emails in exports, short links, 30-day retention, downloads logged | Implemented | Engineering | Low | `src/features/admin/report-export-policy.ts`, `docs/DPIA.md` §5 | T-277, T-289 | `tests/unit/report-export-policy.test.ts`, `tests/unit/dpia.test.ts` |
| Analytics | Aggregated or pseudonymised where identity is unnecessary | Implemented | Engineering | Low | `docs/DPIA.md` §5 | T-287 | `tests/unit/dpia.test.ts` |
| Retention | Database tables | Implemented | Engineering | Low | `docs/RETENTION.md` §1, `purge-operational-data-daily` | T-284 | `tests/unit/retention.test.ts`, `tests/integration/retention-jobs.test.ts` |
| Retention | Storage buckets (submissions, avatars, course files) | Missing | Engineering | Medium | `docs/RETENTION.md` §2 rows marked Proposed | New task needed | None |
| Retention | VPS application log rotation period | Missing | Operations | Medium | `docs/RETENTION.md` §3: period not recorded | T-250 (production deploy) | None |
| Retention | Database backups (30 days) | Partially Implemented | Operations | Medium | `.github/workflows/backup.yml`; needs the `SUPABASE_DB_URL` secret before it runs | T-284 | `tests/unit/retention.test.ts` (period in step) |
| Retention | Storage bucket backups | Missing | Operations | Medium | `docs/RETENTION.md` §5: buckets not backed up | New task needed | None |
| Retention | Vendor tools | Requires Legal Decision | Legal/Privacy | Low | `docs/RETENTION.md` §6: periods set by each vendor | T-284 | None |
| Consent | Consent records with policy version, time, purpose, withdrawal state | Implemented | Engineering | Low | `consent_records`, `src/features/privacy/consent.ts` | T-285 | `tests/integration/consent-records.test.ts` |
| Consent | Withdrawal by the person themself | Partially Implemented | Engineering | Low | `withdrawConsent()` exists; there is no self-service control, withdrawal goes through a privacy request | T-286 | `tests/integration/consent-records.test.ts` |
| Subject rights | Request queue with one-month deadline and audit trail | Implemented | Engineering | Medium | `subject_requests`, Admin → Privacy requests | T-286 | `tests/unit/subject-requests.test.ts`, `tests/integration/subject-requests.test.ts`, `tests/e2e/account-privacy.spec.ts` |
| Subject rights | Tracked path for people without an account | Missing | Engineering | Medium | Visitors can only email; their requests are not in the queue | New task needed | None |
| Subject rights | Reminder before a request goes overdue | Missing | Engineering | Medium | The queue shows days left; nothing notifies staff | New task needed | None |
| Subject rights | Erasure request linked to account deletion | Missing | Engineering | Low | Staff close erasure requests by hand | New task needed | None |
| Subject rights | Retention of closed requests | Requires Legal Decision | Legal/Privacy | Low | Closed requests are kept indefinitely | T-286 | None |
| DPIA | Decision log for profiling, monitoring, sensitive data, AI | Implemented | Engineering | Low | `docs/DPIA.md` | T-287 | `tests/unit/dpia.test.ts` |
| DPIA | Full DPIA for employer monitoring and for AI | Requires Legal Decision | Legal/Privacy | High | `docs/DPIA.md` §2, §4 | Before selling to employers; before T-200 | None |
| Security | Audit log of privileged actions | Implemented | Engineering | Low | `audit_logs`, `recordAudit()` | T-240 | `tests/integration/audit-logs.test.ts`, `tests/e2e/admin-audit.spec.ts` |
| Security | Rate limits on public, export and privacy endpoints | Implemented | Engineering | Low | `src/services/rate-limit` | T-241, T-283 | `tests/unit/rate-limit.test.ts`, `tests/e2e/rate-limit.spec.ts` |
| Security | Breach detection and notification procedure | Missing | Legal/Privacy | High | No runbook entry for a personal-data breach | New task needed | None |

## Before claiming compliance

1. Legal/Privacy closes every **Requires Legal Decision** row.
2. Engineering closes every **Missing** and **Partially Implemented** row, or legal accepts the risk in writing.
3. Legal/Privacy approves this register, with the date and approver recorded here.
