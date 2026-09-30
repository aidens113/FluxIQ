import type { FlowSettingsDraft } from "./flow-settings-model";
import { FLOW_SIZE_SETTING } from "./max-nodes-setting";
import type { SubflowSettingsDraft } from "./subflow-settings-model";

/**
 * The settings a save reported as written that did not come back written.
 *
 * A settings form has two ways to fail and only one of them is loud. A rejected
 * save already reaches the person: the transport returns `ok: false` and the
 * view prints the reason. The quiet one is a save the server accepts and stores
 * differently -- or not at all -- after which the control redraws from the
 * response and snaps back to the value it had before. Nothing is thrown,
 * nothing is logged, and the person is told "Settings saved." while looking at
 * the setting they just changed sitting on its old value. That is what the
 * hardcoded LLM-model read-back did for every Flow, and no amount of care in
 * one field would have caught it, because the failure is in the round trip
 * rather than in any single control.
 *
 * So the round trip is checked at runtime rather than trusted: what the person
 * asked for is compared against what the save says is now stored, and every
 * setting that did not survive is named. A control never silently reverts.
 */
export function flowSettingsNotPersisted(requested: FlowSettingsDraft, persisted: FlowSettingsDraft): string[] {
  return notPersisted(requested, persisted, FLOW_SETTINGS_LABELS);
}

/**
 * The same check for a Subflow's settings.
 *
 * The Subflow save already states every field it owns on every request, so it
 * cannot lose one the way the Flow save did. It can still be told by the server
 * that something else was stored, and it redraws from that response just as
 * confidently, so it is worth the same sentence rather than the same silence.
 */
export function subflowSettingsNotPersisted(requested: SubflowSettingsDraft, persisted: SubflowSettingsDraft): string[] {
  // Route tags are typed as free text and stored as a list, so they come back
  // punctuated differently from the way they were typed. Compare the tags.
  const tags = (draft: SubflowSettingsDraft) => draft.routeTags.split(/[\n,]/).map((tag) => tag.trim()).filter(Boolean).join(",");
  const dropped = notPersisted({ ...requested, routeTags: tags(requested) }, { ...persisted, routeTags: tags(persisted) }, SUBFLOW_SETTINGS_LABELS);
  return dropped;
}

function notPersisted<T extends Record<string, unknown>>(requested: T, persisted: T, labels: Partial<Record<keyof T, string>>): string[] {
  const dropped: string[] = [];
  for (const key of Object.keys(requested) as Array<keyof T>) {
    if (comparableSetting(requested[key]) === comparableSetting(persisted[key])) continue;
    dropped.push(labels[key] ?? String(key));
  }
  return [...new Set(dropped)];
}

/** What each Subflow setting is called in the message. */
const SUBFLOW_SETTINGS_LABELS: Partial<Record<keyof SubflowSettingsDraft, string>> = {
  name: "Name",
  description: "Description",
  role: "Role",
  routeTags: "Route tags",
  localInstructionIds: "Local instructions",
  status: "Status",
  interventionModeOverride: "LLM intervention mode",
  inputMapping: "Input mapping",
  outputMapping: "Output mapping"
};

/**
 * A setting reduced to what it means, so that a difference reported to the
 * person is a difference they made.
 *
 * Whitespace around a typed value and the spacing inside a structured default
 * are normalized on the way to storage, and reporting those as lost settings
 * would train people to ignore the warning -- which is the only thing that
 * would make it useless. A value that parses to different data still differs.
 */
function comparableSetting(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return JSON.stringify(value.map(comparablePort));
  return JSON.stringify(value ?? null);
}

function comparablePort(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const port = value as Record<string, unknown>;
  const defaultValue = typeof port.defaultValue === "string" ? port.defaultValue.trim() : port.defaultValue;
  return {
    ...port,
    ...(typeof port.name === "string" ? { name: port.name.trim() } : {}),
    ...(typeof port.description === "string" ? { description: port.description.trim() } : {}),
    defaultValue: port.valueKind === "json" && typeof defaultValue === "string" && defaultValue ? reformatStructuredValue(defaultValue) : defaultValue
  };
}

function reformatStructuredValue(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

/** What each setting is called in the message, so a warning names the control the person used rather than a field name from the draft. */
const FLOW_SETTINGS_LABELS: Partial<Record<keyof FlowSettingsDraft, string>> = {
  name: "Name",
  description: "Description",
  visibility: "Visibility",
  timeoutSeconds: "Flow timeout",
  maxConcurrency: "Maximum concurrent runs",
  adaptationMode: "LLM intervention mode",
  trainingMode: "Training mode",
  trainForRunCount: "Training runs",
  minimumStabilityScore: "Stability target",
  proposalApprovalMode: "Approval mode",
  requireFirstManualReviewBeforeAutoPromotion: "Review the first adaptation manually",
  adaptationPreset: "Adaptation behavior",
  adaptationProposalMode: "Adaptation approval",
  manualReviewForStructuralChanges: "Manual review for structural changes",
  allowLlmIntervention: "Allow LLM intervention",
  allowRuntimeRecovery: "Allow runtime recovery",
  allowAdaptationCreation: "Allow adaptation creation",
  allowPromotion: "Allow promotion",
  allowCreateRecoveryPaths: "Create recovery paths",
  allowModifySubflows: "Modify subflows",
  allowCreateSubflows: "Create subflows",
  allowModifyRouter: "Modify Flow Map routes",
  allowModifyExpectations: "Modify expectations",
  allowModifyActionTargets: "Modify action targets",
  allowDeleteOrDisableBehavior: "Delete or disable behavior",
  requireApprovalForDestructiveChanges: "Require approval before deleting or disabling behavior",
  maxRetriesPerAction: "Retries per action",
  maxRecoveryAttemptsPerSubflow: "Recovery attempts per subflow",
  maxReroutesPerRun: "Reroutes per run",
  maxNodesPerSubflow: FLOW_SIZE_SETTING.label,
  interfaceInputs: "Flow inputs",
  interfaceOutputs: "Flow outputs",
  dependencyPins: "Dependencies",
  authorizedDomainIds: "Authorized domains",
  maxInterventionsPerRun: "Max interventions per run",
  maxTokensPerRun: "Max tokens per run",
  maxCostUsdPerTrainingWindow: "Max cost per training window",
  maxAdaptationInterventionsPerRun: "Adaptation interventions per run",
  maxAdaptationCostUsdPerRun: "Adaptation cost per run",
  budgetExhaustedBehavior: "When the budget is exhausted",
  llmProvider: "Provider",
  llmModel: "Model",
  llmSecretKeyId: "Encrypted API key",
  llmMaxInputTokens: "Input tokens",
  llmMaxOutputTokens: "Output tokens",
  llmMaxTotalTokens: "Total tokens",
  llmTimeoutSeconds: "LLM timeout",
  llmMaxCostUsd: "LLM max cost",
  llmRetryCount: "Provider retries",
  adaptationPolicyId: "Adaptation policy",
  resultCheckEnabled: "Check that results are right",
  resultCheckShape: "How often results are checked",
  resultCheckInitialRunCount: "Runs checked to begin with",
  resultCheckInterval: "Check interval",
  resultCheckDecay: "Check widening",
  resultCheckMaxInterval: "Longest gap between checks",
  resultCheckRepairOnRefutation: "Repair when a check fails"
};
