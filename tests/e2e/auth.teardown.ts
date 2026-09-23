import { existsSync, readFileSync } from "node:fs";
import { test as teardown } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./support/env";

loadEnvLocal();

const META_FILE = "tests/e2e/.auth/user.meta.json";

teardown("delete the e2e test user", async () => {
  if (!existsSync(META_FILE)) return;
  const { userId } = JSON.parse(readFileSync(META_FILE, "utf8"));

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  await admin.auth.admin.deleteUser(userId);
});
