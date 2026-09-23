---
description: Audit whether a feature (F-xxx) is really done, against its acceptance bar
---
Audit feature "$ARGUMENTS" from docs/FEATURES.md. Do not modify code yet.

1. List every task in docs/TASKS.md that references it and whether each is ticked.
2. Check its "Done when" column and cited TEST_PLAN.md / SECURITY.md sections item by item.
   For each item, point to the code and the test that proves it, or say "MISSING".
3. Confirm: server-side authorization, loading/empty/error/permission states, responsive at
   375/768/1024/1440, no sample data in app code.
4. Verdict: COMPLETE or INCOMPLETE. If incomplete, list the smallest tasks needed. If a ticked task
   is not actually done, say so and propose un-ticking it.
