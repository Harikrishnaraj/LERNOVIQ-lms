# LERNOVIQ website v2

Static site, no build step. Drop this folder into the repo as `website/` (or `website-v2/`) and serve it from any static host. Open `index.html` (redirects to `Home.dc.html`).

## Contents
- 10 pages: Home, About, Solutions, LMS, Industries, Delivery, Contact, FAQs, Courses, Cart (`*.dc.html`)
- Shared header/footer: `SiteHeader.dc.html`, `SiteFooter.dc.html`
- `support.js`: page runtime (required, keep next to the pages)
- `lv-store.js`: sample catalogue, cart (localStorage), `LMS_URL`, `RAZORPAY_KEY_ID`
- `assets/`, `brand/`: optimised WebP images
- `documentation/`: design system, asset manifest, content map, handoff

## Before going live
1. `lv-store.js`: set `LMS_URL` to the production `PROD_APP_HOST` (currently `https://lms.lernoviq.com`, TO_CONFIRM).
2. Replace sample courses with the live catalogue (search_courses RPC).
3. Build paid checkout in the LMS (order endpoint + Razorpay webhook), then set `RAZORPAY_KEY_ID`.
4. Contact form endpoint, verified contact details, privacy/terms links.

## Push from your desktop
```bash
cd ~/Desktop/Lernoviq            # your local clone
# unzip the download into website-v2/ (or replace website/)
git checkout -b website-v2
git add website-v2
git commit -m "Website v2: 8-page redesign, course catalogue, cart"
git push -u origin website-v2
```
Then open a pull request on GitHub (Harikrishnaraj/modern-lms).
