import { z } from "zod";

/**
 * The typed provisioning errors and the HTTP status the private listener
 * answers each with. The plan's five come first:
 *
 * - `email_taken` (409, in-process only; over HTTP the result is `exists`);
 * - `weak_password` (422); `not_found` (404); `disabled` (409, the account is
 *   disabled); `forbidden_policy` (403, a policy outside the provisionable set,
 *   `FluxIQOwnerFullAccess` outside single tenancy, or one granting `platform:*`).
 *
 * Then the transport's: `invalid_input` (400, the body failed its schema;
 * `issues` says where); `unauthorized` (401, no valid Bearer token);
 * `forbidden` (403, a source outside the allowlist, or the provisioner's IAM
 * decision denied it); `operation_unavailable` (404, an in-process-only
 * operation asked over HTTP, or an unknown one); `request_conflict` (409, a
 * reused `requestId` with a different input); `entitlement_required` (403);
 * `rate_limited` (429).
 *
 * Then three added before the first release: `last_administrator` (409, the
 * operation would disable, delete or demote the last enabled administrator,
 * so identity access refused it and nothing changed); `two_factor` (409,
 * `setPassword` on an account with two-factor sign-in whose credential is
 * sealed, which only a signed-in administrator's reset may replace; nothing
 * changed); `internal_error` (500, an unexpected failure, whose message is
 * generic and says nothing of the failure or the request).
 */
export const PLATFORM_PROVISIONING_ERROR_STATUS = Object.freeze({
  email_taken: 409,
  weak_password: 422,
  not_found: 404,
  disabled: 409,
  forbidden_policy: 403,
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  operation_unavailable: 404,
  request_conflict: 409,
  entitlement_required: 403,
  rate_limited: 429,
  last_administrator: 409,
  two_factor: 409,
  internal_error: 500
} as const);

export type PlatformProvisioningErrorCode = keyof typeof PLATFORM_PROVISIONING_ERROR_STATUS;

const ERROR_CODES = Object.keys(PLATFORM_PROVISIONING_ERROR_STATUS) as [PlatformProvisioningErrorCode, ...PlatformProvisioningErrorCode[]];

/**
 * One provisioning error. `message` is for an operator and never holds a
 * password, token, hash or body; `issues` lists schema refusals by path for
 * `invalid_input` only.
 */
export const platformProvisioningErrorSchema = z
  .object({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1).max(500),
    issues: z.array(z.object({ path: z.string().max(200), message: z.string().max(300) }).strict()).max(50).optional()
  })
  .strict();

export type PlatformProvisioningError = z.infer<typeof platformProvisioningErrorSchema>;
