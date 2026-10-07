#!/usr/bin/env node
/**
 * Feature coverage check — makes "did we build everything?" a command, not a feeling.
 *
 *   npm run features          integrity check + coverage report (fails only on integrity errors)
 *   npm run features:strict   also fails while any feature is incomplete (use at the end / in CI)
 *   npm run features -- --verbose   list every incomplete feature with its pending tasks
 *
 * Sources of truth:
 *   docs/FEATURES.md       feature registry (F-xxx). Rows under "## Descoped" are exempt.
 *   docs/TASKS.md          tasks (T-xxx) each ending with the features they implement: "— F-101, F-102"
 *                          Ranges like "F-100…F-110" expand to registry IDs in that range.
 *   src/config/navigation.ts  every nav item's `task` must exist in TASKS.md.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const verbose = args.has("--verbose") || strict;

const errors = [];

/* ---------- features ---------- */
const features = new Map(); // id -> { name, section }
let section = "";
let descoped = false;
for (const line of read("docs/FEATURES.md").split(/\r?\n/)) {
  const h = line.match(/^##\s+(.+)/);
  if (h) {
    section = h[1].trim();
    descoped = /^descoped/i.test(section);
    continue;
  }
  const row = line.match(/^\|\s*(F-\d{3})\s*\|\s*([^|]+?)\s*\|/);
  if (!row || descoped) continue;
  if (features.has(row[1])) errors.push(`Duplicate feature ID ${row[1]} in FEATURES.md`);
  features.set(row[1], { name: row[2], section });
}

const num = (id) => Number(id.slice(2));
function expandRefs(text, taskId) {
  const out = new Set();
  const re = /F-(\d{3})\s*(?:…|\.\.\.?)\s*F-(\d{3})|F-(\d{3})/g;
  for (const m of text.matchAll(re)) {
    if (m[3]) {
      const id = `F-${m[3]}`;
      if (!features.has(id)) errors.push(`${taskId} references unknown feature ${id}`);
      out.add(id);
    } else {
      const [lo, hi] = [Number(m[1]), Number(m[2])];
      if (lo > hi) errors.push(`${taskId} has reversed range F-${m[1]}…F-${m[2]}`);
      const hits = [...features.keys()].filter((id) => num(id) >= lo && num(id) <= hi);
      if (hits.length === 0) errors.push(`${taskId} range F-${m[1]}…F-${m[2]} matches no feature`);
      hits.forEach((id) => out.add(id));
    }
  }
  return out;
}

/* ---------- tasks ---------- */
const tasks = new Map(); // id -> { done, title, refs:Set }
for (const line of read("docs/TASKS.md").split(/\r?\n/)) {
  const m = line.match(/^- \[( |x|X|~)\] \*\*(T-\d{3}[a-z]?)\*\*\s*(.*)$/);
  if (!m) continue;
  const [, mark, id, rest] = m;
  if (tasks.has(id)) errors.push(`Duplicate task ID ${id} in TASKS.md`);
  const dash = rest.lastIndexOf(" — ");
  const refsText = dash >= 0 ? rest.slice(dash + 3) : "";
  const refs = expandRefs(refsText, id);
  if (refs.size === 0) errors.push(`${id} does not reference any feature (end the line with "— F-xxx")`);
  tasks.set(id, {
    done: mark.toLowerCase() === "x",
    title: (dash >= 0 ? rest.slice(0, dash) : rest).trim(),
    refs,
  });
}

/* ---------- navigation ---------- */
const nav = read("src/config/navigation.ts");
for (const m of nav.matchAll(/href:\s*"([^"]+)"[^}]*?task:\s*"([^"]+)"/g)) {
  const [, href, task] = m;
  if (!tasks.has(task)) errors.push(`navigation.ts: ${href} points at ${task}, which is not in TASKS.md`);
}

/* ---------- coverage ---------- */
const byFeature = new Map([...features.keys()].map((id) => [id, []]));
for (const [tid, t] of tasks) for (const f of t.refs) byFeature.get(f)?.push(tid);

for (const [fid, tids] of byFeature) {
  if (tids.length === 0) errors.push(`${fid} (${features.get(fid).name}) is not implemented by any task`);
}

const status = [...byFeature].map(([fid, tids]) => {
  const pending = tids.filter((t) => !tasks.get(t).done);
  return { fid, ...features.get(fid), tids, pending, done: tids.length > 0 && pending.length === 0 };
});

const doneTasks = [...tasks.values()].filter((t) => t.done).length;
const doneFeatures = status.filter((s) => s.done).length;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

console.log("\nLERNOVIQ — feature coverage\n");
const sections = [...new Set(status.map((s) => s.section))];
for (const sec of sections) {
  const rows = status.filter((s) => s.section === sec);
  const d = rows.filter((r) => r.done).length;
  const bar = "█".repeat(Math.round((d / rows.length) * 20)).padEnd(20, "░");
  console.log(`  ${bar} ${String(d).padStart(3)}/${String(rows.length).padEnd(3)} ${sec}`);
}
console.log(
  `\n  Features: ${doneFeatures}/${status.length} complete (${pct(doneFeatures, status.length)}%)` +
    `   Tasks: ${doneTasks}/${tasks.size} done (${pct(doneTasks, tasks.size)}%)`,
);

const next = [...tasks].find(([, t]) => !t.done);
if (next) console.log(`  Next task: ${next[0]} ${next[1].title}`);

if (verbose) {
  const open = status.filter((s) => !s.done);
  if (open.length) {
    console.log("\n  Incomplete features:");
    for (const s of open) console.log(`    ${s.fid} ${s.name}  ← pending ${s.pending.join(", ")}`);
  }
}

if (errors.length) {
  console.error(`\n✖ ${errors.length} integrity error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (strict && doneFeatures < status.length) {
  console.error(`\n✖ ${status.length - doneFeatures} feature(s) not complete. The project is not done.`);
  process.exit(1);
}
console.log(strict ? "\n✔ All features complete." : "\n✔ Registry and task plan are consistent.");
