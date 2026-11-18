import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { FluxIQDataRootHeldError } from "./held-error.ts";
import { fluxIQDataRootOwnerFile, fluxIQDataRootOwnerLiveness, ownerFile, type FluxIQDataRootOwner } from "./owner/index.ts";
import { processClaims, type FluxIQDataRootClaim } from "./process-claims.ts";
import { currentProcessIdentity, systemProcessProbe, type ProcessIdentity, type ProcessProbe } from "./process/index.ts";

export type ClaimFluxIQDataRootOptions = {
  /** Which server is claiming, as a person reads it in a refusal: "the web panel", "fluxiq dev". */
  role: string;
  /** The state directory inside the root; defaults to FLUXIQ_DIR or `.fluxiq`, as FluxIQ.create does. */
  fluxiqDir?: string;
  /** Tests only: claim as another process. Such a claim bypasses this process's shared registry. */
  identity?: ProcessIdentity;
  probe?: ProcessProbe;
};

// A reclaim holds its guard for a few file operations; another claimant waits this long between looks.
const CONTENDED_PAUSE_MS = 50;
const CONTENDED_ROUNDS = 40;

/**
 * Makes this process the one server of a data root, or throws `FluxIQDataRootHeldError` naming
 * the process that is. The claim is an owner file created atomically beside the root's state
 * directory. A file left by a process that has since exited (or whose id now belongs to a
 * process that started later) is reclaimed; a live, foreign or uncheckable owner is never
 * overridden. Call it before the instance opens any storage.
 */
export async function claimFluxIQDataRoot(rootDir: string, options: ClaimFluxIQDataRootOptions): Promise<FluxIQDataRootClaim> {
  const root = path.resolve(rootDir);
  const file = fluxIQDataRootOwnerFile(root, options.fluxiqDir);
  const probe = options.probe ?? systemProcessProbe;
  if (options.identity) return await take(root, file, options.role, options.identity, probe);
  return await processClaims.share(file, async () => await take(root, file, options.role, await currentProcessIdentity(), probe));
}

async function take(root: string, file: string, role: string, self: ProcessIdentity, probe: ProcessProbe): Promise<FluxIQDataRootClaim> {
  const owner: FluxIQDataRootOwner = { kind: "fluxiq.data-root-owner", version: 1, token: randomUUID(), role, claimedAt: new Date().toISOString(), ...self };
  const claimed: FluxIQDataRootClaim = Object.freeze({
    ownerFile: file,
    token: owner.token,
    async release() {
      await ownerFile.removeIfToken(file, owner.token);
    }
  });
  await mkdir(path.dirname(file), { recursive: true });
  for (let round = 0; round < CONTENDED_ROUNDS; round += 1) {
    if (await ownerFile.create(file, owner)) return claimed;
    const current = await ownerFile.read(file);
    if (current.kind === "missing") continue;
    if (current.kind === "unreadable") throw new FluxIQDataRootHeldError(root, file, { kind: "unreadable" }, role);
    const liveness = await fluxIQDataRootOwnerLiveness(current.owner, self, probe);
    if (liveness.kind !== "dead") throw new FluxIQDataRootHeldError(root, file, { kind: liveness.kind, owner: current.owner }, role);
    const reclaimed = await reclaim(root, file, current.owner, owner, self, probe);
    if (reclaimed === "taken") return claimed;
    if (reclaimed === "busy") await pause(CONTENDED_PAUSE_MS);
  }
  throw new FluxIQDataRootHeldError(root, file, { kind: "contended" }, role);
}

/**
 * Replaces a dead owner's file under a guard, so two claimants that both found it dead cannot
 * both take the root. A guard left by a claimant that died mid-reclaim is itself reclaimed
 * by the same check, so a crash at any point never locks the root.
 */
async function reclaim(root: string, file: string, dead: FluxIQDataRootOwner, owner: FluxIQDataRootOwner, self: ProcessIdentity, probe: ProcessProbe): Promise<"taken" | "lost" | "busy"> {
  const guard = `${file}.reclaim`;
  if (!await ownerFile.create(guard, owner)) {
    const other = await ownerFile.read(guard);
    if (other.kind === "unreadable") throw new FluxIQDataRootHeldError(root, guard, { kind: "unreadable" }, owner.role);
    if (other.kind === "known" && (await fluxIQDataRootOwnerLiveness(other.owner, self, probe)).kind === "dead") {
      await ownerFile.removeIfToken(guard, other.owner.token);
      return "lost";
    }
    return "busy";
  }
  try {
    if (!await ownerFile.removeIfToken(file, dead.token)) return "lost";
    return await ownerFile.create(file, owner) ? "taken" : "lost";
  } finally {
    await ownerFile.removeIfToken(guard, owner.token);
  }
}
