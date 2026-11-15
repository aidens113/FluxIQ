import { z } from "zod";
import { appFields } from "../validation/index.ts";

export const appExecutionTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("customer-owned"), environment: z.enum(["local", "self-hosted"]), targetId: appFields.id }).strict(),
  z.object({ kind: z.literal("managed-cloud"), environment: z.literal("cloud"), targetId: appFields.id }).strict()
]);
export type AppExecutionTarget = z.infer<typeof appExecutionTargetSchema>;
