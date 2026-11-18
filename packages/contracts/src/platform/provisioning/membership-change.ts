import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * One membership, one workspace: `suspendMember`, `resumeMember` and
 * `removeMember` change a person's access to a single workspace and leave
 * the account, its sign-in and its other memberships as they were.
 *
 * - `suspendMember`: an active membership becomes `suspended`; its policies
 *   are detached but kept, and the person's connected clients bound to that
 *   workspace are revoked (`revoked_by_admin`);
 * - `resumeMember`: a suspended membership becomes active again with the
 *   policies it kept; refused for a disabled or deleted account;
 * - `removeMember`: an active or suspended membership of an organisation or
 *   single workspace ends (`removed`), with the same revocations. A personal
 *   workspace's owner leaves by deleting the account (`not_found`).
 *
 * Suspending or removing an organisation workspace's last administrator is
 * `last_administrator`, with nothing changed.
 */
export const membershipChangeInputSchema = z
  .object({ requestId: field.requestId, userId: field.userId, workspaceId: field.workspaceId, reason: field.reason })
  .strict();

export const removeMemberInputSchema = z.object({ requestId: field.requestId, userId: field.userId, workspaceId: field.workspaceId }).strict();

export const suspendMemberResultSchema = z.object({ status: z.literal("suspended"), userId: field.userId, workspaceId: field.workspaceId }).strict();

export const resumeMemberResultSchema = z
  .object({ status: z.literal("resumed"), userId: field.userId, workspaceId: field.workspaceId, policies: field.policies })
  .strict();

export const removeMemberResultSchema = z.object({ status: z.literal("removed"), userId: field.userId, workspaceId: field.workspaceId }).strict();

export type MembershipChangeInput = z.infer<typeof membershipChangeInputSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;
export type SuspendMemberResult = z.infer<typeof suspendMemberResultSchema>;
export type ResumeMemberResult = z.infer<typeof resumeMemberResultSchema>;
export type RemoveMemberResult = z.infer<typeof removeMemberResultSchema>;
