import { z } from "zod";
import { jsonTypeSchemaSchema } from "../../fluxnode/type-schema/index.ts";
import { appBackendBindingSchema } from "../bindings/index.ts";
import { appFields } from "../validation/index.ts";
import { appGrantListSchema } from "../grants/index.ts";

export const appOperationSchema = z.object({
  id: appFields.operationId,
  kind: z.enum(["query", "execution"]),
  // The general parser forbids secret formats everywhere; apps use named secret.use bindings.
  inputs: jsonTypeSchemaSchema,
  result: jsonTypeSchemaSchema,
  binding: appBackendBindingSchema,
  requestedGrants: appGrantListSchema
}).strict().superRefine((operation, context) => {
  const query = operation.kind === "query";
  if (query !== (operation.binding.kind === "dataset-query")) context.addIssue({ code: "custom", message: "Operation and backend binding kinds must agree." });
  if (query && (!operation.requestedGrants.length || operation.requestedGrants.some(grant => grant.capability !== "dataset.read"))) context.addIssue({ code: "custom", message: "Queries request existing dataset reads only." });
  if (!query && !operation.requestedGrants.some(grant => grant.capability === "automation.execute" && grant.bindingId === operation.binding.id)) context.addIssue({ code: "custom", message: "Execution requires its declared backend binding capability." });
});
export type AppOperation = z.infer<typeof appOperationSchema>;
