# LERNOVIQ — Security Requirements

## 1. Security Objective

Protect:
- User accounts.
- Course content.
- Organization data.
- Instructor content.
- Assessment integrity.
- Payments.
- Certificates.
- AI knowledge sources.
- Administrative operations.
- Audit history.

Security must be designed into the architecture rather than added immediately before launch.

## 2. Authentication

Use managed authentication.

Requirements:
- Secure password hashing through the auth provider.
- Email verification.
- Password reset.
- Session expiration.
- Refresh-token handling.
- MFA for administrators.
- Optional organization SSO.
- Secure logout.

Private routes require authentication.

The supplied guide explicitly requires private routes to require authentication and server-side authorization.

## 3. Authorization

Use RBAC with scoped permissions.

Core roles:

```text
Learner
Instructor
Content Reviewer
Org Admin
Support Agent
Admin
Super Admin
```

Never authorize solely from:
- URL parameters,
- hidden UI buttons,
- localStorage,
- client state,
- request-provided role fields.

Every protected mutation must verify authorization server-side.

## 4. Organization Isolation

Organization users may access only data permitted by their organization scope.

Examples:
- Org Admin can manage their organization.
- Org Admin cannot access another organization's users.
- Instructor cannot see private instructor/admin data.
- Learner cannot inspect another learner's private progress.

Database RLS should provide a second boundary.

## 5. Database Security

Use:
- RLS policies.
- Least-privilege service roles.
- Foreign keys.
- Check constraints.
- Unique constraints.
- Transactional updates for important state transitions.

Never expose privileged database credentials to the browser.

## 6. Input Validation

Validate all:
- form fields,
- query parameters,
- route parameters,
- API bodies,
- file metadata,
- AI prompts where policy requires.

Use schema validation consistently.

Never trust client-generated IDs or permission claims.

## 7. XSS Protection

Treat user-generated content as untrusted:
- discussions,
- reviews,
- course descriptions,
- lesson HTML,
- instructor messages,
- AI-generated text.

Sanitize rich text before rendering.

Avoid unsafe raw HTML unless it has been explicitly sanitized.

## 8. CSRF / Request Protection

Use framework-supported protections for state-changing operations.

For custom APIs:
- verify authentication,
- verify authorization,
- validate origin/CSRF where applicable,
- validate request body.

## 9. File Upload Security

For every upload validate:
- authenticated owner,
- authorization,
- file type,
- MIME type,
- extension,
- file size,
- filename,
- storage path,
- upload status.

Never trust the client-provided MIME type alone.

Store uploads outside the application source tree.

For potentially dangerous document formats, use safe processing/sandboxing before indexing or rendering.

The supplied guide explicitly calls for validating file type, size and filename.

## 10. Video Security

Use signed/private URLs where course access is restricted.

Do not expose permanent private media URLs.

Video access should check:
- enrollment,
- organization assignment,
- course publication state,
- instructor/admin permission.

## 11. Assessment Security

Protect:
- correct answers,
- question banks,
- grading logic,
- assessment attempts.

Learner-facing APIs must never return answer keys unless intentionally required.

Prevent simple manipulation of:
- score,
- completion,
- attempt state,
- certificate eligibility.

## 12. Certificate Security

Certificates should contain:
- unique certificate ID,
- learner identity,
- course identity,
- issue date,
- verification status.

Certificate verification must not expose unrelated learner data.

Revocation must be audited.

## 13. Payment Security

Do not store raw card data.

Use a PCI-compliant payment provider.

Verify provider webhooks:
- signature,
- event type,
- event ID,
- idempotency.

Never trust a client-side "payment succeeded" flag.

## 14. Secrets

Never commit:
- API keys,
- database passwords,
- service-role keys,
- payment secrets,
- AI provider keys.

Use environment variables.

Keep `.env.example` in Git and real secrets outside Git.

The supplied guide explicitly recommends `.env.example` instead of real secrets in the repository.

## 15. AI Security

### Data boundaries

AI must not retrieve:
- another organization's private content,
- admin-only content,
- unpublished instructor content,
- private learner information without authorization.

### Prompt injection

Treat course documents and retrieved text as untrusted input.

Do not allow retrieved content to override system/application policy.

### Data retention

Define retention for:
- AI prompts,
- AI responses,
- transcripts,
- embeddings,
- generated content.

### Graded assessments

If policy disables direct answers during graded assessments:
- detect assessment context,
- provide hints/explanations,
- do not provide the final answer.

## 16. RAG Security

Every retrieval request must carry an authorization context.

Conceptually:

```text
User
→ permissions
→ allowed course/org IDs
→ vector search constrained to allowed IDs
→ retrieved chunks
→ AI
```

Never perform unrestricted vector search and filter afterward only in the UI.

## 17. Audit Logging

Audit privileged actions:

- Login/security events.
- Role changes.
- User suspension.
- Course approval.
- Course rejection.
- Course publishing.
- Content deletion.
- Refund.
- Certificate revocation.
- AI policy changes.
- Organization permission changes.
- Integration changes.

Audit records should be append-only from normal application workflows.

## 18. Rate Limiting

Rate-limit:
- login attempts,
- password reset,
- verification requests,
- public APIs,
- AI requests,
- upload initiation,
- assessment submission,
- expensive analytics queries.

Use stronger limits for unauthenticated endpoints.

## 19. Abuse Prevention

Monitor:
- repeated failed login attempts,
- unusual certificate verification traffic,
- bulk scraping,
- excessive AI usage,
- suspicious payment behavior,
- repeated assessment attempts,
- abnormal download activity.

## 20. Logging

Do not log:
- passwords,
- auth tokens,
- payment secrets,
- private message content unnecessarily,
- sensitive personal data unnecessarily.

Use structured logs with correlation IDs.

## 21. Privacy

Collect only data required for product functionality.

Support:
- privacy policy,
- data export where required,
- account deletion workflow,
- organization data boundaries,
- retention policies.

## 22. Security Headers

Configure appropriate:
- Content-Security-Policy,
- frame protections,
- MIME sniffing protection,
- referrer policy,
- secure transport settings.

Review CSP when introducing analytics, video, AI or payment providers.

## 23. Dependency Security

- Keep dependencies updated.
- Run vulnerability checks.
- Avoid unnecessary packages.
- Review new packages before installation.
- Pin or lock dependency versions appropriately.

## 24. Backup and Recovery

Production database:
- automated backups,
- tested restoration,
- documented recovery process.

Critical object storage should have an appropriate backup/retention strategy.

## 25. Security Testing

Before production:
- authentication tests,
- authorization tests,
- RLS tests,
- upload tests,
- API validation tests,
- XSS tests,
- rate-limit tests,
- payment webhook tests,
- AI retrieval permission tests,
- audit logging tests.

## 26. Security Review Checklist

```text
[ ] Authentication verified
[ ] MFA tested for admins
[ ] Authorization server-side
[ ] RLS policies tested
[ ] Secrets absent from Git
[ ] Input validation complete
[ ] File validation complete
[ ] Private media protected
[ ] Assessment answers protected
[ ] Certificate verification scoped
[ ] Payment webhooks verified
[ ] AI retrieval permission-aware
[ ] Rate limits configured
[ ] Audit logging active
[ ] Error messages safe
[ ] Security headers configured
[ ] Backups configured
[ ] Recovery tested
```
