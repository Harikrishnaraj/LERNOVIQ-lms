# Implementation handoff

## Files
- 8 pages: Home, About, Solutions, LMS, Industries, Delivery, Contact, FAQs (.dc.html). Shared SiteHeader / SiteFooter components.
- Website Overview.dc.html shows every page at 1440 and 390. Design System.dc.html shows tokens.
- Images under assets/, logos under brand/, docs here.

## Folder mapping vs brief
lernoviq-website/brand → brand/ · assets/images/{home,about,solutions,lms,industries,contact} → assets/images/… (delivery/ and social/ hold TO_GENERATE items) · assets/illustrations → assets/illustrations · design/*.png → export from Website Overview (not pre-rendered) · documentation → documentation/.

## Changes from lernoviq_landing_page_logo_fixed.html
- Split the single page into eight pages; anchors replaced with page links.
- Removed the ROI calculator: its savings figures are not substantiated. If reinstated, label it “Illustrative estimate” and list assumptions.
- Replaced all Unsplash URLs with local files.
- Kept and rebuilt: LMS tabs, FAQ accordion (now categorised), delivery stepper, mobile menu, contact form with validation + confirmation.
- Logo now uses the official master PNG from modern-lms/docs/brand instead of an inline base64 copy.

## Before going live
1. Contact form: set a real endpoint (JSON POST). Until then the confirmation shows “Preview mode”.
2. Add verified email, phone, address, social links; privacy policy and terms URLs.
3. Confirm incorporation status for the legal name in the footer.
4. Confirm LMS demo status before showing the “Walkthrough on request” pill.
5. Convert PNGs to WebP (q80) with 2× variants for heroes; current PNGs are 1–3 MB.
6. Sign off derived copy (page-content-map.md).
7. Generate the TO_GENERATE assets.
8. Review the government industry image: its slide shows a domed civic building, which could read as official affiliation.

## Content validation checklist
- [x] Tagline exact · [x] legal name exact · [x] 6 services · [x] 3 industry groups · [x] 6 delivery stages · [x] 6 approved FAQs
- [x] About separates leadership experience from company history; Wipro/Lenovo/IIBF/Citibank disclaimer kept verbatim
- [x] LMS: all capabilities labelled “Product direction”; screenshots captioned as concepts; no AI tutor, multi-tenancy, HRMS, certificates automation or SCORM conformance claims
- [x] No invented contact details, testimonials, client logos or statistics
- [ ] 10,000 hours / 10+ languages metric: omitted pending substantiation

## Responsive & accessibility QA
- [ ] Header switches to Menu button under 1100px; drawer links ≥48px
- [ ] Hero text readable at 390 over image gradients (Home, Industries)
- [ ] Solutions rows stack image above text; scope list single column
- [ ] LMS tabs wrap; screenshot keeps 16:10
- [ ] Delivery stepper becomes vertical list at 390
- [ ] Contact form fields single column; errors announced (role=alert)
- [ ] Keyboard: tab order, visible focus, Enter/Space on tabs, accordion, stepper
- [ ] prefers-reduced-motion respected

## Course catalogue, cart and LMS integration
- Courses.dc.html: search + Category, Level, Language, Duration, Price, Rating filters and Sort. Option values match modern-lms src/features/catalog/filters.ts, and URL params use the same keys (q, category, level, language, duration, price, rating, sort), so links can move to the LMS /courses page unchanged.
- Cart.dc.html: Myself / My company (seats, company name, optional GSTIN), INR/USD, Razorpay checkout.
- Cart, currency and buyer type are stored in localStorage (lv-store.js); the header shows a live cart count.
- Log in / Sign up go to LMS /login and /signup; course titles link to LMS /courses/[slug].
- TO_CONFIRM: LMS_URL in lv-store.js (the repo sets it via the PROD_APP_HOST variable; there's no hard-coded domain in the repo).
- TO_BUILD in LMS: paid checkout. EnrollmentPanel currently says "Paid enrollment is not available yet". Needed: POST /api/checkout/order (creates a Razorpay order from cart ids + seats + currency, requires login), a Razorpay webhook that enrolls the learner / creates org seats, and a public read endpoint for the catalogue (search_courses RPC) to replace the sample data.
- RAZORPAY_KEY_ID empty = preview mode: the checkout opens a dialog and no payment is attempted.
- Sample course titles, prices and ratings are placeholders and labelled as such on the page.
