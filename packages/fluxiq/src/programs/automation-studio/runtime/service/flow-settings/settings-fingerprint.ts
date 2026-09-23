import { createHash } from "node:crypto";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { stableJson } from "../stable-json.ts";

// A stable revision number over the settings an execution grant is bound to,
// so a changed setting invalidates the grant.

export function automationStudioFlowSettingsFingerprint(flow: AutomationStudioFlowArtifact): number {
  const metadata = jsonObjectFromUnknown(flow.metadata) ?? {};
  const digest = createHash("sha256").update(stableJson({
    executionDefaults: flow.executionDefaults ?? {},
    trainingModeSettings: metadata.trainingModeSettings ?? {},
    adaptationPolicyId: metadata.adaptationPolicyId ?? null,
    adaptationPolicySettings: metadata.adaptationPolicySettings ?? {},
    llmProvider: metadata.llmProvider ?? "host",
    llmModel: metadata.llmModel ?? null,
    llmSecretKeyId: metadata.llmSecretKeyId ?? null,
    llmExecutionSettings: metadata.llmExecutionSettings ?? {}
  })).digest("hex");
  return Math.max(1, Number.parseInt(digest.slice(0, 8), 16));
}
