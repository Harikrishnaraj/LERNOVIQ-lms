# LERNOVIQ website design system

Live reference: Design System.dc.html.

## Brand
- Tagline exactly: “Intelligence. Amplified.” Legal name: LERNOVIQ AI TECHNOLOGIES PRIVATE LIMITED.
- Logo: official primary lockup (brand/lernoviq-logo-primary.png) only, on white. Header 120px wide, footer 140px. No emblem-only use, no retyped wordmark, no logo on navy (reversed artwork does not exist).

## Colour
Navy #0A1F54 (text, headings, dark bands) · Blue #0066FF (primary buttons, links, focus) · Blue dark #0052CC (eyebrows, text on tints, hover) · Cyan #00E5FF / Green #00D951 / Red #FF0000 (logo; tiny decorative squares and status dots only — they fail text contrast) · Blue tint #EBF3FF · Surface alt #F5F8FC · Border #E2E8F0 · Border strong #CBD5E1 · Body #334155 · Muted #475569 · On-navy body #D5DEF2 · On-navy eyebrow #7FD8FF.

## Type
Plus Jakarta Sans (Aptos has no web licence; Arial fallback). Display clamp(34–60px)/800/-0.025em · H2 clamp(28–42px)/800 · H3 19–26/700–800 · Body L 17–18/1.65–1.7 · Body 15–16 · Eyebrow 12/800/.14em uppercase.

## Layout
Container 1240px, 24px padding. Section padding 96px vertical (72–88 for heroes). 8px spacing scale. Grids use auto-fit minmax(min(100%,Npx),1fr) so they collapse to one column at 390px. Alternate white / #F5F8FC sections; navy only for LMS showcase, BFSI band, Vision card and closing CTAs.

## Components
Buttons (radius 10, 48–52px tall): primary blue, secondary outline #CBD5E1, white-on-navy, outline-on-navy. Cards: radius 12–16, 1px border, hover = blue border + soft shadow. Chips: anchor (pill outline) and need tags (#EBF3FF). Status label “Product direction” (#FFF7E6/#8A4B00). Accordion with + / − badge, aria-expanded. Tabs with role=tab, aria-selected. Stepper with aria-pressed and live detail panel. Form fields 48px min, visible labels, inline errors, aria-invalid.

## Accessibility
Focus ring 3px #0066FF with 3px offset. Hit targets ≥44px. Reduced motion disables transitions. Images have descriptive alt; decorative backgrounds and the map use empty alt. Body text contrast ≥ 7:1 on white.
