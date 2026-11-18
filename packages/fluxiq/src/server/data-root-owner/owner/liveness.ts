import type { ProcessIdentity, ProcessProbe } from "../process/index.ts";
import type { FluxIQDataRootOwner } from "./record.ts";

/**
 * Whether a recorded owner still holds the root, judged from this process:
 * - `live`: the same process is running on this machine;
 * - `dead`: no process has that id, or the process with it started at another time (the id was
 *   reused, including by this process), so the record can be reclaimed;
 * - `foreign`: another machine (or container) holds it, and no process check here can tell;
 * - `unverified`: the process exists but its start time could not be compared.
 * Only `dead` may be reclaimed at once. `foreign` and `unverified` are settled by the holder's
 * heartbeat (`ownerHeartbeat.observe`): an owner that keeps renewing its file holds the root,
 * one that stopped does not, whatever host wrote it.
 */
export type FluxIQDataRootOwnerLiveness = { kind: "live" } | { kind: "dead" } | { kind: "foreign" } | { kind: "unverified" };

export async function fluxIQDataRootOwnerLiveness(owner: FluxIQDataRootOwner, self: ProcessIdentity, probe: ProcessProbe): Promise<FluxIQDataRootOwnerLiveness> {
  if (!sameMachine(owner, self)) return { kind: "foreign" };
  // This process holds no claim on the file (the process registry would have answered), so a
  // record carrying this process's id was left by an earlier process given the same id.
  if (owner.pid === self.pid) return { kind: "dead" };
  const exists = probe.exists(owner.pid);
  if (exists === false) return { kind: "dead" };
  if (exists === "unknown" || owner.startedAt === null) return { kind: "unverified" };
  const startedAt = await probe.startedAt(owner.pid);
  // Unreadable, perhaps because the process exited between the two looks: look once more.
  if (startedAt.kind === "unreadable") return probe.exists(owner.pid) === false ? { kind: "dead" } : { kind: "unverified" };
  return startedAt.value === owner.startedAt ? { kind: "live" } : { kind: "dead" };
}

function sameMachine(owner: FluxIQDataRootOwner, self: ProcessIdentity): boolean {
  if (owner.platform !== self.platform) return false;
  if (owner.machine !== null && self.machine !== null) return owner.machine === self.machine;
  return owner.hostname.toLowerCase() === self.hostname.toLowerCase();
}
