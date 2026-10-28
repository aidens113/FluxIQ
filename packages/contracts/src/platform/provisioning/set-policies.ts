import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `setPolicies`: replaces a member's attached policies. Predefined user-level
 * policies only; `FluxIQOwnerFullAccess` only in single tenancy; anything
 * granting `platform:*` is `forbidden_policy`.
 */
export const setPoliciesInputSchema = z.object({ requestId: field.requestId, userId: field.userId, workspaceId: field.workspaceId, policies: field.policies }).strict();

export const setPoliciesResultSchema = z
  .object({ status: z.literal("updated"), userId: field.userId, workspaceId: field.workspaceId, policies: field.policies })
  .strict();

export type SetPoliciesInput = z.infer<typeof setPoliciesInputSchema>;
export type SetPoliciesResult = z.infer<typeof setPoliciesResultSchema>;
