---
description: Pick up the next task from docs/TASKS.md and drive it to done
---
Run `npm run features` and take the **Next task** it prints (or the task ID in "$ARGUMENTS" if given).

1. Read CLAUDE.md, docs/RULES.md, the task line in docs/TASKS.md, every feature it references in
   docs/FEATURES.md (use the "Done when" column as acceptance criteria), and the TEST_PLAN.md /
   SECURITY.md sections those features cite. Inspect existing code before creating anything new.
2. Reply with: task ID, acceptance criteria (restated), files you will touch, schema/migration
   changes, tests you will add, anything missing from me. If more than 3 files change, stop and
   wait for my confirmation.
3. After confirmation: mark the task `[~]`, implement only this task, add the tests.
4. Run `npm run check` and the relevant Playwright spec. Fix failures — do not skip tests.
5. Only when everything passes: tick `[x]`, update docs/MEMORY.md, commit `feat: <summary> (<task ID>)`.
6. Report: files changed, what was implemented, commands run + results, remaining issues, and the
   new `npm run features` summary line.
