# Production QA checklist (T-250, T-272, TEST_PLAN §23)

Run after each production deploy. First run `npm run smoke:prod` (read-only: hosts over HTTPS, legal pages,
enquiry preflight). Then work through the manual rows below on the live site with the QA accounts
(`Claude outputs/qa-logins.txt`, never committed). Record the date, tester and result.

Status: **prepared, not yet run.** Last smoke run 2026-11-04: hosts, HTTPS and enquiry preflight pass;
`/privacy`, `/terms`, `/privacy/request` return 404 until this branch is deployed.

| Area | What to check | Result | Tester | Date |
| --- | --- | --- | --- | --- |
| Signup | New learner signs up, confirms email, lands on dashboard | | | |
| Login / logout | Each QA role signs in; admin is asked to set up two-factor; logout ends the session | | | |
| Learner flow | Browse catalogue, enrol in a free course, finish a lesson, pass an assessment, get a certificate | | | |
| Instructor flow | Create a course, add a lesson and quiz, submit for review | | | |
| Admin flow | Review and publish that course; open Analytics, run a saved report; open Privacy requests | | | |
| Database writes | The steps above show up after a page refresh | | | |
| Direct URLs | Paste a learner, instructor and admin URL while signed out: login page, then back to the URL | | | |
| Permission boundaries | Learner opens `/admin`: permission-denied page, no data | | | |
| Invalid inputs | Empty and over-long form fields show clear errors, nothing saved | | | |
| Empty states | New learner with no courses sees helpful empty states | | | |
| Mobile / tablet / desktop | 375, 768, 1440 px: no sideways scroll, menus work | | | |
| Slow network | DevTools "Slow 4G": loading states show, nothing breaks | | | |
| Error recovery | Turn the network off mid-action, back on: retry works | | | |
| Certificate verification | Public verify page accepts a real code, rejects a fake one | | | |
| Privacy | `/privacy`, `/terms` load; visitor request form files a request that appears in Admin → Privacy requests; Download my data works | | | |
| Email | Contact form enquiry email arrives at the notify address (T-272) | | | |
| Payment flow | Not applicable until Commerce (Phase 9) ships | n/a | | |
| AI flow | Not applicable until AI (Phase 10) ships | n/a | | |
