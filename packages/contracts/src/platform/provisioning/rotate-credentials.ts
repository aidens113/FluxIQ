import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `rotateCredentials`: revokes by scope. `sessions` revokes panel sessions;
 * `browsers` revokes connected clients (`server.revoked`,
 * `credentials_rotated`); `password` sends a reset link; `all` does all three.
 */
export const rotateCredentialsInputSchema = z
  .object({ requestId: field.requestId, userId: field.userId, scope: z.enum(["sessions", "browsers", "password", "all"]) })
  .strict();

export const rotateCredentialsResultSchema = z
  .object({
    status: z.literal("rotated"),
    userId: field.userId,
    sessionsRevoked: z.number().int().nonnegative(),
    connectedClientsRevoked: z.number().int().nonnegative(),
    resetSent: z.boolean()
  })
  .strict();

export type RotateCredentialsInput = z.infer<typeof rotateCredentialsInputSchema>;
export type RotateCredentialsResult = z.infer<typeof rotateCredentialsResultSchema>;
