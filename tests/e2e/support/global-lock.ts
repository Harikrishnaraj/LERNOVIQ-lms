import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// A mutex shared by every Playwright worker on this machine (each CI shard is its own machine
// with its own database). Specs that change platform-wide state, such as the single ai_settings
// row, take it for each test so a test that turns the AI Tutor off never runs while another
// test expects it on. mkdir is atomic, so only one worker can hold a lock at a time.

const STALE_MS = 10 * 60_000;
const POLL_MS = 200;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Waits for the named lock and returns a function that releases it. */
export async function acquireLock(name: string, timeoutMs = 10 * 60_000): Promise<() => void> {
  const dir = path.join(tmpdir(), `lernoviq-e2e-lock-${name}`);
  const owner = path.join(dir, "owner.json");
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      mkdirSync(dir);
      writeFileSync(owner, JSON.stringify({ pid: process.pid, at: Date.now() }));
      let released = false;
      return () => {
        if (released) return;
        released = true;
        rmSync(dir, { recursive: true, force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }

    // Take over a lock left behind by a worker that died or hung.
    try {
      const { pid, at } = JSON.parse(readFileSync(owner, "utf8")) as { pid: number; at: number };
      if (!alive(pid) || Date.now() - at > STALE_MS) rmSync(dir, { recursive: true, force: true });
    } catch {
      // The owner file is being written or removed; try again.
    }

    if (Date.now() > deadline) throw new Error(`Timed out waiting for the ${name} lock`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
