import { z } from "zod";
import { FRN_SEGMENT_PATTERN, IAM_POLICY_NAME_PATTERN } from "../../iam/index.ts";
import { isConnectContinuePath } from "../connect/index.ts";

/** An account's state. A deleted account keeps a row only while its deletion is scheduled. */
export const PLATFORM_ACCOUNT_STATUSES = Object.freeze(["active", "disabled", "deleted"] as const);

export type PlatformAccountStatus = (typeof PLATFORM_ACCOUNT_STATUSES)[number];

/**
 * The field shapes the provisioning operations share:
 *
 * - `requestId`: the caller's idempotency key, 1 to 128 of letters, digits and
 *   `._:-`. The same id with the same input returns the first result; with a
 *   different input it is `request_conflict`;
 * - `userId`, `workspaceId`: FRN identifier segments;
 * - `email`: trimmed and lower-cased, at most 254 characters;
 * - `displayName`: trimmed, 1 to 100 characters;
 * - `externalId`: the caller's own id for the account, 1 to 128 characters;
 * - `password`: in-process only; strength is the implementation's
 *   (`weak_password`), and it never reaches a log, the audit or an error;
 * - `policies`: 1 to 10 predefined policy names; one outside the provisionable
 *   set is `forbidden_policy`, not a shape error;
 * - `workspace`: `"new"` (a personal workspace, firing `workspace.created`)
 *   or an existing workspace id;
 * - `continueUrl`: honoured only as a same-origin path to `/connect/authorize`;
 * - `reason`: a person's words for the audit, 1 to 500 characters.
 */
export const provisioningFieldSchemas = Object.freeze({
  requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
  userId: z.string().regex(FRN_SEGMENT_PATTERN),
  workspaceId: z.string().regex(FRN_SEGMENT_PATTERN),
  email: z.string().trim().toLowerCase().max(254).email(),
  displayName: z.string().trim().min(1).max(100),
  externalId: z.string().min(1).max(128),
  password: z.string().min(1).max(1024),
  policies: z.array(z.string().regex(IAM_POLICY_NAME_PATTERN)).min(1).max(10),
  workspace: z.union([z.literal("new"), z.string().regex(FRN_SEGMENT_PATTERN)]),
  termsVersion: z.string().min(1).max(64),
  continueUrl: z.string().refine(isConnectContinuePath, "a same-origin path to /connect/authorize"),
  reason: z.string().trim().min(1).max(500),
  epochMs: z.number().int().nonnegative()
});
