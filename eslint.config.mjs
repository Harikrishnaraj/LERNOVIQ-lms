import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // .claude/worktrees holds other agents' checkouts (including their own node_modules/.next and
    // scratch scripts) - never app code, so it must never be linted as part of this tree.
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/worktrees/**"],
  },
];

export default eslintConfig;
