import { z } from "zod";
import { appFields } from "../validation/index.ts";

/** Installed policy metadata, never proof that this account authorized a debit. */
export const appPayerPolicySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no-managed-compute-charge") }).strict(),
  z.object({ kind: z.literal("workspace"), accountId: appFields.id }).strict(),
  z.object({ kind: z.literal("publisher"), accountId: appFields.id }).strict()
]);
export type AppPayerPolicy = z.infer<typeof appPayerPolicySchema>;
