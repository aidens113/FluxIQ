import { readModelAccessState, type ModelAccessState } from "../../platform/index.ts";

/**
 * `server.model_access_changed`, unprompted: whether the pairing person's chats
 * and Flows can reach a model changed (t928): a key added, removed, chosen or
 * replaced, its availability changed, or its last call's outcome changed. It
 * carries the person's whole current `ModelAccessState` in the paired-client
 * form (`pairedClientModelAccessState`: never a key's id), so the client shows
 * it as it is without reading anything again. It is sent only when the state
 * differs from the last one sent to that session, and nothing is replayed
 * after a reconnect: a client reads the state again once its session is ready
 * (`server.session_ready`).
 */
export type ClientGatewayModelAccessChanged = { modelAccess: ModelAccessState };

/**
 * A `server.model_access_changed` payload read from the wire, or null when it
 * is not one. Only `modelAccess` is kept, read by `readModelAccessState`, so a
 * state that contradicts itself is refused rather than shown, and a key id a
 * paired client is never handed is refused too.
 */
export function readClientGatewayModelAccessChanged(payload: unknown): ClientGatewayModelAccessChanged | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const raw = (payload as { modelAccess?: unknown }).modelAccess;
  const modelAccess = readModelAccessState(raw);
  if (!modelAccess || modelAccess.key?.id !== undefined) return null;
  return { modelAccess };
}
