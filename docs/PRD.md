# Modern LMS — Product Requirements Document

## 1. Purpose

Modern LMS is a multi-role learning platform for:

- Learners who discover, enroll in, and complete learning.
- Instructors who create, publish, teach, and optimize courses.
- Administrators who operate the platform, govern users/content, manage organizations, commerce, analytics, AI, and security.

This PRD converts the supplied learner, instructor, and admin prototypes into a product definition suitable for a dynamic production web application.

## 2. Prototype Basis

Three supplied prototypes were reviewed:

1. **LearnSphere learner portal**
   - Dashboard
   - My Learning
   - Learning Paths
   - Course Player
   - Assessments
   - Assignments
   - Calendar
   - Discussions
   - Certificates
   - Progress
   - AI Tutor
   - Notifications

2. **Instructor portal**
   - Overview
   - My Courses
   - Create Course
   - Curriculum Builder
   - Lesson Editor
   - Assessment Builder
   - Assignment Builder
   - Question Bank
   - Course Preview
   - Course Readiness
   - Review / submission flow
   - Students
   - Discussions
   - Messaging
   - Analytics
   - Reviews
   - Earnings
   - Certificates
   - Resources
   - AI Assistant
   - Settings

3. **Admin Console / Atrium-style prototype**
   - Overview
   - Users / roles / organizations
   - Courses / approval
   - Learning operations
   - Commerce
   - Content / moderation
   - Analytics
   - Communication
   - AI management
   - Organizations
   - System settings
   - Integrations / API
   - Audit logs
   - Security

The prototypes are treated as the primary UX source. The implementation should preserve their strongest interaction patterns while replacing prototype-local state with real persistence, authorization, validation, and API-backed behavior.

## 3. Product Problem

A modern LMS needs one coherent platform while serving three very different jobs:

- Learners need low-friction discovery, focused learning, progress visibility, assessments, certificates, and contextual assistance.
- Instructors need a guided course-production workflow and actionable learner analytics.
- Administrators need operational control, governance, security, commerce, content moderation, and organization-level reporting.

The product must therefore share a design system without forcing all roles into one information architecture.

## 4. Goals

### Primary goals

1. Deliver a production-quality responsive LMS web application.
2. Preserve the supplied prototype UX patterns where they improve usability.
3. Provide role-specific portals with clear authorization boundaries.
4. Make the main learning lifecycle fully dynamic:
   discovery → enrollment → learning → assessment → completion → certificate.
5. Make the instructor lifecycle dynamic:
   create → edit → validate → submit → review → publish → analyze → improve.
6. Make the admin lifecycle dynamic:
   monitor → investigate → manage → approve → configure → audit.
7. Establish documentation and engineering rules that can guide AI-assisted development.

### Secondary goals

- AI-assisted learning and course creation.
- Organization / enterprise learning.
- Commerce and subscriptions.
- Analytics and reporting.
- Content moderation and auditability.

## 5. Non-Goals for the First Production Slice

The platform architecture should allow these later, but they should not block the core LMS:

- Native mobile applications.
- Complex social networking.
- Real-time video conferencing.
- Marketplace seller ecosystem with arbitrary third-party payouts.
- Fully autonomous AI-generated courses.
- Microservice decomposition of every domain.
- Custom video CDN/transcoding infrastructure.

## 6. Personas

### Learner

Needs to:
- Find relevant courses.
- Understand course value before enrolling.
- Resume learning quickly.
- Complete lessons and assessments.
- Track progress and skills.
- Earn and verify certificates.
- Ask the AI Tutor questions grounded in learning content.

### Instructor

Needs to:
- Create a course efficiently.
- Organize curriculum.
- Upload/manage content.
- Build assessments.
- Preview the learner experience.
- Submit for review.
- Respond to learners.
- Analyze engagement and completion.
- Improve weak lessons.

### Administrator

Needs to:
- Manage users and roles.
- Approve/reject courses.
- Manage organizations.
- Monitor learning and commerce.
- Moderate content.
- Manage AI policies and usage.
- Configure integrations and security.
- Inspect audit history.

## 7. Core User Journeys

### Learner journey

Landing → Sign up/Login → Verification → Onboarding → Dashboard → Search/Catalog → Course details → Enrollment → Payment/subscription if required → My Learning → Course Player → Assessment → Completion → Certificate → Progress/Skills → Recommendations/AI Tutor.

### Instructor journey

Login → Instructor dashboard → Create Course → Basics → Curriculum → Lessons/Content → Assessments → Pricing/Settings → Preview → Readiness Check → Submit for Review → Admin feedback → Resubmit/Approve → Publish → Students → Analytics → Course improvement.

### Admin journey

Admin login → MFA → Overview → Pending actions → User/Course/Organization/Commerce/Content operation → Review/change → Confirmation/audit event → Analytics → System/AI/security configuration.

## 8. Functional Requirements

### Authentication

- Email/password authentication.
- Email verification.
- Password reset.
- Optional SSO for organizations.
- MFA for administrators.
- Session management.
- Role-aware routing.
- Server-side authorization.

### Learner

- Browse/search courses.
- Filter by category, level, language, duration, price, rating.
- View course landing page.
- Enroll.
- Manage learning library.
- Resume course.
- Watch/read lessons.
- Track lesson completion.
- Complete quizzes and assignments.
- View assessment results.
- Participate in discussions.
- View calendar/deadlines.
- View certificates.
- View progress and skills.
- Use AI Tutor.
- Receive notifications.

### Instructor

- Manage profile.
- Create/edit courses.
- Build sections and lessons.
- Upload media/documents.
- Create quizzes and assignments.
- Use question bank.
- Preview as learner.
- Run readiness checks.
- Submit for review.
- Receive reviewer feedback.
- Publish approved courses.
- Manage students.
- Message students.
- Moderate discussions.
- Review ratings.
- View analytics.
- ~~View earnings.~~ Removed: instructors are not paid through the platform (ADR-037).
- Use AI assistant.

### Admin

- Manage users.
- Manage roles and permissions.
- Manage instructors.
- Manage organizations.
- Manage courses and categories.
- Review course submissions.
- Manage enrollments/cohorts.
- Manage assessments/certificates.
- Manage orders/subscriptions/payments/refunds/coupons.
- Manage media/documents/SCORM.
- Moderate content.
- View platform and role-specific analytics.
- Manage notifications/email templates.
- Configure AI policies, usage, cost, safety and knowledge base.
- Manage integrations/API.
- Inspect audit logs.
- Configure security.

## 9. Course Lifecycle

A course is not simply `published: true`.

Use explicit states:

`draft → submitted → in_review → changes_requested → approved → published → archived`

A rejected submission retains reviewer feedback and version history.

Publishing must require the readiness rules appropriate to the course.

## 10. Assessment Lifecycle

`draft → published → available → attempts → graded → reviewed`

Support:
- Multiple choice
- Multiple select
- True/False
- Short answer
- Essay
- Coding
- Assignment/file submission

Grading strategy must be stored per question/assessment.

## 11. Certificate Lifecycle

`eligible → issued → verified → revoked`

Certificates must have immutable verification identifiers and an audit trail.

## 12. AI Product Requirements

AI is an assistant, not the source of truth.

### Learner AI Tutor

- Ground answers in enrolled/current course content where configured.
- Show relevant lesson/source context where possible.
- Refuse or redirect unsupported questions.
- Avoid providing direct answers to restricted graded assessments when policy prohibits it.
- Escalate low-confidence questions to instructor/discussion workflows when enabled.

### Instructor AI

- Generate outlines.
- Generate learning objectives.
- Draft summaries/transcripts.
- Generate quiz questions.
- Suggest assignments.
- Summarize reviews.
- Identify learner drop-off patterns.
- Suggest course improvements.

Generated content must remain editable and must not silently publish.

### Admin AI controls

- Usage metrics.
- Cost monitoring.
- Model/policy configuration.
- Safety controls.
- Knowledge base/RAG status.
- Generation job history.

## 13. Commerce

The product architecture supports:

- One-time course purchases.
- Subscriptions.
- Organization/enterprise plans.
- Coupons.
- Refunds.
- Payment status.
- ~~Instructor earnings.~~ Removed (ADR-037); course prices are set by the platform.

Commerce implementation should be isolated behind a payment service interface so payment provider changes do not affect course/learning domain logic.

## 14. Enterprise / Organizations

An organization can contain:

Organization → Departments → Teams → Users

Organization administrators can receive scoped permissions.

Enterprise learning may include:
- Assigned courses.
- Learning paths.
- Cohorts.
- Required completion.
- Organization reports.

## 15. Dynamic Data Requirements

No production screen should depend on hard-coded prototype arrays.

Every production list should support:
- Loading.
- Empty.
- Error.
- Pagination/infinite loading where appropriate.
- Search.
- Filtering.
- Sorting where useful.
- Server-side authorization.
- Optimistic UI only where safe.
- Refresh/revalidation.

## 16. Success Criteria

### Learner

A learner can:
1. Create an account.
2. Log in.
3. Find a course.
4. View course details.
5. Enroll.
6. Start the course.
7. Complete lessons.
8. Complete an assessment.
9. See progress update.
10. Earn a certificate when eligible.

### Instructor

An instructor can:
1. Log in.
2. Create a course.
3. Add sections and lessons.
4. Add content.
5. Add an assessment.
6. Preview the course.
7. Pass readiness checks.
8. Submit for review.
9. Receive admin feedback.
10. Publish after approval.
11. View learner analytics.

### Admin

An admin can:
1. Log in with MFA.
2. View platform overview.
3. Manage users.
4. Review a course.
5. Approve/reject/request changes.
6. Manage organizations.
7. Inspect analytics.
8. Manage AI settings.
9. Inspect audit logs.
10. Configure system settings.

## 17. MVP Recommendation

The first vertical slice should be:

Authentication → Learner dashboard → Course catalog → Course detail → Enrollment → Course player → Progress → Assessment → Completion → Certificate.

Then:

Instructor authentication → Course creation → Curriculum → Lesson content → Assessment → Preview → Readiness → Review submission.

Then:

Admin authentication → User management → Course approval → Basic analytics → Audit logging.

Commerce, enterprise, AI, advanced analytics and integrations should be added after the core learning loop is stable.

## 18. Product Principle

The product should feel like one LMS, but each role should feel like it was designed specifically for their job.
