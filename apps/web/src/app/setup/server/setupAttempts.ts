import path from "node:path";
import { DurableLoginAttemptTracker } from "../../../lib/login-attempts";
import type { SetupAttempts } from "./SetupDeps";

const WINDOW_MS = 10 * 60 * 1000;
// Wrong codes across the whole instance. The code carries at least 128 bits,
// so this is defence in depth, not what keeps it secret.
const GLOBAL_MAX_ATTEMPTS = 10;
// Wrong codes from one client address, which exists only behind a trusted proxy.
const ADDRESS_MAX_ATTEMPTS = 5;

const cache = new Map<string, SetupAttempts>();

/** The setup code's failure counters for an instance, kept under `<fluxiq>/security/` so a restart does not reset them. */
export function setupAttempts(fluxiqDir: string): SetupAttempts {
  const existing = cache.get(fluxiqDir);
  if (existing !== undefined) return existing;
  const security = path.join(fluxiqDir, "security");
  const created: SetupAttempts = {
    global: new DurableLoginAttemptTracker(path.join(security, "setup-attempts.json"), { windowMs: WINDOW_MS, lockoutMs: WINDOW_MS, maxAttempts: GLOBAL_MAX_ATTEMPTS, maxEntries: 10 }),
    address: new DurableLoginAttemptTracker(path.join(security, "setup-address-attempts.json"), { windowMs: WINDOW_MS, lockoutMs: WINDOW_MS, maxAttempts: ADDRESS_MAX_ATTEMPTS, maxEntries: 10_000 })
  };
  cache.set(fluxiqDir, created);
  return created;
}
