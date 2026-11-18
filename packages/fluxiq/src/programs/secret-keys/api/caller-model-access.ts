import { pairedClientModelAccessState, type ModelAccessState } from "@fluxiq/contracts/platform";
import type { ProgramApiActor } from "../../_shared/api.ts";
import type { SecretKeysService } from "../runtime/service.ts";
import type { SecretKeysSnapshot } from "../types.ts";

/** The host's reading of a caller's model access, from the snapshot read for them. */
export type SecretKeyModelAccessOf = (actor: ProgramApiActor, snapshot: SecretKeysSnapshot) => Promise<ModelAccessState>;
/** The session a caller acts under (a paired client's is its own) and the holder asking, for the readiness a snapshot carries. */
export type SecretKeySessionOf = (actor: ProgramApiActor) => { sessionId: string | null; holderId?: string | undefined };

/**
 * The caller's model access now, read from a snapshot read for them. With
 * `answer`, as the caller is told it: a paired client is never handed a key's
 * id. Without, as the host reads it, key id included, to find the key the
 * caller's calls use.
 */
export async function callerModelAccess(input: { service: SecretKeysService; modelAccessOf: SecretKeyModelAccessOf; keySessionOf?: SecretKeySessionOf | undefined; actor: ProgramApiActor; answer: boolean }): Promise<ModelAccessState> {
  const session = input.keySessionOf ? input.keySessionOf(input.actor) : { sessionId: null };
  const snapshot = await input.service.snapshotFor({ userId: input.actor.userId, ...session });
  const state = await input.modelAccessOf(input.actor, snapshot);
  return input.answer && input.actor.channel === "paired-client" ? pairedClientModelAccessState(state) : state;
}
