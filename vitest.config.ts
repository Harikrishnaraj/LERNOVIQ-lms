import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    env: loadEnv("", process.cwd(), ""),
    setupFiles: ["tests/setup.ts"],
    // Integration tests talk to a remote Supabase project; 5s is too tight under load.
    testTimeout: 180_000,
    hookTimeout: 200_000,
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.{ts,tsx}"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.{ts,tsx}"],
          // They share one hosted database; running files in parallel causes statement timeouts and
          // dropped connections that fail unrelated tests at random.
          fileParallelism: false,
        },
      },
    ],
  },
});
