# LERNOVIQ website (landing page)

Static marketing page for www.lernoviq.com / www.lernoviq.in. It is separate from the LMS app in
`src/` and has no build step: open `index.html` in a browser, or upload this folder to any static host.

- Copy: _LERNOVIQ Website Content v1.0_. Visual rules: _LERNOVIQ Brand Guidelines v1.1_.
- `assets/` holds the approved primary logo and secondary mark (L emblem + wordmark), taken from the
  brand guidelines PDF. Replace them with the original SVG/PNG masters when available; never use the
  L emblem on its own.
- White/light backgrounds only (no dark mode): the guidelines allow dark navy only with approved
  reversed artwork, which does not exist yet.

## Before going live

1. **Contact form.** Set `FORM_ENDPOINT` in the script at the bottom of `index.html` to the URL that
   should receive enquiries (JSON `POST`). Until then the form shows a "Preview mode" note after
   submitting and sends nothing.
2. **Contact details.** Add verified business email, phone, address and social links (none are
   invented here).
3. **Legal name.** The footer uses "LERNOVIQ AI TECHNOLOGIES PRIVATE LIMITED" (brand guidelines
   v1.1); confirm incorporation before publishing.
4. **Favicon.** None is set: the logo is below its minimum size at favicon scale and the L emblem may
   not be used alone. `assets/apple-touch-icon.png` (secondary mark on white) is used for home-screen
   icons.
