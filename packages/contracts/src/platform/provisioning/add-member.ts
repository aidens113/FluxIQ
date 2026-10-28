import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `addMember`: adds an account to an organisation workspace with the given
 * policies. Enterprise: refused with `entitlement_required` unless the
 * `iam.organisation` entitlement holds.
 */
export const addMemberInputSchema = z.object({ requestId: field.requestId, userId: field.userId, workspaceId: field.workspaceId, policies: field.policies }).strict();

/** `already_member` when the account was a member; its policies are then left as they were and returned. */
export const addMemberResultSchema = z
  .object({ status: z.enum(["added", "already_member"]), userId: field.userId, workspaceId: field.workspaceId, policies: field.policies })
  .strict();

export type AddMemberInput = z.infer<typeof addMemberInputSchema>;
export type AddMemberResult = z.infer<typeof addMemberResultSchema>;
