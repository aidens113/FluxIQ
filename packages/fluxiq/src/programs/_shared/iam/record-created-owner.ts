import { programIamIdSegment } from "./id-segment.ts";
import { programOwnedRefId } from "./owned-ref-id.ts";
import type { ProgramOwnedResourceKind, ProgramResourceOwnerResolver, ProgramResourceRef } from "./types.ts";

/**
 * Records `userId` (the caller's raw user id) as the owner of what a `creates`
 * declaration says the call created, through the owner resolver of its kind.
 * Nothing happens for no ref, a kind with no recorded owner (a project's
 * child carries its project's owner; a user owns itself), a missing id, or a
 * kind no program resolves. A resolver that throws fails the call.
 */
export async function recordProgramCreatedOwner(owners: ReadonlyMap<ProgramOwnedResourceKind, ProgramResourceOwnerResolver>, ref: ProgramResourceRef | null, userId: string): Promise<void> {
  const owned = ref === null ? null : programOwnedRefId(ref);
  if (owned === null) return;
  const id = programIamIdSegment(owned.value);
  if (id.raw === null) return;
  await owners.get(owned.kind)?.recordOwner?.(id.raw, userId);
}
