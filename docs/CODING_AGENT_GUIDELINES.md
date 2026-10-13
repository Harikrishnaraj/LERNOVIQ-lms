# **LERNOVIQ — Coding Agent Master Context**

## **1\. Role**

You are the primary coding agent working on the existing **LERNOVIQ** repository.

Your responsibility is to continue development of the existing application without unnecessarily restarting, restructuring, rewriting, or disrupting work that is already in progress.

The repository is:

`Harikrishnaraj/LERNOVIQ-lms`

You must treat the existing codebase, database migrations, architecture documents, decisions, feature list, task list, tests, and current implementation as the source of truth.

Your job is to:

1. Understand the existing implementation before modifying it.  
2. Continue development from the current state.  
3. Preserve working functionality.  
4. Implement features incrementally.  
5. Respect the existing architecture and design decisions.  
6. Identify architectural/security problems when they become relevant.  
7. Fix critical issues before building dependent functionality.  
8. Avoid unnecessary rewrites.  
9. Keep documentation and implementation synchronized.  
10. Test every meaningful change.

---

# **2\. Critical Rule — Do Not Restart the Project**

The project is already under active development.

DO NOT:

* rebuild the project from scratch  
* replace Next.js with another framework  
* replace Supabase without a concrete requirement  
* replace the existing UI architecture unnecessarily  
* delete existing features just because they are incomplete  
* rewrite working authentication  
* rewrite working database migrations  
* replace the existing design system without justification  
* convert the modular monolith into microservices prematurely  
* discard the existing task system  
* change architecture simply because you prefer another approach

If you discover a better implementation, first determine whether the existing implementation can be extended safely.

Prefer:

existing implementation  
        ↓  
incremental improvement  
        ↓  
tested change

instead of:

existing implementation  
        ↓  
rewrite everything

---

# **3\. Current Product**

LERNOVIQ is a multi-role learning management platform with three independent portal experiences:

LERNOVIQ  
│  
├── Learner Portal  
│  
├── Instructor Portal  
│  
└── Admin Portal

These are separate workspaces sharing the same backend/domain platform.

---

# **4\. Product Roles**

The platform currently defines these roles:

learner  
instructor  
content\_reviewer  
org\_admin  
support\_agent  
admin  
super\_admin

Do not assume that a role automatically grants access to every resource.

There are two separate concepts:

Role  
\+  
Permission  
\+  
Resource ownership / organization scope

For example:

Instructor  
    ↓  
course.edit permission  
    ↓  
owns course?  
    ↓  
YES → allow  
NO  → deny

An organization administrator must not automatically access another organization's data.

---

# **5\. Existing Technology Stack**

Preserve the current stack unless there is a strong technical reason to change it.

Current foundation:

Next.js  
React  
TypeScript  
Tailwind CSS  
Supabase  
PostgreSQL  
Supabase Auth  
Supabase RLS  
Zod  
Vitest  
Playwright  
Lucide

The application uses the Next.js App Router and `src/` structure.

---

# **6\. Existing Architecture**

The preferred architecture is a modular monolith.

Use this conceptual flow:

UI  
 │  
 ▼  
Server Component / Server Action / Route Handler  
 │  
 ▼  
Authorization  
 │  
 ▼  
Application / Domain Service  
 │  
 ▼  
Database / Supabase  
 │  
 ▼  
PostgreSQL \+ RLS

Do not put complex business logic directly inside page components.

Prefer:

page.tsx  
    ↓  
service  
    ↓  
domain logic  
    ↓  
database

---

# **7\. Source-of-Truth Documentation**

Before implementing a major feature, inspect the relevant:

README.md  
CLAUDE.md  
docs/ARCHITECTURE.md  
docs/PRD.md  
docs/DESIGN.md  
docs/DECISIONS.md  
docs/MEMORY.md  
docs/FEATURES.md  
docs/TASKS.md  
docs/TEST\_PLAN.md

Do not create a competing architecture document unless required.

If an existing ADR/decision conflicts with a proposed implementation, follow the documented decision unless there is a concrete reason to revise it.

If an architectural change is genuinely required:

1. identify the conflict,  
2. explain the impact,  
3. make the smallest safe change,  
4. update the appropriate documentation/decision record.

---

# **8\. Current Development Philosophy**

The project is being developed phase by phase.

The general sequence is:

Foundation  
    ↓  
Authentication  
    ↓  
Authorization  
    ↓  
Learner Core  
    ↓  
Instructor Core  
    ↓  
Admin Core  
    ↓  
Extended Learner Features  
    ↓  
Extended Instructor Features  
    ↓  
Organizations  
    ↓  
Commerce  
    ↓  
Notifications  
    ↓  
Analytics  
    ↓  
AI / RAG  
    ↓  
Integrations

Do not jump ahead unnecessarily.

If a later feature requires a foundation change, implement only the minimum foundation required.

---

# **9\. Authentication**

Supabase Auth is the authentication authority.

Existing authentication functionality includes:

/signup  
/login  
/verify-email  
/forgot-password  
/reset-password  
/auth/callback

Authentication responsibilities:

* signup  
* email verification  
* login  
* logout  
* password recovery  
* session refresh  
* suspended-user blocking  
* safe redirects

Do not introduce a second authentication system.

---

# **10\. Authorization**

Authentication answers:

"Who is the user?"

Authorization answers:

"What is the user allowed to do?"

These must remain separate.

Every protected operation should conceptually perform:

authenticate  
    ↓  
identify roles  
    ↓  
check permission  
    ↓  
check resource ownership/scope  
    ↓  
perform operation

Never rely only on:

hidden UI

or:

frontend route protection

for security.

Authorization must exist server-side.

Where applicable, PostgreSQL RLS must provide another security boundary.

---

# **11\. RBAC Rules**

The eventual permission system should support patterns such as:

course.read  
course.create  
course.edit  
course.delete  
course.submit\_review  
course.review  
course.approve  
course.publish

user.read  
user.invite  
user.suspend  
user.change\_role

assessment.create  
assessment.edit  
assessment.publish

certificate.issue  
certificate.revoke

payment.read  
payment.refund

audit.read

Do not blindly create permissions for every UI button.

Permissions should represent meaningful business capabilities.

Use a centralized authorization helper/service.

Conceptually:

can(user, permission)

and where resource scope matters:

can(user, permission, resource)

---

# **12\. Multi-Tenancy / Organizations**

The system supports organizations.

Never assume:

user has org\_admin role

means:

user can access all organization data

Always establish organization scope.

Conceptually:

User  
 ↓  
Organization Membership  
 ↓  
Organization  
 ↓  
Resource

Organization boundaries must be enforced through:

application authorization  
\+  
database RLS

Do not rely exclusively on frontend filtering.

---

# **13\. Learner Portal**

The learner experience includes:

Dashboard  
My Learning  
Learning Paths  
Course Player  
Assessments  
Assignments  
Calendar  
Certificates  
Progress  
AI Tutor  
Notifications  
Discussions  
Profile / Settings  
Reviews

The primary learner journey is:

Signup  
 ↓  
Login  
 ↓  
Dashboard  
 ↓  
Browse/Search Courses  
 ↓  
Course Details  
 ↓  
Enroll  
 ↓  
My Learning  
 ↓  
Course Player  
 ↓  
Complete Lessons  
 ↓  
Assessment  
 ↓  
Pass  
 ↓  
Complete Course  
 ↓  
Certificate

Do not implement isolated screens without considering this end-to-end flow.

---

# **14\. Instructor Portal**

The instructor experience includes:

Dashboard  
My Courses  
Create Course  
Curriculum Builder  
Lesson Editor  
Assessment Builder  
Assignment Builder  
Question Bank  
Course Preview  
Course Readiness  
Submit for Review  
Review Feedback  
Student Management  
Discussions  
Messaging  
Analytics  
Reviews  
Earnings  
Certificates  
Resource Library  
AI Assistant  
Settings

Primary instructor journey:

Login  
 ↓  
Dashboard  
 ↓  
Create Course  
 ↓  
Course Basics  
 ↓  
Curriculum  
 ↓  
Lessons  
 ↓  
Content  
 ↓  
Assessment  
 ↓  
Pricing  
 ↓  
Preview  
 ↓  
Readiness Check  
 ↓  
Submit for Review  
 ↓  
Admin Review  
 ↓  
Changes / Approval  
 ↓  
Publish

---

# **15\. Admin Portal**

The admin workspace includes:

Overview  
Users  
Instructors  
Organizations  
Roles & Permissions  
Courses  
Course Review  
Enrollments  
Assessments  
Certificates  
Commerce  
Analytics  
Notifications  
Content  
Moderation  
AI  
RAG / Knowledge Base  
Audit Logs  
Integrations  
Settings

Admin operations must be audited where required.

---

# **16\. Course Lifecycle**

The course state machine is important.

Do not allow arbitrary status changes.

Conceptually:

draft  
  ↓  
submitted  
  ↓  
in\_review  
  ├── request\_changes  
  │       ↓  
  │  changes\_requested  
  │       ↓  
  │     draft  
  │  
  ├── approve  
  │       ↓  
  │    approved  
  │       ↓  
  │    published  
  │  
  └── reject  
          ↓  
       rejected

Published courses may eventually transition to:

published → archived

All state transitions must be validated server-side.

Never trust a status value sent by the browser.

---

# **17\. Course Versioning**

Course versioning must protect active learners.

Preferred model:

Course  
 │  
 ├── Published Version 1  
 │      ↓  
 │   Existing learners  
 │  
 └── Draft Version 2  
        ↓  
      Review  
        ↓  
     Published

Do not modify published course content in a way that unexpectedly changes the learning experience for learners already using that version.

When versioning is relevant, determine explicitly:

* which version an enrollment uses  
* which version an assessment belongs to  
* which version a certificate references  
* which version analytics refer to

---

# **18\. SCORM Requirement**

SCORM must be treated as a first-class learning-content type, not as an afterthought.

The platform may support:

Native Lesson  
Video  
Quiz  
Assignment  
SCORM Package

A SCORM package may contain:

imsmanifest.xml  
launch file  
JavaScript runtime  
assets

The LMS must eventually support SCORM runtime communication such as:

completion  
success status  
score  
suspend\_data  
session time  
progress

Do not build SCORM directly into unrelated course/player code.

Use a dedicated SCORM boundary/service/module.

Conceptually:

Course  
 ↓  
Learning Object  
 ↓  
SCORM Player  
 ↓  
SCORM Runtime  
 ↓  
LMS Runtime API  
 ↓  
Persistence

---

# **19\. Video Architecture**

Do not make the Next.js application server a large-file video streaming server.

Use an architecture capable of:

Upload  
 ↓  
Object Storage  
 ↓  
Processing / Transcoding  
 ↓  
HLS/DASH  
 ↓  
CDN  
 ↓  
Signed Access  
 ↓  
Learner

Access to paid/private course content must be entitlement-aware.

---

# **20\. Enrollment and Entitlements**

Enrollment should be treated as a domain concept.

Do not grant access merely because the frontend reports:

payment successful

Conceptually:

Order  
 ↓  
Payment verification  
 ↓  
Entitlement  
 ↓  
Enrollment  
 ↓  
Course access

For free courses:

Enrollment  
 ↓  
Access

For paid courses:

Verified payment  
 ↓  
Entitlement  
 ↓  
Enrollment

---

# **21\. Payment Security**

When commerce is implemented:

Never trust client-side payment success.

Use:

Payment Provider  
 ↓  
Verified Webhook  
 ↓  
Signature Verification  
 ↓  
Idempotency  
 ↓  
Payment State  
 ↓  
Entitlement  
 ↓  
Enrollment

Webhook processing must be idempotent.

A repeated webhook must not create duplicate:

* orders  
* payments  
* enrollments  
* entitlements  
* certificates

Use provider event/payment IDs as unique identifiers where appropriate.

---

# **22\. Assessment Security**

Assessment answer keys must never be exposed to learner clients.

Do not send:

correct\_answer  
answer\_key  
grading rules

unless the specific information is intentionally safe to expose.

Preferred:

Learner  
 ↓  
Assessment questions  
 ↓  
Submit answers  
 ↓  
Server  
 ↓  
Grade  
 ↓  
Result

Server-side grading is authoritative.

---

# **23\. Assessment Attempts**

Treat attempts as stateful entities.

Conceptually:

started  
 ↓  
in\_progress  
 ↓  
submitted  
 ↓  
graded

Protect against:

* double submission  
* browser refresh  
* multiple tabs  
* retries  
* network failures  
* duplicate requests

Submission should be idempotent.

---

# **24\. Assessment Timer**

Do not trust browser timers for security.

Do not rely only on:

setTimeout()

Persist server-side timing information:

started\_at  
expires\_at

and validate against server time.

---

# **25\. Certificates**

Certificates should contain immutable issuance information.

When issuing a certificate, capture a snapshot of relevant data such as:

certificate\_id  
learner name  
course title  
course/version  
completion date  
issuer  
issued\_at

Do not dynamically regenerate historical certificate information from mutable course records.

Certificate IDs must be unique.

Public certificate verification must not expose private learner information unnecessarily.

---

# **26\. Audit Logging**

Privileged actions should be auditable.

Examples:

user suspended  
role changed  
course approved  
course rejected  
course published  
certificate revoked  
payment refunded  
organization changed

Audit logging should occur in the service/domain operation rather than depending on frontend code.

Conceptually:

privileged service  
 ├── authorize  
 ├── perform operation  
 └── recordAudit

Audit logs should be append-oriented.

---

# **27\. AI Tutor**

AI Tutor must never bypass LMS authorization.

Preferred flow:

Learner  
 ↓  
Authenticated user  
 ↓  
Authorized course/content scope  
 ↓  
Retrieval  
 ↓  
Filtered chunks  
 ↓  
LLM  
 ↓  
Response

Never perform unrestricted global vector search for a learner.

The AI should only retrieve content the learner is allowed to access.

---

# **28\. RAG / Knowledge Base**

When implementing RAG, preserve source relationships:

Document  
 ↓  
Chunks  
 ↓  
Embeddings  
 ↓  
Vector index

Every chunk should retain sufficient metadata to determine:

organization  
course  
source document  
content visibility  
version

Deletion must account for:

source document  
 ↓  
chunks  
 ↓  
embeddings/vector records  
 ↓  
cache/index

Deleted/private content must not remain retrievable.

---

# **29\. Notifications**

Do not scatter notification creation throughout UI components.

Prefer domain events:

CourseCompleted  
CourseEnrolled  
CourseSubmittedForReview  
CourseApproved  
AssignmentGraded  
AssessmentDue

then:

Domain Event  
 ↓  
Notification Service  
 ↓  
User Preferences  
 ↓  
In-App Notification  
 ↓  
Optional Email

Avoid duplicate notifications.

---

# **30\. Financial Data**

If instructor earnings and platform revenue are implemented, don't use simplistic calculations.

Eventually account for:

gross amount  
discount  
tax  
payment fees  
platform fee  
refund  
chargeback  
instructor share

Financial records should be traceable and preferably ledger-oriented.

Do not overwrite historical financial information.

---

# **31\. Database Rules**

Supabase PostgreSQL is the primary database.

Use migrations for schema changes.

Do not silently modify old migrations after they have been applied to shared environments.

Prefer new migrations:

migration A  
migration B  
migration C

rather than rewriting migration A.

All sensitive tables must have appropriate RLS.

Never assume:

server code

alone is sufficient protection for multi-tenant data.

---

# **32\. Server vs Client**

Use Server Components by default.

Use Client Components when interactivity requires them.

Do not turn entire pages into client components unnecessarily.

Prefer:

Server Component  
    ↓  
fetch authorized data  
    ↓  
Client Component for interaction

---

# **33\. Forms**

Use the existing validation approach.

Validate:

client-side  
\+  
server-side

Never trust client validation.

Zod schemas should be reusable where appropriate.

---

# **34\. Error Handling**

Every significant screen/action should eventually support:

Loading  
Empty  
Error  
Permission denied  
Success

Do not expose:

* database internals  
* stack traces  
* secrets  
* authentication implementation details  
* account enumeration information

to end users.

---

# **35\. Security Rules**

Never commit:

service role keys  
database passwords  
API secrets  
payment secrets  
AI provider keys  
private credentials

The browser must never receive privileged Supabase credentials.

The service-role key must remain server-only.

---

# **36\. Performance**

Do not optimize prematurely, but avoid obviously dangerous patterns.

Watch for:

N+1 database queries  
large client bundles  
unnecessary client components  
unbounded queries  
large API responses  
unoptimized images  
large video delivery through Next.js  
repeated AI calls  
expensive dashboard queries

Pagination should be used for large datasets.

---

# **37\. UI / Design System**

Preserve the existing design tokens and portal-specific visual language.

There are three different portal experiences.

Do not make every portal look identical.

The shared system should provide consistency for:

buttons  
inputs  
cards  
badges  
tables  
dialogs  
forms  
states  
typography  
spacing

while each portal maintains its intended UX.

---

# **38\. Existing Placeholder Routes**

The current `[...section]` placeholder routes are scaffolding.

Do not remove them all at once.

When implementing a feature:

placeholder route  
       ↓  
real feature route  
       ↓  
real data  
       ↓  
tests

Replace functionality incrementally.

Do not break unrelated routes.

---

# **39\. Task Management**

`docs/TASKS.md` is the execution roadmap.

Follow tasks in order unless there is a concrete dependency requiring a change.

For each task:

Read task  
 ↓  
Inspect existing implementation  
 ↓  
Implement  
 ↓  
Test  
 ↓  
Review  
 ↓  
Update task status  
 ↓  
Update documentation if needed  
 ↓  
Continue

Do not mark tasks complete merely because the UI renders.

---

# **40\. Feature Completion**

A feature is not considered complete simply because:

page loads

It should satisfy:

functional behavior  
\+  
authorization  
\+  
database behavior  
\+  
loading state  
\+  
empty state  
\+  
error state  
\+  
responsive behavior  
\+  
tests

where applicable.

---

# **41\. Testing**

Use the existing test stack.

Unit tests:

domain logic  
validators  
permission functions  
status transitions  
grading  
certificate rules

Integration tests:

database  
RLS  
server actions  
authorization  
webhooks

E2E tests:

real user journeys

Responsive tests:

375px  
768px  
1024px  
1440px

---

# **42\. Regression Rule**

After significant changes, run the relevant checks.

At minimum:

typecheck  
lint  
unit tests  
affected integration tests  
affected E2E tests  
production build

Do not ignore failing tests without understanding why.

If an existing unrelated test fails, document it rather than masking it.

---

# **43\. Change Discipline**

Before modifying code:

1. Inspect the relevant files.  
2. Understand existing patterns.  
3. Identify dependencies.  
4. Make the smallest reasonable change.  
5. Run relevant tests.  
6. Inspect the diff.  
7. Update documentation/task state if necessary.

Do not make broad speculative refactors while implementing an unrelated feature.

---

# **44\. When You Find an Existing Problem**

Do not stop the entire development process because you found a future architectural risk.

Classify it:

### **Critical**

Security/data corruption/payment/authorization issue that affects the feature being implemented.

→ Fix before continuing.

### **Blocking**

The current feature cannot safely be implemented without addressing it.

→ Fix the dependency first.

### **Important but non-blocking**

Architectural improvement that should eventually happen.

→ Document it and continue.

### **Cosmetic**

Does not affect current functionality.

→ Don't interrupt current implementation.

---

# **45\. Do Not Over-Engineer**

The goal is a production-capable LMS, not an unnecessarily complicated distributed system.

Do not introduce:

microservices  
Kafka  
Redis  
Kubernetes  
complex event buses  
multiple databases

merely because they are common technologies.

Use them only when a real requirement justifies them.

Start with the existing modular monolith.

---

# **46\. Decision Rule**

Whenever you are uncertain, prioritize in this order:

1\. Security  
2\. Data integrity  
3\. Authorization  
4\. Existing architecture  
5\. Product requirements  
6\. Maintainability  
7\. Performance  
8\. Developer convenience

Never sacrifice security or data integrity merely to make implementation easier.

---

# **47\. Compatibility Rule**

Before changing an existing API, database structure, component contract, or route:

Check:

Who uses this?  
What depends on it?  
Are tests relying on it?  
Does another portal use it?  
Does the database depend on it?

Prefer backward-compatible changes when possible.

---

# **48\. No Silent Scope Expansion**

If the task is:

Build learner course catalog

do not simultaneously redesign:

payments  
AI  
admin  
SCORM  
notifications

unless they are necessary dependencies.

Implement the requested scope and keep future architecture compatibility in mind.

---

# **49\. Development Communication**

Before a major implementation change, briefly state:

What I found  
What I am changing  
Why  
What files/components are affected  
How I will verify it

Do not repeatedly ask for confirmation for ordinary implementation decisions when the repository requirements already provide enough context.

Proceed using the established architecture.

Ask only when there is a genuine product decision that cannot safely be inferred.

---

# **50\. Final Principle**

The repository is already under construction.

Your job is NOT:

"Design a new LMS."

Your job is:

"Continue building this LMS correctly."

Preserve working code.

Implement incrementally.

Protect existing behavior.

Respect the documented architecture.

Do not introduce unnecessary rewrites.

Fix security and data-integrity problems when they become relevant.

Keep the three portals independent at the UX level while sharing the underlying domain platform.

Build the system so that:

Learner  
Instructor  
Admin  
     ↓  
Authentication  
     ↓  
Authorization  
     ↓  
Domain Services  
     ↓  
Supabase  
     ↓  
PostgreSQL \+ RLS

remains the core architectural model.

The final system should be secure, maintainable, testable, multi-role, multi-tenant capable, SCORM-compatible, commerce-ready, and extensible for AI/RAG without requiring a fundamental rewrite later.

