import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseFluxIQDataRootOwner } from "./owner/index.ts";

/** A claim this process holds on one owner file. */
export type FluxIQDataRootClaim = {
  readonly ownerFile: string;
  readonly token: string;
  /** Gives the root up. Idempotent; a process that exits gives it up without calling this. */
  release(): Promise<void>;
};

type Entry = { holders: number; token: string | null; taken: Promise<FluxIQDataRootClaim> };
// On globalThis because Next bundles a separate copy of this module into each graph of one process.
type ClaimsGlobal = typeof globalThis & { __fluxiqDataRootOwnerClaims?: Map<string, Entry>; __fluxiqDataRootOwnerExitHook?: true };

/**
 * One process holds each owner file once, however many callers (or bundled copies of this
 * module) ask for it; the file is given up when the last caller releases it or the process exits.
 */
export const processClaims = Object.freeze({
  async share(file: string, take: () => Promise<FluxIQDataRootClaim>): Promise<FluxIQDataRootClaim> {
    const claims = registry();
    const key = keyOf(file);
    let entry = claims.get(key);
    if (!entry) {
      const taken = take();
      const created: Entry = { holders: 0, token: null, taken };
      taken.then((claim) => {
        created.token = claim.token;
      }, (error: unknown) => {
        // A failed claim is forgotten so a later caller tries again; every waiting caller receives
        // `error` itself through `taken`, so nothing is lost here.
        void error;
        if (claims.get(key) === created) claims.delete(key);
      });
      claims.set(key, created);
      installExitHook();
      entry = created;
    }
    const held = entry;
    held.holders += 1;
    let claim: FluxIQDataRootClaim;
    try {
      claim = await held.taken;
    } catch (error) {
      held.holders -= 1;
      throw error;
    }
    let released = false;
    return Object.freeze({
      ownerFile: claim.ownerFile,
      token: claim.token,
      async release(): Promise<void> {
        if (released) return;
        released = true;
        held.holders -= 1;
        if (held.holders > 0 || claims.get(key) !== held) return;
        claims.delete(key);
        await claim.release();
      }
    });
  }
});

function registry(): Map<string, Entry> {
  const scope = globalThis as ClaimsGlobal;
  return scope.__fluxiqDataRootOwnerClaims ??= new Map();
}

function keyOf(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

// A process that exits gives its roots up here, synchronously; one that is killed leaves its
// file for the next claimant to reclaim after checking the process is gone.
function installExitHook(): void {
  const scope = globalThis as ClaimsGlobal;
  if (scope.__fluxiqDataRootOwnerExitHook) return;
  scope.__fluxiqDataRootOwnerExitHook = true;
  process.once("exit", () => {
    for (const [file, entry] of registry()) {
      if (entry.token !== null) removeSync(file, entry.token);
    }
  });
}

function removeSync(file: string, token: string): void {
  try {
    const current = parseFluxIQDataRootOwner(readFileSync(file, "utf8"));
    if (current.kind === "known" && current.owner.token === token) unlinkSync(file);
  } catch {
    /* best-effort: the process is exiting, and the next claimant reclaims a file left behind once this process is gone */
  }
}
