import { z } from "zod";
import { PLATFORM_ACCOUNT_STATUSES, provisioningFieldSchemas as field } from "./fields.ts";

/** `getAccount`: by exactly one of `userId`, `email` and `externalId`. A read, so it takes no `requestId`. */
export const getAccountInputSchema = z.union([
  z.object({ userId: field.userId }).strict(),
  z.object({ email: field.email }).strict(),
  z.object({ externalId: field.externalId }).strict()
]);

/**
 * The account as the caller may see it: never a hash, a key, a policy's
 * contents or workspace content. `lastSignInAt` is null before the first
 * sign-in. An unknown account is `not_found`.
 */
export const getAccountResultSchema = z
  .object({
    userId: field.userId,
    email: field.email,
    status: z.enum(PLATFORM_ACCOUNT_STATUSES),
    workspaceIds: z.array(field.workspaceId),
    createdAt: field.epochMs,
    lastSignInAt: field.epochMs.nullable()
  })
  .strict();

export type GetAccountInput = z.infer<typeof getAccountInputSchema>;
export type GetAccountResult = z.infer<typeof getAccountResultSchema>;
