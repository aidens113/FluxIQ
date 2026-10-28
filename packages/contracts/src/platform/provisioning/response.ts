import { z } from "zod";
import { platformProvisioningErrorSchema, type PlatformProvisioningError } from "./errors.ts";

/**
 * Every provisioning answer, over HTTP and in-process alike:
 * `{ ok: true, result }` or `{ ok: false, error }`. Over HTTP the status is
 * 200 for `ok: true` and `PLATFORM_PROVISIONING_ERROR_STATUS[error.code]`
 * otherwise.
 */
export type PlatformProvisioningResponse<TResult> = { ok: true; result: TResult } | { ok: false; error: PlatformProvisioningError };

/** The response schema around one operation's result schema. */
export function platformProvisioningResponseSchema<TResult extends z.ZodTypeAny>(result: TResult) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), result }).strict(),
    z.object({ ok: z.literal(false), error: platformProvisioningErrorSchema }).strict()
  ]);
}
