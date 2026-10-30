// Mirrors docs/*.md into the Obsidian vault. The repo stays the source of truth.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const vault = process.env.OBSIDIAN_VAULT ?? "C:/.obsidian";
if (!existsSync(vault)) {
  console.log(`Obsidian vault not found at ${vault}; skipping.`);
  process.exit(0);
}
const dest = join(vault, "Lernoviq");
mkdirSync(dest, { recursive: true });
const files = readdirSync("docs").filter((f) => f.endsWith(".md"));
for (const f of files) cpSync(join("docs", f), join(dest, f));
console.log(`Synced ${files.length} docs to ${dest}`);
