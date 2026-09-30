import { createHash } from "node:crypto";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, automationStudioFlowMaxNodesPerSubflow, type AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { jsonObjectFromUnknown } from "../json-values.ts";
import { stableJson } from "../stable-json.ts";

// A stable revision number over the settings a Flow's execution depends on, so
// a proposal written against one revision is known stale once they change.
//
// The Flow size setting is one of them: it bounds how many nodes a build may
// write into a Subflow (and the edges, depth and bytes derived from it), the
// same kind of limit on what a build or adaptation may produce as the policy
// settings beside it. It is stated only when it differs from the default, so
// every Flow saved before the setting existed -- which reads the default --
// and every new Flow, which stores it, keep the revision they had; a proposal
// already written against one of them stays current.

export function automationStudioFlowSettingsFingerprint(flow: AutomationStudioFlowArtifact): number {
  const metadata = jsonObjectFromUnknown(flow.metadata) ?? {};
  const maxNodesPerSubflow = automationStudioFlowMaxNodesPerSubflow(metadata);
  const digest = createHash("sha256").update(stableJson({
    executionDefaults: flow.executionDefaults ?? {},
    trainingModeSettings: metadata.trainingModeSettings ?? {},
    adaptationPolicyId: metadata.adaptationPolicyId ?? null,
    adaptationPolicySettings: metadata.adaptationPolicySettings ?? {},
    llmProvider: metadata.llmProvider ?? "host",
    llmModel: metadata.llmModel ?? null,
    llmSecretKeyId: metadata.llmSecretKeyId ?? null,
    llmExecutionSettings: metadata.llmExecutionSettings ?? {},
    ...(maxNodesPerSubflow !== AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue ? { maxNodesPerSubflow } : {})
  })).digest("hex");
  return Math.max(1, Number.parseInt(digest.slice(0, 8), 16));
}
