import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { FluxIQDataRootHeldError } from "./held-error.ts";
import {
  fluxIQDataRootOwnerFile, fluxIQDataRootOwnerLiveness, ownerFile, ownerHeartbeat,
  type FluxIQDataRootOwner, type FluxIQDataRootOwnerRead
} from "./owner/index.ts";
import { processClaims, type FluxIQDataRootClaim } from "./process-claims.ts";
import { currentProcessIdentity, systemProcessProbe, type ProcessIdentity, type ProcessProbe } from "./process/index.ts";
import { FLUXIQ_DATA_ROOT_LEASE, renewFluxIQDataRootClaim, type FluxIQDataRootLease, type FluxIQDataRootLostHandler } from "./renewal.ts";

export type ClaimFluxIQDataRootOptions = {
  /** Which server is claiming, as a person reads it in a refusal: "the web panel", "fluxiq dev". */
  role: string;
  /** The state directory inside the root; defaults to FLUXIQ_DIR or `.fluxiq`, as FluxIQ.create does. */
  fluxiqDir?: string;
  /** Told when the owner cannot be checked by process id and its heartbeat is being watched, so a command can say why it waits. */
  onWaiting?: (owner: FluxIQDataRootOwner | null, waitMs: number) => void;
  /** Called if another process later takes the root from this one; the default exits the process. */
  onLost?: FluxIQDataRootLostHandler;
  /** Tests only: shorter renewal and stale windows. */
  lease?: FluxIQDataRootLease;
  /** Tests only: claim as another process. Such a claim bypasses this process's shared registry. */
  identity?: ProcessIdentity;
  probe?: ProcessProbe;
};

type Context = { root: string; file: string; self: ProcessIdentity; probe: ProcessProbe; lease: FluxIQDataRootLease; options: ClaimFluxIQDataRootOptions };

// A reclaim holds its guard for a few file operations; another claimant waits this long between looks.
const CONTENDED_PAUSE_MS = 50;
const CONTENDED_ROUNDS = 40;

/**
 * Makes this process the one server of a data root, or throws `FluxIQDataRootHeldError` naming
 * the process that is. The claim is an owner file created atomically beside the root's state
 * directory, which the holder keeps renewing. An existing owner is settled this way:
 * - a process on this machine is checked by its id and start time: refused while it runs,
 *   reclaimed at once when it exited or its id now belongs to a later process;
 * - any other owner (another machine or container, an unreadable start time or file) is watched
 *   for the stale window: refused while it keeps renewing, reclaimed when it stopped. So a
 *   container recreated after a crash takes its root back, and a live holder anywhere still refuses.
 * Call it before the instance opens any storage.
 */
export async function claimFluxIQDataRoot(rootDir: string, options: ClaimFluxIQDataRootOptions): Promise<FluxIQDataRootClaim> {
  const root = path.resolve(rootDir);
  const file = fluxIQDataRootOwnerFile(root, options.fluxiqDir);
  const base = { root, file, probe: options.probe ?? systemProcessProbe, lease: options.lease ?? FLUXIQ_DATA_ROOT_LEASE, options };
  if (options.identity) return await take({ ...base, self: options.identity });
  return await processClaims.share(file, async () => await take({ ...base, self: await currentProcessIdentity() }));
}

async function take(context: Context): Promise<FluxIQDataRootClaim> {
  const { root, file, self, options } = context;
  const owner: FluxIQDataRootOwner = { kind: "fluxiq.data-root-owner", version: 1, token: randomUUID(), role: options.role, claimedAt: new Date().toISOString(), ...self };
  await mkdir(path.dirname(file), { recursive: true });
  for (let round = 0; round < CONTENDED_ROUNDS; round += 1) {
    if (await ownerFile.create(file, owner)) return held(context, owner);
    const current = await ownerFile.read(file);
    if (current.kind === "missing") continue;
    const verdict = await settle(context, current);
    if (verdict.kind === "changed") continue;
    const reclaimed = await reclaim(context, verdict.read, owner);
    if (reclaimed === "taken") return held(context, owner);
    if (reclaimed === "busy") await pause(CONTENDED_PAUSE_MS);
  }
  throw new FluxIQDataRootHeldError(root, file, { kind: "contended" }, options.role);
}

/** Decides an existing owner: throws while it holds the root, or says which record to reclaim. */
async function settle(context: Context, current: FluxIQDataRootOwnerRead): Promise<{ kind: "abandoned"; read: FluxIQDataRootOwnerRead } | { kind: "changed" }> {
  const { root, file, self, probe, lease, options } = context;
  if (current.kind === "known") {
    const liveness = await fluxIQDataRootOwnerLiveness(current.owner, self, probe);
    if (liveness.kind === "live") throw new FluxIQDataRootHeldError(root, file, { kind: "live", owner: current.owner }, options.role);
    if (liveness.kind === "dead") return { kind: "abandoned", read: current };
  }
  options.onWaiting?.(current.kind === "known" ? current.owner : null, lease.staleAfterMs);
  const observed = await ownerHeartbeat.observe(file, lease.staleAfterMs);
  if (observed.kind === "changed") return { kind: "changed" };
  if (observed.kind === "renewing") throw new FluxIQDataRootHeldError(root, file, { kind: "renewing", owner: observed.read.kind === "known" ? observed.read.owner : null }, options.role);
  return { kind: "abandoned", read: observed.read };
}

function held(context: Context, owner: FluxIQDataRootOwner): FluxIQDataRootClaim {
  const stop = renewFluxIQDataRootClaim({
    file: context.file, owner, rootDir: context.root, lease: context.lease,
    ...(context.options.onLost ? { onLost: context.options.onLost } : {}),
    // A claim whose renewal ended holds nothing: this process's next claim on the root must take it afresh, not be handed this one.
    onEnded: () => processClaims.forget(context.file, owner.token)
  });
  return Object.freeze({
    ownerFile: context.file,
    token: owner.token,
    async release() {
      stop();
      await ownerFile.removeIfToken(context.file, owner.token);
    }
  });
}

/**
 * Replaces an abandoned owner's file under a guard, so two claimants that both found it abandoned
 * cannot both take the root. A guard left by a claimant that died mid-reclaim is itself removed,
 * at once when its process is checkably gone, otherwise once it has sat unchanged for the stale
 * window, so a crash at any point never locks the root.
 */
async function reclaim(context: Context, abandoned: FluxIQDataRootOwnerRead, owner: FluxIQDataRootOwner): Promise<"taken" | "lost" | "busy"> {
  const { file, self, probe, lease } = context;
  const guard = `${file}.reclaim`;
  if (!await ownerFile.create(guard, owner)) {
    const other = await ownerFile.read(guard);
    if (other.kind === "missing") return "lost";
    const liveness = other.kind === "known" ? await fluxIQDataRootOwnerLiveness(other.owner, self, probe) : { kind: "unverified" as const };
    if (liveness.kind === "live") return "busy";
    if (liveness.kind !== "dead") {
      const observed = await ownerHeartbeat.observe(guard, lease.staleAfterMs);
      if (observed.kind !== "stale") return "lost";
    }
    await ownerFile.removeIf(guard, (read) => sameRecord(read, other));
    return "lost";
  }
  try {
    if (!await ownerFile.removeIf(file, (read) => sameRecord(read, abandoned))) return "lost";
    return await ownerFile.create(file, owner) ? "taken" : "lost";
  } finally {
    await ownerFile.removeIfToken(guard, owner.token);
  }
}

function sameRecord(read: FluxIQDataRootOwnerRead, expected: FluxIQDataRootOwnerRead): boolean {
  if (expected.kind === "known") return read.kind === "known" && read.owner.token === expected.owner.token;
  return read.kind === expected.kind;
}
