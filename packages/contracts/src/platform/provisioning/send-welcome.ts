import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `sendWelcome`: re-sends the welcome link (the website's "resend" button),
 * by `userId` or by `email`, exactly one of them.
 */
export const sendWelcomeInputSchema = z.union([
  z.object({ requestId: field.requestId, userId: field.userId, continueUrl: field.continueUrl.optional() }).strict(),
  z.object({ requestId: field.requestId, email: field.email, continueUrl: field.continueUrl.optional() }).strict()
]);

/** Always `accepted`, whether or not the account exists, so the answer reveals nothing. */
export const sendWelcomeResultSchema = z.object({ status: z.literal("accepted") }).strict();

export type SendWelcomeInput = z.infer<typeof sendWelcomeInputSchema>;
export type SendWelcomeResult = z.infer<typeof sendWelcomeResultSchema>;
