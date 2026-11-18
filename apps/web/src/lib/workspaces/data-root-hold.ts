import path from "node:path";
import { claimFluxIQDataRoot, type FluxIQDataRootClaim } from "fluxiq/server";

// On globalThis because Next bundles instrumentation and the routes as separate
// module graphs of one process, as it does `__fluxiqWebRuntime`.
type HoldGlobal = typeof globalThis & { __fluxiqWebDataRootHolds?: Map<string, Promise<FluxIQDataRootClaim>> };

/**
 * The web runtime's hold on its data root, through `fluxiq/server`'s serving
 * owner: one claim per root, taken before the runtime opens any storage, kept
 * across reloads (which never change the root), and given back by the
 * runtime's own close once every instance and root-owned store is closed.
 * So the claim and its heartbeat end with the runtime that held them, and the
 * next runtime on that root, in this process or another, finds it free.
 */
export const webDataRootHold = Object.freeze({
  /** Holds `root` for the web panel, or throws `FluxIQDataRootHeldError`; a root already held is shared, never claimed twice. */
  async take(root: string): Promise<void> {
    const holds = registry();
    const key = keyOf(root);
    let hold = holds.get(key);
    if (!hold) {
      const taken = claimFluxIQDataRoot(root, { role: "the web panel" });
      hold = taken;
      holds.set(key, taken);
      // A refused claim holds nothing: forget it so a later start tries again. Its caller receives the refusal.
      taken.catch(() => {
        if (holds.get(key) === taken) holds.delete(key);
      });
    }
    await hold;
  },

  /** Gives `root` back. Call it only once nothing of the runtime has it open; a root not held is a no-op. */
  async release(root: string): Promise<void> {
    const holds = registry();
    const key = keyOf(root);
    const hold = holds.get(key);
    if (!hold) return;
    holds.delete(key);
    let claim: FluxIQDataRootClaim;
    try {
      claim = await hold;
    } catch {
      return; // A refused claim holds nothing to give back; `take` reported the refusal.
    }
    await claim.release();
  }
});

function registry(): Map<string, Promise<FluxIQDataRootClaim>> {
  const scope = globalThis as HoldGlobal;
  return scope.__fluxiqWebDataRootHolds ??= new Map();
}

function keyOf(root: string): string {
  const resolved = path.resolve(root);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
