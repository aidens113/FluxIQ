import { z } from "zod";
import { appFields } from "../validation/index.ts";
import { appPinSchema } from "../manifest/index.ts";
import { appGrantListSchema } from "../grants/index.ts";
import { appExecutionTargetSchema, appPayerPolicySchema } from "../bindings/index.ts";

/** Server-owned metadata. None of these fields establish caller authority. */
export const appInstallationSchema = z.object({
  schemaVersion: z.literal(1), installationId: appFields.id, workspaceId: appFields.id,
  app: appPinSchema, approvedGrants: appGrantListSchema, target: appExecutionTargetSchema, payer: appPayerPolicySchema,
  installedByUserId: appFields.id, installedAtMs: appFields.epoch, updatedAtMs: appFields.epoch,
  generation: appFields.generation, revision: appFields.generation,
  status: z.enum(["active", "revoked"]), revokedAtMs: appFields.epoch.optional()
}).strict().superRefine((installation, context) => {
  if (installation.updatedAtMs < installation.installedAtMs || (installation.status === "revoked") !== (installation.revokedAtMs !== undefined) || installation.revokedAtMs !== undefined && (installation.revokedAtMs < installation.installedAtMs || installation.revokedAtMs > installation.updatedAtMs)) context.addIssue({ code: "custom", message: "Installation lifecycle times and state must agree." });
  if (installation.target.kind === "customer-owned" && installation.payer.kind !== "no-managed-compute-charge") context.addIssue({ code: "custom", message: "Customer-owned execution has no managed compute charge." });
  if (installation.target.kind === "managed-cloud" && installation.payer.kind === "no-managed-compute-charge" && installation.approvedGrants.some(grant => grant.capability === "automation.execute")) context.addIssue({ code: "custom", message: "Managed execution requires an explicit account payer policy." });
});
export type AppInstallationV1 = z.infer<typeof appInstallationSchema>;
