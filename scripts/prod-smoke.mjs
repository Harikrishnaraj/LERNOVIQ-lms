#!/usr/bin/env node
// T-250, T-272 (F-947): read-only production smoke check. Writes nothing: no sign-ups, no enquiries.
// Usage: node scripts/prod-smoke.mjs [siteHost] [appHost] [contentHost]
const [site = "lernoviq.com", app = "lms.lernoviq.com", content = "content.lernoviq.com"] = process.argv.slice(2);

const checks = [
  ["Marketing home", `https://${site}/`, (r) => r.status === 200],
  ["www redirects to apex", `https://www.${site}/`, (r) => r.status === 200 && new URL(r.url).host === site],
  ["Privacy policy", `https://${site}/privacy`, (r) => r.status === 200],
  ["Terms of use", `https://${site}/terms`, (r) => r.status === 200],
  ["Privacy request form", `https://${site}/privacy/request`, (r) => r.status === 200],
  ["LMS login", `https://${app}/login`, (r) => r.status === 200],
  ["Content server answers over HTTPS", `https://${content}/`, (r) => r.status < 500],
];

let failed = 0;
for (const [name, url, ok] of checks) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    const pass = ok(r);
    if (!pass) failed++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${r.status} ${url})`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}  (${e.cause?.code ?? e.message} ${url})`);
  }
}

// The contact form posts cross-origin from the site to the app: check the preflight only.
try {
  const r = await fetch(`https://${app}/api/enquiries`, {
    method: "OPTIONS",
    headers: { Origin: `https://${site}`, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  const allowed = r.headers.get("access-control-allow-origin") === `https://${site}`;
  if (!allowed) failed++;
  console.log(`${allowed ? "PASS" : "FAIL"}  Enquiry API allows the site origin  (${r.status})`);
} catch (e) {
  failed++;
  console.log(`FAIL  Enquiry API preflight  (${e.message})`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
