# Modern LMS — agent instructions

Before any change, read `docs/RULES.md` and follow it. For non-trivial work also read
`docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/FEATURES.md`, `docs/TASKS.md`,
`docs/MEMORY.md`, `docs/DECISIONS.md`.

## Definition of finished

The project is finished only when `npm run features:strict` passes — every feature in
`docs/FEATURES.md` is implemented by ticked tasks in `docs/TASKS.md`. Nothing else counts
("it compiles", "the page renders", "most of it works" do not).

## Per-task loop (use `/next-task`)

1. `npm run features` → take the **Next task** it prints. Work in `TASKS.md` order.
2. Read the task line, the features it references in `FEATURES.md` (their "Done when" column),
   and the linked `TEST_PLAN.md` / `SECURITY.md` sections.
3. State a plan (files, schema changes, tests). For >3 files, wait for confirmation.
4. Implement — scoped to that task only.
5. Add tests that prove the feature's "Done when" bar. Mark the task `[~]` while in progress.
6. `npm run check` must pass (typecheck → lint → unit → features → build). Run the relevant E2E.
7. Tick `[x]` only if steps 5–6 pass. Update `docs/MEMORY.md`. Commit `feat: … (T-0NN)`.

## Never

- Tick a task whose tests are missing or failing, or whose screen still shows placeholder/sample data.
- Delete or edit away a task or feature ID to make a check pass. Descoping needs a new ADR and the
  user's approval (see FEATURES.md "Descoped").
- Import prototype/sample data into app code (ADR-023). Seed data lives in the dev seed script only.
- Skip loading / empty / error / permission-denied states.

## Blocked?

If a task needs something only the user can provide (Supabase keys, payment/AI provider keys,
a product decision), stop and ask — do not stub it and tick the task. Record the blocker in
`docs/MEMORY.md` under "Known Issues".
