# LERNOVIQ — Design System

## 1. Design Goal

Create one recognizable LERNOVIQ product across Learner, Instructor and Admin portals while giving each portal a different density and information architecture.

The prototypes already establish a strong visual direction:
- light learner surfaces,
- strong blue/indigo primary actions,
- dark instructor navigation,
- enterprise admin console density,
- rounded cards,
- subtle borders,
- clear status colors,
- strong dashboard hierarchy.

Keep those choices, but normalize them into one production design system.

## 2. Design Principles

1. Clarity before decoration.
2. One primary action per major section.
3. Consistent navigation patterns.
4. Dense only where operational work requires density.
5. Progress should always be visible during learning.
6. Destructive actions require confirmation.
7. Every async action needs feedback.
8. Empty states should explain what to do next.
9. Mobile layouts should be designed, not merely compressed.
10. Accessibility is part of the design system.

## 3. Typography

Recommended:

- Display: Plus Jakarta Sans
- Body: Inter
- Monospace: JetBrains Mono

The supplied learner and instructor prototypes already use this combination.

Type scale:

```text
Display XL  32–40
Display L   28–32
H1          24
H2          20
H3          16
Body        14–16
Small       12–13
Caption     11–12
Mono        12–14
```

Use heavier display typography for page headings and regular body typography for operational content.

## 4. Color Tokens

### Core

```text
Background:       #F8FAFC
Surface:          #FFFFFF
Text:             #0F172A
Text secondary:   #64748B
Text muted:       #94A3B8
Border:           #E2E8F0
Border subtle:    #F1F5F9
```

### Brand

```text
Primary:          #4F46E5
Primary dark:     #3730A3
Primary light:    #EEF2FF
Blue:             #2563EB
```

### Semantic

```text
Success:          #10B981
Warning:          #F59E0B
Danger:           #EF4444
Info:             #0EA5E9
AI accent:        #7C3AED
```

Do not use status colors as decoration. They communicate meaning.

## 5. Portal Themes

### Learner

Light shell.

Primary emphasis:
- Blue.
- Indigo.
- Green progress/success.
- Purple AI.

Sidebar from the prototype is white with a subtle border.

### Instructor

Dark sidebar + light workspace.

The supplied prototype's dark navigation is effective for distinguishing the teaching workspace.

Use:
- Dark sidebar: `#0F172A`
- Active navigation: indigo tint.
- Workspace: `#F8FAFC`
- Cards: white.

### Admin

Use a lighter enterprise console shell.

Admin should prioritize:
- table readability,
- operational density,
- status indicators,
- filters,
- bulk actions,
- auditability.

Do not copy the prototype's brand name; preserve its information architecture and interaction patterns.

## 6. Layout

Desktop:
- 240px sidebar where full navigation is required.
- 60–64px top header.
- Content max-width generally 1100–1400px.
- 24–32px page padding.

Tablet:
- collapsible sidebar.
- 20–24px content padding.

Mobile:
- drawer navigation.
- 16px page padding.
- bottom navigation for learner.
- horizontally scrollable tabs where appropriate.
- tables become cards.

## 7. Radius

```text
Small controls: 8px
Inputs:         8–10px
Cards:          12–16px
Large hero:     18–20px
Pills:          999px
```

The supplied prototypes use 12–20px card radii. Keep this range consistent.

## 8. Shadows

Prefer borders over shadows.

Use:
- `shadow-sm` for elevated cards/popovers.
- stronger shadows only for menus/dialogs.
- never use large decorative glows.

## 9. Buttons

### Primary

Filled brand button.

Used for:
- Enroll.
- Create course.
- Save.
- Submit.
- Publish.

### Secondary

White/neutral outlined button.

### Ghost

Navigation and low-priority actions.

### Destructive

Red action for irreversible operations.

Every button needs:
- default,
- hover,
- focus,
- disabled,
- loading.

## 10. Forms

Inputs must have:
- visible label,
- optional hint,
- validation,
- error,
- disabled state,
- loading state when relevant.

Never rely only on placeholder text.

## 11. Cards

Card anatomy:

```text
Header
Title
Supporting text
Content
Optional metadata
Actions
```

Do not create nested cards unnecessarily.

## 12. Data Tables

Admin and instructor operational screens should use:

- sticky headers where useful,
- column alignment,
- status badges,
- row actions,
- bulk selection,
- pagination,
- filters,
- search,
- empty state,
- loading skeleton.

On mobile:
- transform rows into stacked summary cards,
- keep primary action visible.

## 13. Status System

Use consistent statuses.

Course:

```text
Draft
In Review
Changes Requested
Approved
Published
Archived
Rejected
```

Enrollment:

```text
Active
Completed
Paused
Expired
Cancelled
```

User:

```text
Invited
Active
Inactive
Suspended
```

Payment:

```text
Pending
Paid
Failed
Refunded
Disputed
```

## 14. Learner UX

The LearnSphere prototype has the strongest learner information architecture.

Keep:
- Dashboard.
- My Learning.
- Learning Paths.
- Progress.
- Calendar.
- Assessments.
- Assignments.
- Certificates.
- Discussions.
- AI Tutor.
- Notifications.

Dashboard hierarchy:

1. Greeting.
2. Continue learning.
3. Today's learning.
4. Active path.
5. Upcoming assessments.
6. Recommendations.

Course player should be distraction-free.

AI Tutor should remain contextual to the current course/lesson.

## 15. Instructor UX

The instructor prototype's strongest choice is the guided creation workflow.

Keep:

```text
Basics
→ Curriculum
→ Content
→ Assessments
→ Pricing
→ Settings
→ Preview
→ Readiness
→ Submit
```

The Curriculum Builder should use a hierarchy:

```text
Course
  Section
    Lesson
    Quiz
    Assignment
```

Use drag-and-drop only when useful, and provide keyboard/context-menu alternatives.

The Readiness screen should convert publishing into a checklist rather than a hidden validation process.

## 16. Admin UX

The admin prototype has the strongest operational structure.

Keep major groups:

```text
Users
Courses
Learning Operations
Commerce
Content
Analytics
Communication
AI
Organizations
System
```

Admin dashboards should be more information-dense than learner screens.

Use:
- filters,
- bulk actions,
- saved reports,
- audit trails,
- drawers for quick edits,
- full-page detail views for complex operations.

## 17. AI UI

AI uses the purple accent.

AI-generated content must be visually distinguishable but not overwhelming.

Show:
- source/context,
- confidence where meaningful,
- generated status,
- edit,
- regenerate,
- accept/insert.

Never make AI-generated content appear automatically authoritative.

## 18. Loading States

Use skeletons for:
- dashboard cards,
- course cards,
- tables,
- charts,
- learner lists.

Use progress indicators for:
- uploads,
- video processing,
- AI generation,
- certificate generation.

## 19. Empty States

Every empty state should answer:

1. What is empty?
2. Why?
3. What should the user do?

Example:

"No courses yet"
"Create your first course to start building your instructor library."
[Create course]

## 20. Error States

Errors must:
- explain the problem,
- preserve user input where possible,
- provide recovery,
- avoid exposing technical details.

## 21. Accessibility

Target WCAG 2.2 AA principles.

Required:
- keyboard navigation,
- visible focus,
- semantic controls,
- sufficient contrast,
- accessible labels,
- error announcements,
- reduced motion support,
- screen-reader-friendly tables/dialogs.

## 22. Responsive Breakpoints

Use a small set:

```text
sm: 640
md: 768
lg: 1024
xl: 1280
2xl: 1536
```

Design/test at:
- 375px
- 768px
- 1024px
- 1440px

The supplied guide explicitly recommends 375px, 768px and 1440px as responsive checkpoints.

## 23. Motion

Use motion to explain state:
- drawer open,
- toast,
- progress,
- save,
- upload.

Avoid decorative motion in learning content.

Respect `prefers-reduced-motion`.

## 24. Prototype-to-Production Decisions

Keep:
- learner bottom navigation on mobile,
- instructor dark sidebar,
- admin grouped navigation,
- course builder stepper,
- course readiness checklist,
- contextual AI Tutor,
- analytics cards and charts,
- clear status badges.

Change:
- emoji-based icons → consistent icon library.
- local component state → server-backed state.
- hard-coded sample data → API/database.
- fake timers → real timestamps.
- simulated AI responses → AI service.
- direct route state → URL-based routing.
- localStorage auth simulation → real authentication.
- prototype-only notifications → persistent notification model.
