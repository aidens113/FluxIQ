import { drainState } from "./drain-state";

/** What the drain needs of the gateway transport. */
export type DrainableGateway = {
  beginDrain(options: { retryAfterMs: number; reason: "shutdown" | "restart" }): void;
  openConnectionCount(): number;
};

export type DrainOptions = {
  /** Null when the gateway is off or was never started. */
  gateway: DrainableGateway | null;
  drainSeconds: number;
  /** How often open connections are counted. Defaults to 250 ms. */
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Marks the server draining (so the readiness probe answers 503), tells the
 * gateway to refuse new connections and send clients a retry delay, then waits
 * until no connection is open or `drainSeconds` have passed. Resolves with
 * whether every connection closed in time.
 */
export async function drainGateway(options: DrainOptions): Promise<boolean> {
  drainState.markDraining();
  const gateway = options.gateway;
  if (gateway === null) return true;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pollMs = options.pollMs ?? 250;
  const deadline = now() + options.drainSeconds * 1000;
  gateway.beginDrain({ retryAfterMs: options.drainSeconds * 1000, reason: "shutdown" });
  while (gateway.openConnectionCount() > 0) {
    if (now() >= deadline) return false;
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
  }
  return true;
}
