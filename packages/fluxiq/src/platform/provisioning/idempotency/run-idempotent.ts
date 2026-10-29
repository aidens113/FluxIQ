import type { PlatformProvisioningResponse } from "@fluxiq/contracts/platform";
import type { PlatformStore } from "../../store/index.ts";
import { provisioningInputDigest } from "./provisioning-input-digest.ts";

/**
 * Runs one mutation at most once per `(operation, requestId)`. The same input
 * (by digest) replays the first successful answer; a different input is
 * `request_conflict`. Only a success is recorded: a refusal changed nothing,
 * so a retry after fixing it (a stronger password, which the digest leaves
 * out) runs again. The caller serialises calls, so a lookup and its write
 * are not interleaved with another mutation in this process.
 */
export async function runIdempotent<TResult>(
  store: PlatformStore,
  operation: string,
  requestId: string,
  input: object,
  nowMs: number,
  execute: () => Promise<PlatformProvisioningResponse<TResult>>
): Promise<PlatformProvisioningResponse<TResult>> {
  const inputDigest = provisioningInputDigest(input);
  const existing = await store.getIdempotency(operation, requestId);
  if (existing !== null) {
    if (existing.inputDigest === inputDigest) return existing.response as PlatformProvisioningResponse<TResult>;
    return { ok: false, error: { code: "request_conflict", message: "This requestId was already used with a different input." } };
  }
  const response = await execute();
  if (response.ok) await store.putIdempotency({ operation, requestId, inputDigest, response, createdAtMs: nowMs });
  return response;
}
