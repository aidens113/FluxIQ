import { z } from "zod";
import { appFields, parseAppContract } from "../validation/index.ts";
import { appBackendBindingSchema, appExecutionTargetSchema, appPayerPolicySchema } from "../bindings/index.ts";
import { appGrantListSchema } from "../grants/index.ts";

const schema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("operation-resolution"), installationId: appFields.id,
  operationId: appFields.operationId, operationKind: z.enum(["query", "execution"]), manifestDigest: appFields.digest,
  generation: appFields.generation, revision: appFields.generation,
  binding: appBackendBindingSchema, target: appExecutionTargetSchema, payer: appPayerPolicySchema, requiredGrants: appGrantListSchema
}).strict().superRefine((resolution, context) => {
  if ((resolution.operationKind === "query") !== (resolution.binding.kind === "dataset-query")) context.addIssue({ code: "custom", message: "Operation and backend binding kinds must agree." });
  if (resolution.operationKind === "query" && (!resolution.requiredGrants.length || resolution.requiredGrants.some(grant => grant.capability !== "dataset.read"))) context.addIssue({ code: "custom", message: "Query resolution grants existing dataset reads only." });
  if (resolution.operationKind === "execution" && !resolution.requiredGrants.some(grant => grant.capability === "automation.execute" && grant.bindingId === resolution.binding.id)) context.addIssue({ code: "custom", message: "Execution requires its declared backend binding capability." });
  if (resolution.target.kind === "customer-owned" && resolution.payer.kind !== "no-managed-compute-charge" || resolution.operationKind === "execution" && resolution.target.kind === "managed-cloud" && resolution.payer.kind === "no-managed-compute-charge") context.addIssue({ code: "custom", message: "Target and explicit managed compute payer policy must agree." });
});
export type AppOperationResolutionV1 = z.infer<typeof schema>;

/** A resolution is checked metadata, not an accepted receipt, bearer or proof of execution. */
export function parseAppOperationResolution(value: unknown) {
  return parseAppContract(schema, value, "app.invalid_resolution", true);
}
