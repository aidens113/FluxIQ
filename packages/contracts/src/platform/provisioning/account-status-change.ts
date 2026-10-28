import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `disableAccount` and `enableAccount` share one input. Disabling refuses
 * sign-in, revokes the account's sessions and connected clients, and sends
 * `server.revoked` (`account_disabled`) to its live sockets. Enabling restores
 * sign-in; revoked clients stay revoked.
 */
export const accountStatusChangeInputSchema = z.object({ requestId: field.requestId, userId: field.userId, reason: field.reason }).strict();

export const disableAccountResultSchema = z.object({ status: z.literal("disabled"), userId: field.userId }).strict();

export const enableAccountResultSchema = z.object({ status: z.literal("enabled"), userId: field.userId }).strict();

export type AccountStatusChangeInput = z.infer<typeof accountStatusChangeInputSchema>;
export type DisableAccountResult = z.infer<typeof disableAccountResultSchema>;
export type EnableAccountResult = z.infer<typeof enableAccountResultSchema>;
