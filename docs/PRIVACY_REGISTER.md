# Data-processing register

Status: **draft for legal and product confirmation.** Written from the code and migrations as they stand
(T-282, F-440). It records what the platform does, not a legal conclusion. Nothing in this file says the
platform is GDPR compliant; see `docs/PRIVACY_GAP_REGISTER.md` for what is still open.

## How to read this register

- **Lawful basis** is always shown as a *proposal*. No lawful basis has been confirmed by legal or the product
  owner, so every one is marked **Requires Legal Decision** until someone signs it off here.
- **Controller** is Lernoviq AI Technologies Private Limited (the company named on the certificate design).
  The legal entity, any joint-controller arrangement with customer organisations, and an EU/UK
  representative, if one is needed, are **Requires Legal Decision**.
- **Breach-response owner** is not assigned anywhere in the repository. It is **Requires Legal Decision** for
  every category until the company names one.
- **International transfers**: the Supabase project region, the Hostinger VPS location and the vendors' own
  sub-processors are not recorded in the repository. Every category is **Requires Legal Decision** on
  transfers until the regions and the data-processing agreements are checked.
- Rights handling today: export is self-service (`/privacy/export`, `src/features/privacy/account.ts`);
  deletion is self-service with a 30-day grace period (`20260928050000_account_privacy.sql`); correction of
  profile fields is self-service in Settings. Restriction and objection have no tool yet; they are handled by
  the subject-rights workflow in T-286 (until then, by an administrator, with no tracking).
- Retention figures marked *(implemented)* are enforced by a job today. Figures marked *(proposed)* are
  written in `docs/RETENTION.md` and are not yet enforced.

Roles: **admin** and **super_admin** are platform staff; **instructor** owns courses; **org_admin** manages
one organisation; **learner** is the default account.

---

## 1. Account/Profile Data

- **Data:** name, headline, bio, avatar, email address (Supabase Auth), account roles, creation date.
- **Data subjects:** learners, instructors, administrators, organisation admins.
- **Purpose:** create and run an account; show a name to instructors, course reviewers and discussion
  readers; issue certificates in the learner's name.
- **Lawful basis (proposed):** contract, Art. 6(1)(b). **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase (database, auth, storage), the
  Hostinger VPS (application), the mail provider for account email.
- **Access roles and organisation boundary:** the account owner; admin and super_admin (user management);
  an org_admin sees only members of their own organisation; an instructor sees the name of learners enrolled
  in their own courses.
- **Storage:** Supabase Postgres (`profiles`, `user_roles`, `auth.users`); avatars in the public `avatars`
  bucket.
- **Retention and deletion:** kept while the account exists. After a deletion request (password or email re-check, rate limited,
  confirmation email) the account is removed after 30 days by `purge_expired_accounts()` *(implemented, daily
  03:00 UTC)*; related rows cascade. Staff can place a legal hold (`profiles.deletion_hold_reason`) that stops the
  purge; which data a hold must cover is **Requires Legal Decision**. Each deletion writes an `account.deleted`
  audit row (id and request date only).
- **Subject rights:** export (profile and roles included), correction (self-service), deletion (self-service,
  30-day grace); restriction and objection (no tool, T-286); portability (JSON export).
- **Security controls:** row-level security on every table, MFA for back-office roles, rate limiting.
- **Audit logs:** role changes, suspension, invitations and deletion requests are audited.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 2. Authentication Data

- **Data:** password hash and sessions (Supabase Auth), TOTP secrets for MFA, Google sign-in identity,
  login history (IP address, user agent, time), organisation SSO domains.
- **Data subjects:** every account holder.
- **Purpose:** sign people in, keep accounts secure, detect abuse, show an administrator a user's recent
  logins.
- **Lawful basis (proposed):** contract for sign-in; legitimate interests, Art. 6(1)(f), for security logging.
  **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase Auth; Google for Google sign-in.
- **Access roles and organisation boundary:** the user; admin and super_admin read login history. Password
  hashes and TOTP secrets are never readable by the application roles.
- **Storage:** `auth.users`, `auth.mfa_factors` (Supabase-managed); `public.login_history`.
- **Retention and deletion:** removed with the account (cascade). No separate retention limit exists for
  `login_history`: gap, see `docs/PRIVACY_GAP_REGISTER.md`.
- **Subject rights:** export does not include login history (gap); deletion covers it; correction does not
  apply; restriction and objection through T-286.
- **Security controls:** hashed passwords, MFA, login rate limits, login-failure audit events.
- **Audit logs:** `auth.login_failed`, role and suspension events.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 3. Learning Progress

- **Data:** enrolments, lesson progress and resume position, time spent per lesson per day
  (`lesson_time`, T-292), learning paths, cohort membership, assigned learning, saved courses.
- **Data subjects:** learners.
- **Purpose:** deliver courses, show progress, decide course completion, report usage to administrators and
  instructors.
- **Lawful basis (proposed):** contract. **Requires Legal Decision.** Time tracking may need a separate
  assessment (monitoring), see `docs/DPIA.md`.
- **Controller / processors:** controller as above. Processors: Supabase, the VPS.
- **Access roles and organisation boundary:** the learner; the instructor of the course; admin and
  super_admin; an org_admin for members of their organisation only.
- **Storage:** `enrollments`, `lesson_progress`, `lesson_time`, `path_enrollments`, `cohort_members`,
  `assigned_learning`, `saved_courses`.
- **Retention and deletion:** removed with the account (cascade). No retention limit while the account
  exists *(proposed in `docs/RETENTION.md`)*.
- **Subject rights:** export covers enrolments (not lesson progress or time spent: gap); deletion cascades;
  restriction and objection through T-286.
- **Security controls:** RLS by owner, course owner and organisation; time recording only through a function
  that checks enrolment and caps each credit.
- **Audit logs:** manual enrol and unenrol, bulk enrol.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 4. Assessment Attempts

- **Data:** answers, scores, pass or fail, attempt times, grader feedback, manual grades.
- **Data subjects:** learners.
- **Purpose:** assess learning, decide completion and certificates, let instructors grade.
- **Lawful basis (proposed):** contract. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase, the VPS.
- **Access roles and organisation boundary:** the learner; the instructor of the course (grading); admin
  and super_admin; answer keys are readable only by the server. Organisation admins see aggregate results for
  their members only.
- **Storage:** `assessment_attempts` and answer tables.
- **Retention and deletion:** removed with the account (cascade). Whether results behind an issued
  certificate must be kept is **Requires Legal Decision** (T-283).
- **Subject rights:** export does not yet include assessment attempts (gap); deletion cascades.
- **Security controls:** answer keys never sent to the browser; attempt rules enforced on the server.
- **Audit logs:** attempt reset and grading are audited.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 5. Certificates

- **Data:** certificate code, learner name as printed, course title, issue date, status, certificate events.
- **Data subjects:** learners who completed a course.
- **Purpose:** give the learner a verifiable record of completion; let a third party verify a code.
- **Lawful basis (proposed):** contract; legitimate interests for verification by a third party.
  **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase, the VPS.
- **Access roles and organisation boundary:** the learner; admin and super_admin; the public can verify a
  code (what the verification page shows must be confirmed); instructors see certificates of their own courses.
- **Storage:** `certificates`, `certificate_events`.
- **Retention and deletion:** removed with the account today. Whether an issued certificate is a legal-retention
  exception is **Requires Legal Decision** (T-283).
- **Subject rights:** export includes certificates; deletion cascades; restriction and objection through
  T-286.
- **Security controls:** codes are not guessable; revocation is audited.
- **Audit logs:** `certificate.revoked`, `certificate.reissued`.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 6. Submissions

- **Data:** assignment text answers, uploaded files, grade, feedback, lateness.
- **Data subjects:** learners; instructors who write feedback.
- **Purpose:** collect and mark coursework.
- **Lawful basis (proposed):** contract. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase.
- **Access roles and organisation boundary:** the learner; the instructor of the course; admin and
  super_admin.
- **Storage:** `assignment_submissions`; files in the private `assignment-submissions` bucket.
- **Retention and deletion:** rows cascade with the account. Whether the files are removed from the bucket at
  the same time is not verified: gap.
- **Subject rights:** export covers submissions (text and file name, not file contents); deletion cascades
  for rows.
- **Security controls:** private bucket, signed short-lived links, upload type and size checks.
- **Audit logs:** none specific to submissions.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 7. Messages

- **Data:** discussion threads and replies, votes and reports, course reviews and instructor replies,
  in-app notifications and preferences, announcements and the log of who received them.
- **Data subjects:** learners, instructors, administrators.
- **Purpose:** let people discuss courses, review them, and receive notices.
- **Lawful basis (proposed):** contract for notices; legitimate interests or consent for discussions and
  reviews. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase; the mail provider for announcement
  emails (Hostinger Mail or Resend, ADR-044).
- **Access roles and organisation boundary:** readers of the course; the author; moderators (admin);
  announcements by administrators.
- **Storage:** `discussions`, `discussion_posts`, `discussion_votes`, `discussion_reports`, `course_ratings`,
  `review_reports`, `notifications`, `notification_preferences`, `announcements`, `announcement_deliveries`.
- **Retention and deletion:** removed with the account (cascade). Moderation may hide or restore content; a
  hidden item is still stored.
- **Subject rights:** export covers reviews written (not discussion posts or notifications: gap).
- **Security controls:** HTML sanitising, RLS, rate limits, moderation tools.
- **Audit logs:** moderation hide, restore and dismiss; announcements sent.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision** (includes the mail provider).

## 8. Audit Logs

- **Data:** actor id and a copy of the actor's email at the time, action, resource, metadata (for example
  report type, row counts, filters' ids), time. Includes `report.*`, `resource.*` and
  `content_licence.access_refused` events.
- **Data subjects:** staff and users whose actions or accounts are logged.
- **Purpose:** accountability and security investigation.
- **Lawful basis (proposed):** legitimate interests; legal obligation for some events.
  **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase.
- **Access roles and organisation boundary:** admin and super_admin (`audit.read`). Rows cannot be changed
  or deleted by the application.
- **Storage:** `audit_logs`, append-only by trigger. No foreign key, so rows outlive the account.
- **Retention and deletion:** rows older than 2 years are deleted weekly by `purge_old_audit_logs()`
  *(implemented, Sundays 04:00 UTC)*. A deleted account's email copy stays until then; whether to anonymise it
  sooner is **Requires Legal Decision** (T-283).
- **Subject rights:** not included in the export (gap); erasure is limited by the retention rule above.
- **Security controls:** append-only trigger, restricted read permission.
- **Audit logs:** this is the audit log; exports of it are logged (`audit.exported`).
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 9. Organization Membership

- **Data:** organisation, departments and teams, membership and organisation role, SSO email domains,
  learning assigned to members.
- **Data subjects:** employees and members of customer organisations.
- **Purpose:** keep each organisation's data apart; let org admins assign and see their members' learning.
- **Lawful basis (proposed):** contract with the customer organisation; the controller or processor split
  with the customer is **Requires Legal Decision.**
- **Controller / processors:** possibly customer organisation as controller and Lernoviq as processor for
  its members' data. **Requires Legal Decision.**
- **Access roles and organisation boundary:** an org_admin sees only their own organisation; admin and
  super_admin see all.
- **Storage:** `organizations`, `organization_members`, `organization_sso_domains`, `departments`, `teams`,
  `assigned_learning`.
- **Retention and deletion:** membership removed with the account (cascade).
- **Subject rights:** export covers organisation memberships; requests about organisation-held data may need
  to go to the customer organisation.
- **Security controls:** organisation isolation enforced in row-level security and tested.
- **Audit logs:** member added, removed, role changed, learning assigned, SSO domain changes, organisation
  report export.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 10. Support Data

- **Data:** contact-form enquiries (name, email, message, type), instructor applications, reports of
  discussions and reviews.
- **Data subjects:** website visitors, applicants, people who report content.
- **Purpose:** answer enquiries, review instructor applications, moderate.
- **Lawful basis (proposed):** pre-contract steps or legitimate interests for enquiries and applications.
  **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase.
- **Access roles and organisation boundary:** admin and super_admin (`enquiry.read` for enquiries).
  Visitors cannot read enquiries.
- **Storage:** `enquiries`, `instructor_applications`, `discussion_reports`, `review_reports`.
- **Retention and deletion:** enquiries and their consent records are deleted after 24 months by `purge-operational-data-daily` *(implemented, T-284)*. The marketing-site checkbox is stored in `consent_records` with its wording, policy version, time and withdrawal state *(implemented, T-285)*; who handles a withdrawal request is the T-286 workflow.
- **Subject rights:** a visitor has no account, so requests arrive by email (T-286).
- **Security controls:** server-only insert, rate limit, no public read.
- **Audit logs:** none specific to enquiries.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 11. Analytics

- **Data:** platform counts per day, per-course and per-learner usage used by the report catalogue (idle
  users, individual progress, time spent, usage by module and by library licence), API request logs with IP,
  rate-limit hits. No third-party analytics or advertising script is present in the application source.
- **Data subjects:** learners, instructors, API clients.
- **Purpose:** show administrators and instructors how courses are used; protect the platform.
- **Lawful basis (proposed):** legitimate interests. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase, the VPS.
- **Access roles and organisation boundary:** admin and super_admin (`analytics.read`); instructors see their
  own courses; org admins see their own organisation.
- **Storage:** report functions over the tables in categories 3 and 4; `lesson_time`; `api_request_log`;
  `rate_limit_hits`.
- **Retention and deletion:** derived from the source data; `api_request_log` and `rate_limit_hits` have no
  retention job: gap.
- **Subject rights:** covered with the source data; objection to profiling through T-286 and `docs/DPIA.md`.
- **Security controls:** analytics permission, function-level access checks; report exports carry `user_id`
  only (no name, no email).
- **Audit logs:** report create, run, delete and download are audited.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 12. Report Exports

- **Data:** CSV files generated from saved reports (user ids, course ids, progress and usage figures; no
  names or emails) and the export records.
- **Data subjects:** the learners named by id in a report; the administrator who created it.
- **Purpose:** let administrators take a report away.
- **Lawful basis (proposed):** legitimate interests. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase Storage.
- **Access roles and organisation boundary:** the administrator who owns the saved report; links expire after
  300 seconds.
- **Storage:** private `report-exports` bucket; `report_exports`, `saved_reports`.
- **Retention and deletion:** files and records older than 30 days are deleted by the scheduled-reports job
  *(implemented, T-277)*.
- **Subject rights:** covered with the source data; each download is audited.
- **Security controls:** private bucket, signed short-lived links, minimised columns, audit of every
  download.
- **Audit logs:** `report.created`, `report.run`, `report.scheduled_run`, `report.downloaded`,
  `report.deleted`.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 13. Uploaded Files

- **Data:** course videos, lesson attachments, thumbnails, assignment resources, learner submissions,
  instructor resource library files (with optional expiry), SCORM packages, avatars.
- **Data subjects:** instructors and learners; people who appear in uploaded media.
- **Purpose:** deliver course content and coursework.
- **Lawful basis (proposed):** contract. **Requires Legal Decision.**
- **Controller / processors:** controller as above. Processors: Supabase Storage.
- **Access roles and organisation boundary:** per bucket: the owner, enrolled learners for course files,
  course reviewers and administrators. `avatars` and `course-thumbnails` are public; all other buckets
  (`course-videos`, `lesson-assets`, `assignment-resources`, `assignment-submissions`, `resource-library`,
  `scorm-packages`, `scorm-uploads`, `report-exports`) are private.
- **Storage:** Supabase Storage buckets listed above.
- **Retention and deletion:** removed when the owning record is deleted for most buckets; account deletion
  removing a user's files from storage is not verified: gap. Storage objects are not in the database backup
  (`docs/RUNBOOKS.md`).
- **Subject rights:** the export lists metadata, not file contents.
- **Security controls:** upload type and size checks, signed links, private buckets, expiry for library
  resources.
- **Audit logs:** resource created, expiry changed, expired access refused, resource deleted.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.**

## 14. Third-Party Processor Data

- **Data:** data passed to vendors in order to run the service: account data and learning data held by
  Supabase; application hosting on a Hostinger VPS (ADR-045); email through Hostinger Mail or Resend (ADR-044);
  Google sign-in; GitHub Actions holds the weekly database backup artifact (30 days, contains all personal
  data in the database). No payment provider is connected yet (Dodo Payments is planned, T-180); no error
  tracker is configured (errors go to structured logs only).
- **Data subjects:** everyone whose data is in the categories above.
- **Purpose:** hosting, authentication, email, backup.
- **Lawful basis (proposed):** the same as for each category; vendors act as processors.
  **Requires Legal Decision.**
- **Controller / processors:** controller as above; the vendors are processors, which needs a data
  processing agreement with each. Which agreements exist is not recorded: **Requires Legal Decision.**
- **Access roles and organisation boundary:** administrators with vendor console access; GitHub repository
  access for the backup artifact.
- **Storage:** vendor systems. Regions are not recorded.
- **Retention and deletion:** backup artifacts 30 days; others per vendor. Deleting a person's data from
  backups is not possible one record at a time: documented in `docs/RETENTION.md`.
- **Subject rights:** requests that involve vendor-held data are handled by the controller through T-286.
- **Security controls:** vendor access control and secrets handling (`docs/SECURITY.md` section 14).
- **Audit logs:** none for vendor consoles in the repository.
- **Breach-response owner:** **Requires Legal Decision.**
- **International transfers:** **Requires Legal Decision.** Likely, because several vendors are non-EU; not
  verified.
