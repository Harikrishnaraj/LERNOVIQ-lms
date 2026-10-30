// Mirrors docs/*.md into the Obsidian vault. The repo stays the source of truth.
// Vault copies get `docs/X.md` / `X.md` references rewritten as [[X]] so the graph view connects.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const vault = process.env.OBSIDIAN_VAULT ?? "C:/.obsidian";
if (!existsSync(vault)) {
  console.log(`Obsidian vault not found at ${vault}; skipping.`);
  process.exit(0);
}
const dest = join(vault, "Lernoviq");
mkdirSync(dest, { recursive: true });
const files = readdirSync("docs").filter((f) => f.endsWith(".md"));
const names = files.map((f) => f.slice(0, -3));
// Markdown links first, then bare references; skip anything already inside [[ ]].
const mdLink = new RegExp(`\\[([^\\]]*)\\]\\((?:\\.{0,2}/)?(?:docs/)?(${names.join("|")})\\.md(#[^)]*)?\\)`, "g");
const bare = new RegExp(`(?<!\\[\\[)\`?(?:docs/)?\\b(${names.join("|")})\\.md\`?`, "g");

for (const f of files) {
  const text = readFileSync(join("docs", f), "utf8")
    .replace(mdLink, (_, label, name) => `[[${name}|${label || name}]]`)
    .replace(bare, (_, name) => `[[${name}]]`);
  writeFileSync(join(dest, f), text);
}
writeFileSync(
  join(dest, "README.md"),
  `# Lernoviq docs (mirror)\n\nRead-only mirror of \`docs/\`; edits here get overwritten. Sync: \`npm run docs:obsidian\`\n\n${names.map((n) => `- [[${n}]]`).join("\n")}\n`,
);
console.log(`Synced ${files.length} docs to ${dest}`);
