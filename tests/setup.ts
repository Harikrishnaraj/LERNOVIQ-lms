import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Server Actions call the rate limiter (needs request headers + a live DB);
// default it to "allowed". tests/unit/rate-limit.test.ts unmocks it.
vi.mock("@/services/rate-limit", () => ({
  RATE_LIMITED_MESSAGE: "Too many attempts. Please wait a while and try again.",
  clientIp: vi.fn(async () => "1.2.3.4"),
  rateLimit: vi.fn(async () => true),
}));
