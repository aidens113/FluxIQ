import { z } from "zod";
import { provisioningFieldSchemas as field } from "./fields.ts";

/**
 * `deleteAccount`: revokes the account's sessions and clients, evicts and
 * deletes its personal workspace, and removes its platform rows. `scheduled`
 * defers the deletion (the account is disabled at once); `immediate` does it
 * now. Backups age the data out within 30 days.
 */
export const deleteAccountInputSchema = z.object({ requestId: field.requestId, userId: field.userId, mode: z.enum(["scheduled", "immediate"]) }).strict();

/**
 * The deletion receipt: `deleted` once done (`completedAt` set), `scheduled`
 * while deferred (`scheduledFor` set). `workspaceIds` are the personal
 * workspaces deleted or to be deleted; organisation workspaces only lose the
 * membership.
 */
export const deleteAccountResultSchema = z
  .object({
    status: z.enum(["scheduled", "deleted"]),
    receipt: z
      .object({
        receiptId: z.string().min(1).max(128),
        userId: field.userId,
        mode: z.enum(["scheduled", "immediate"]),
        requestedAt: field.epochMs,
        scheduledFor: field.epochMs.nullable(),
        completedAt: field.epochMs.nullable(),
        workspaceIds: z.array(field.workspaceId)
      })
      .strict()
  })
  .strict()
  .superRefine((result, context) => {
    const done = result.status === "deleted";
    if (done !== (result.receipt.completedAt !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["receipt", "completedAt"], message: "a deleted receipt has completedAt, a scheduled one does not" });
    if (!done && result.receipt.scheduledFor === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["receipt", "scheduledFor"], message: "a scheduled receipt has scheduledFor" });
  });

export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;
export type DeleteAccountResult = z.infer<typeof deleteAccountResultSchema>;
