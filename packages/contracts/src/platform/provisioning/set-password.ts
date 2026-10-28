import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/** `setPassword`, in-process only: hashed at once; the account's other sessions are revoked. */
export const setPasswordInputSchema = z.object({ requestId: field.requestId, userId: field.userId, password: field.password }).strict();

export const setPasswordResultSchema = z.object({ status: z.literal("updated"), sessionsRevoked: z.number().int().nonnegative() }).strict();

export type SetPasswordInput = z.infer<typeof setPasswordInputSchema>;
export type SetPasswordResult = z.infer<typeof setPasswordResultSchema>;
