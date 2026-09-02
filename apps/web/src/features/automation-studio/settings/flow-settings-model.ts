export const FLOW_LLM_PROVIDERS = [
  { id: "host", label: "Host default", models: ["host-default"] },
  { id: "openai", label: "OpenAI", models: ["gpt-5", "gpt-5-mini", "gpt-4.1"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-opus-4-1", "claude-sonnet-4"] },
  { id: "google-gemini", label: "Google Gemini", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { id: "azure-openai", label: "Azure OpenAI", models: ["deployment-default"] },
  { id: "groq", label: "Groq", models: ["llama-3.3-70b-versatile"] },
  { id: "mistral", label: "Mistral", models: ["mistral-large-latest", "codestral-latest"] },
  { id: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { id: "openrouter", label: "OpenRouter", models: ["openrouter/auto"] },
  { id: "ollama", label: "Ollama", models: ["llama3.3", "qwen3"] }
] as const;

export function flowLlmProvider(providerId: string) {
  return FLOW_LLM_PROVIDERS.find((provider) => provider.id === providerId) ?? FLOW_LLM_PROVIDERS[0];
}

export function normalizedProviderLabel(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export type FlowPortSettingsDraft = { id: string; name: string; valueKind: "string" | "number" | "boolean" | "json"; required: boolean; description: string; defaultValue: string };

export type FlowSettingsDraft = {
  name: string;
  description: string;
  visibility: "private" | "public";
  timeoutSeconds: string;
  maxConcurrency: string;
  adaptationMode: "fully_adaptive" | "manual_approval" | "no_llm_intervention";
  trainingMode: "normal" | "train_for_runs" | "train_until_stable" | "continuous_adaptive";
  trainForRunCount: string;
  minimumStabilityScore: string;
  proposalApprovalMode: "auto" | "manual" | "mixed";
  requireFirstManualReviewBeforeAutoPromotion: boolean;
  adaptationPreset: "locked" | "observe" | "adaptive" | "autonomous";
  adaptationProposalMode: "auto" | "manual" | "mixed";
  manualReviewForStructuralChanges: boolean;
  allowLlmIntervention: boolean;
  allowRuntimeRecovery: boolean;
  allowAdaptationCreation: boolean;
  allowPromotion: boolean;
  allowCreateRecoveryPaths: boolean;
  allowModifySubflows: boolean;
  allowCreateSubflows: boolean;
  allowModifyRouter: boolean;
  allowModifyExpectations: boolean;
  allowModifyActionTargets: boolean;
  allowDeleteOrDisableBehavior: boolean;
  requireApprovalForDestructiveChanges: boolean;
  maxRetriesPerAction: string;
  maxRecoveryAttemptsPerSubflow: string;
  maxReroutesPerRun: string;
  interfaceInputs: FlowPortSettingsDraft[];
  interfaceOutputs: FlowPortSettingsDraft[];
  dependencyPins: string[];
  authorizedDomainIds: string[];
  maxInterventionsPerRun: string;
  maxTokensPerRun: string;
  maxCostUsdPerTrainingWindow: string;
  maxAdaptationInterventionsPerRun: string;
  maxAdaptationCostUsdPerRun: string;
  budgetExhaustedBehavior: "ask" | "stop";
  llmProvider: string;
  llmModel: string;
  llmSecretKeyId: string;
  adaptationPolicyId: string;
};

export function flowLimitsInterfaceErrors(draft: Pick<FlowSettingsDraft, "maxInterventionsPerRun" | "maxTokensPerRun" | "maxCostUsdPerTrainingWindow" | "maxAdaptationInterventionsPerRun" | "maxAdaptationCostUsdPerRun" | "maxRetriesPerAction" | "maxRecoveryAttemptsPerSubflow" | "maxReroutesPerRun" | "interfaceInputs" | "interfaceOutputs">): string[] {
  const errors: string[] = [];
  const wholeNumberFields: Array<[string, string, number]> = [["LLM interventions per run", draft.maxInterventionsPerRun, 100], ["Adaptation interventions per run", draft.maxAdaptationInterventionsPerRun, 100], ["Retries per action", draft.maxRetriesPerAction, 20], ["Recovery attempts per subflow", draft.maxRecoveryAttemptsPerSubflow, 20], ["Reroutes per run", draft.maxReroutesPerRun, 20]];
  for (const [label, value, maximum] of wholeNumberFields) if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > maximum) errors.push(`${label} must be a whole number from 0 to ${maximum}.`);
  if (!Number.isInteger(Number(draft.maxTokensPerRun)) || Number(draft.maxTokensPerRun) < 128 || Number(draft.maxTokensPerRun) > 1_000_000) errors.push("LLM tokens per run must be a whole number from 128 to 1,000,000.");
  for (const [label, value] of [["Training-window cost", draft.maxCostUsdPerTrainingWindow], ["Adaptation cost per run", draft.maxAdaptationCostUsdPerRun]] as const) if (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100_000) errors.push(`${label} must be from 0 to 100,000 USD.`);
  for (const [kind, ports] of [["Input", draft.interfaceInputs], ["Output", draft.interfaceOutputs]] as const) {
    const names = ports.map((port) => port.name.trim().toLowerCase()).filter(Boolean);
    if (ports.some((port) => !port.name.trim())) errors.push(`${kind} names cannot be empty.`);
    if (new Set(names).size !== names.length) errors.push(`${kind} names must be unique.`);
    for (const port of ports) {
      if (!port.defaultValue.trim() || port.valueKind === "string") continue;
      if (port.valueKind === "number" && !Number.isFinite(Number(port.defaultValue))) errors.push(`${kind} ${port.name || "value"} needs a valid numeric default.`);
      if (port.valueKind === "json") { try { JSON.parse(port.defaultValue); } catch { errors.push(`${kind} ${port.name || "value"} needs a valid structured default.`); } }
    }
  }
  return [...new Set(errors)];
}
type FlowEffectiveSetting = { key: keyof FlowSettingsDraft; group: string; label: string; value: string; source: "Flow override" | "Framework default" | "Flow contract"; resettable: boolean };

export const FLOW_SETTINGS_DEFAULT_VALUES: Partial<FlowSettingsDraft> = {
  timeoutSeconds: "30", maxConcurrency: "1", adaptationMode: "fully_adaptive", trainingMode: "continuous_adaptive", llmProvider: "host", llmModel: "host-default",
  adaptationPreset: "adaptive", adaptationProposalMode: "auto", maxInterventionsPerRun: "2", maxTokensPerRun: "12000",
  maxCostUsdPerTrainingWindow: "5", maxRetriesPerAction: "1", maxRecoveryAttemptsPerSubflow: "2", maxReroutesPerRun: "2"
};


export function flowEffectiveSettings(flow: any, draft: FlowSettingsDraft): FlowEffectiveSetting[] {
  const metadata = flow?.metadata ?? {};
  const describeMode = (value: string) => value === "continuous_adaptive" ? "Fully adaptive" : value === "train_for_runs" ? "Fixed training runs" : value === "train_until_stable" ? "Until stable" : "No LLM intervention";
  const describeApproval = (value: string) => value === "auto" ? "Automatic" : value === "mixed" ? "Manual for risky" : "Manual only";
  const definitions: Array<{ key: keyof FlowSettingsDraft; group: string; label: string; value: string; overridden: boolean }> = [
    { key: "adaptationMode", group: "Runtime", label: "LLM intervention mode", value: draft.adaptationMode === "fully_adaptive" ? "Fully adaptive" : draft.adaptationMode === "manual_approval" ? "Manual approval" : "No LLM intervention", overridden: draft.adaptationMode !== "fully_adaptive" },
    { key: "timeoutSeconds", group: "Runtime", label: "Flow timeout", value: draft.timeoutSeconds + " seconds", overridden: Number(draft.timeoutSeconds) !== 30 },
    { key: "maxConcurrency", group: "Runtime", label: "Maximum concurrent runs", value: draft.maxConcurrency, overridden: Number(draft.maxConcurrency) !== 1 },
    { key: "llmProvider", group: "LLM", label: "Provider", value: flowLlmProvider(draft.llmProvider).label, overridden: draft.llmProvider !== "host" },
    { key: "llmModel", group: "LLM", label: "Model", value: draft.llmModel || "Host default", overridden: draft.llmModel !== "host-default" },
    { key: "adaptationPreset", group: "Adaptation", label: "Behavior", value: draft.adaptationPreset === "adaptive" ? "Fully adaptive" : draft.adaptationPreset === "observe" ? "Observe only" : draft.adaptationPreset === "locked" ? "Locked" : "Broad autonomy", overridden: draft.adaptationPreset !== "adaptive" },
    { key: "adaptationProposalMode", group: "Adaptation", label: "Approval", value: describeApproval(draft.adaptationProposalMode), overridden: draft.adaptationProposalMode !== "auto" },
    { key: "maxInterventionsPerRun", group: "Limits", label: "LLM interventions per run", value: draft.maxInterventionsPerRun, overridden: Number(draft.maxInterventionsPerRun) !== 2 },
    { key: "maxTokensPerRun", group: "Limits", label: "LLM tokens per run", value: draft.maxTokensPerRun, overridden: Number(draft.maxTokensPerRun) !== 12000 },
    { key: "maxRetriesPerAction", group: "Limits", label: "Retries per action", value: draft.maxRetriesPerAction, overridden: Number(draft.maxRetriesPerAction) !== 1 },
    { key: "maxRecoveryAttemptsPerSubflow", group: "Limits", label: "Recovery attempts per subflow", value: draft.maxRecoveryAttemptsPerSubflow, overridden: Number(draft.maxRecoveryAttemptsPerSubflow) !== 2 },
    { key: "maxReroutesPerRun", group: "Limits", label: "Reroutes per run", value: draft.maxReroutesPerRun, overridden: Number(draft.maxReroutesPerRun) !== 2 }
  ];
  return definitions.map((item) => ({ ...item, source: item.overridden ? "Flow override" : "Framework default", resettable: item.overridden && Object.prototype.hasOwnProperty.call(FLOW_SETTINGS_DEFAULT_VALUES, item.key) }));
}
export function applyFlowTrainingMode(draft: FlowSettingsDraft, trainingMode: FlowSettingsDraft["trainingMode"]): FlowSettingsDraft {
  if (trainingMode === "normal") return { ...draft, trainingMode, allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false };
  return { ...draft, trainingMode, allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual" };
}

export function applyFlowAdaptationMode(draft: FlowSettingsDraft, adaptationMode: FlowSettingsDraft["adaptationMode"]): FlowSettingsDraft {
  if (adaptationMode === "no_llm_intervention") return applyFlowAdaptationPreset({ ...draft, adaptationMode, trainingMode: "normal", proposalApprovalMode: "manual", adaptationProposalMode: "manual", allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false }, "locked");
  if (adaptationMode === "manual_approval") return applyFlowAdaptationPreset({ ...draft, adaptationMode, trainingMode: "continuous_adaptive", proposalApprovalMode: "manual", adaptationProposalMode: "manual", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: false }, "adaptive");
  return applyFlowAdaptationPreset({ ...draft, adaptationMode, trainingMode: "continuous_adaptive", proposalApprovalMode: "auto", adaptationProposalMode: "auto", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true }, "adaptive");
}

export function applyFlowAdaptationPreset(draft: FlowSettingsDraft, preset: FlowSettingsDraft["adaptationPreset"]): FlowSettingsDraft {
  if (preset === "locked") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: false, allowPromotion: false, allowCreateRecoveryPaths: false, allowModifySubflows: false, allowCreateSubflows: false, allowModifyRouter: false, allowModifyExpectations: false, allowModifyActionTargets: false, allowDeleteOrDisableBehavior: false };
  if (preset === "observe") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: true, allowPromotion: false, allowCreateRecoveryPaths: false, allowModifySubflows: false, allowCreateSubflows: false, allowModifyRouter: false, allowModifyExpectations: false, allowModifyActionTargets: false, allowDeleteOrDisableBehavior: false };
  if (preset === "autonomous") return { ...draft, adaptationPreset: preset, allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual", allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: true, requireApprovalForDestructiveChanges: true };
  return { ...draft, adaptationPreset: "adaptive", allowAdaptationCreation: true, allowPromotion: draft.adaptationProposalMode !== "manual", allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: false, requireApprovalForDestructiveChanges: true };
}

export function flowAdaptationErrors(draft: Pick<FlowSettingsDraft, "trainingMode" | "allowLlmIntervention" | "allowAdaptationCreation" | "allowPromotion" | "adaptationProposalMode">): string[] {
  const errors: string[] = [];
  if (draft.trainingMode === "normal" && (draft.allowLlmIntervention || draft.allowAdaptationCreation || draft.allowPromotion)) errors.push("No LLM intervention mode cannot create or promote adaptations.");
  if (draft.allowPromotion && !draft.allowAdaptationCreation) errors.push("Automatic promotion requires adaptation creation.");
  if (draft.adaptationProposalMode === "manual" && draft.allowPromotion) errors.push("Manual approval mode cannot auto-apply adaptations.");
  return errors;
}
export function flowGeneralRuntimeErrors(draft: Pick<FlowSettingsDraft, "name" | "timeoutSeconds" | "maxConcurrency" | "trainingMode" | "trainForRunCount" | "minimumStabilityScore">): string[] {
  const errors: string[] = [];
  const timeout = Number(draft.timeoutSeconds);
  const concurrency = Number(draft.maxConcurrency);
  if (!draft.name.trim()) errors.push("Flow name is required.");
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 3600) errors.push("Runtime timeout must be between 1 second and 1 hour.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) errors.push("Concurrency must be a whole number from 1 to 100.");
  if (draft.trainingMode === "train_for_runs" && (!Number.isInteger(Number(draft.trainForRunCount)) || Number(draft.trainForRunCount) < 1)) errors.push("Fixed training mode needs at least one run.");
  if (draft.trainingMode === "train_until_stable" && (!Number.isFinite(Number(draft.minimumStabilityScore)) || Number(draft.minimumStabilityScore) <= 0 || Number(draft.minimumStabilityScore) > 1)) errors.push("Stability target must be greater than 0 and no more than 1.");
  return errors;
}
export function flowLlmSettingsErrors(draft: Pick<FlowSettingsDraft, "allowLlmIntervention" | "llmProvider" | "llmModel" | "llmSecretKeyId">, compatibleKeys: any[], keysReady: boolean): string[] {
  if (!draft.allowLlmIntervention) return [];
  const errors: string[] = [];
  if (!flowLlmProvider(draft.llmProvider)) errors.push("Choose an LLM provider.");
  if (!draft.llmModel.trim()) errors.push("Choose an LLM model.");
  const needsSecret = draft.llmProvider !== "host" && draft.llmProvider !== "ollama";
  if (needsSecret && keysReady && !draft.llmSecretKeyId) errors.push("Choose an enabled encrypted key for this provider.");
  if (draft.llmSecretKeyId && keysReady && !compatibleKeys.some((key) => key.id === draft.llmSecretKeyId)) errors.push("The selected encrypted key is unavailable, disabled, or belongs to another provider.");
  return errors;
}

function flowPortSettingsDraft(port: any): FlowPortSettingsDraft {
  const kind = ["string", "number", "boolean", "json"].includes(port?.valueType?.kind) ? port.valueType.kind : "json";
  return { id: String(port?.id ?? `port.${Date.now().toString(36)}`), name: String(port?.name ?? ""), valueKind: kind, required: port?.required === true, description: String(port?.description ?? ""), defaultValue: port?.defaultValue === undefined ? "" : kind === "string" ? String(port.defaultValue) : JSON.stringify(port.defaultValue) };
}

function flowPortFromSettingsDraft(port: FlowPortSettingsDraft): any {
  let defaultValue: unknown = undefined;
  if (port.defaultValue.trim()) {
    if (port.valueKind === "string") defaultValue = port.defaultValue;
    else if (port.valueKind === "number") defaultValue = Number(port.defaultValue);
    else if (port.valueKind === "boolean") defaultValue = port.defaultValue === "true";
    else { try { defaultValue = JSON.parse(port.defaultValue); } catch { defaultValue = undefined; } }
  }
  return { id: port.id, name: port.name.trim(), valueType: { kind: port.valueKind }, ...(port.description.trim() ? { description: port.description.trim() } : {}), ...(port.required ? { required: true } : {}), ...(defaultValue !== undefined ? { defaultValue } : {}) };
}

export function flowSettingsFlowFromDetail(baseFlow: any, detail: any): any {
  if (!detail?.flowId) return baseFlow;
  const settings = detail.settings && typeof detail.settings === "object" ? detail.settings : {};
  const training = settings.training && typeof settings.training === "object" ? settings.training : {};
  const adaptation = settings.adaptation && typeof settings.adaptation === "object" ? settings.adaptation : {};
  const llm = settings.llm && typeof settings.llm === "object" ? settings.llm : {};
  const metadata = baseFlow?.metadata && typeof baseFlow.metadata === "object" ? baseFlow.metadata : {};
  const port = (value: any) => ({
    id: String(value?.portId ?? value?.id ?? ""),
    name: String(value?.name ?? ""),
    valueType: value?.valueType ?? { kind: "json" },
    ...(value?.required === true ? { required: true } : {}),
    ...(value?.defaultValue !== null && value?.defaultValue !== undefined ? { defaultValue: value.defaultValue } : {}),
    ...(value?.description ? { description: String(value.description) } : {})
  });
  const llmProvider = typeof llm.provider === "string" ? llm.provider : metadata.llmProvider;
  const llmModel = typeof llm.model === "string" ? llm.model : metadata.llmModel;
  const llmSecretKeyId = typeof llm.secretKeyId === "string" ? llm.secretKeyId : metadata.llmSecretKeyId;
  const adaptationPolicyId = typeof adaptation.policyId === "string" ? adaptation.policyId : metadata.adaptationPolicyId;

  return {
    ...(baseFlow ?? {}),
    flowId: detail.flowId,
    name: String(detail.name ?? baseFlow?.name ?? ""),
    description: String(detail.description ?? baseFlow?.description ?? ""),
    visibility: detail.visibility === "private" ? "private" : "public",
    scope: detail.scopeKind === "domain"
      ? { kind: "domain", domainId: detail.scopeId }
      : { kind: "global" },
    source: baseFlow?.source ?? { mode: detail.sourceMode === "code" ? "code" : "visual" },
    interface: {
      inputs: (Array.isArray(detail.inputs) ? detail.inputs : []).map(port),
      outputs: (Array.isArray(detail.outputs) ? detail.outputs : []).map(port)
    },
    executionDefaults: {
      ...(baseFlow?.executionDefaults ?? {}),
      ...(settings.executionDefaults && typeof settings.executionDefaults === "object" ? settings.executionDefaults : {})
    },
    createdAt: detail.createdAt ?? baseFlow?.createdAt,
    updatedAt: detail.updatedAt ?? settings.updatedAt ?? baseFlow?.updatedAt,
    metadata: {
      ...metadata,
      summaryOnly: false,
      settingsRevision: detail.settingsRevision ?? settings.revision,
      ...(settings.interventionMode ? { adaptationModeVersion: 1, adaptationMode: settings.interventionMode } : {}),
      trainingModeSettings: { ...(metadata.trainingModeSettings ?? {}), ...training },
      adaptationPolicySettings: { ...(metadata.adaptationPolicySettings ?? {}), ...adaptation },
      ...(llmProvider ? { llmProvider } : {}),
      ...(llmModel ? { llmModel } : {}),
      ...(llmSecretKeyId ? { llmSecretKeyId } : {}),
      ...(adaptationPolicyId ? { adaptationPolicyId } : {})
    }
  };
}

export function flowSettingsDraftFromFlow(flow: any): FlowSettingsDraft {
  const metadata = flowSettingsMetadata(flow);
  const trainingSettings = metadata.trainingModeSettings && typeof metadata.trainingModeSettings === "object" ? metadata.trainingModeSettings : {};
  const adaptationSettings = metadata.adaptationPolicySettings && typeof metadata.adaptationPolicySettings === "object" ? metadata.adaptationPolicySettings : {};
  const budgets = trainingSettings.budgets && typeof trainingSettings.budgets === "object" ? trainingSettings.budgets : {};
  const trainingMode = flowSettingsTrainingMode(trainingSettings.mode ?? metadata.trainingMode);
  const proposalApprovalMode = flowSettingsProposalMode(trainingSettings.proposalApprovalMode ?? metadata.proposalApprovalMode ?? metadata.proposalMode);
  const adaptationProposalMode = flowSettingsProposalMode(adaptationSettings.proposalMode ?? proposalApprovalMode);
  const adaptationMode = flowSettingsAdaptationMode(metadata, trainingMode, adaptationSettings.preset, adaptationProposalMode);
  return {
    name: String(flow?.name ?? ""),
    description: String(flow?.description ?? ""),
    visibility: flow?.visibility === "public" ? "public" : "private",
    timeoutSeconds: numberInputValue(Number(flow?.executionDefaults?.timeoutMs ?? 30000) / 1000),
    maxConcurrency: numberInputValue(flow?.executionDefaults?.maxConcurrency ?? 1),
    adaptationMode,
    trainingMode,
    trainForRunCount: numberInputValue(trainingSettings.trainForRunCount ?? metadata.trainForRunCount),
    minimumStabilityScore: numberInputValue(trainingSettings.minimumStabilityScore ?? metadata.minimumStabilityScore),
    proposalApprovalMode,
    requireFirstManualReviewBeforeAutoPromotion: booleanSetting(trainingSettings.requireFirstManualReviewBeforeAutoPromotion ?? metadata.requireFirstManualReviewBeforeAutoPromotion, false),
    adaptationPreset: flowSettingsAdaptationPreset(adaptationSettings.preset),
    adaptationProposalMode,
    manualReviewForStructuralChanges: booleanSetting(adaptationSettings.manualReviewForStructuralChanges ?? metadata.manualReviewForStructuralChanges, true),
    allowLlmIntervention: booleanSetting(trainingSettings.allowLlmIntervention, trainingMode !== "normal"),
    allowRuntimeRecovery: booleanSetting(trainingSettings.allowRuntimeRecovery, true),
    allowAdaptationCreation: booleanSetting(trainingSettings.allowAdaptationCreation, trainingMode !== "normal"),
    allowPromotion: booleanSetting(trainingSettings.allowPromotion, trainingMode === "continuous_adaptive"),
    allowCreateRecoveryPaths: booleanSetting(adaptationSettings.allowCreateRecoveryPaths, true),
    allowModifySubflows: booleanSetting(adaptationSettings.allowModifySubflows, true),
    allowCreateSubflows: booleanSetting(adaptationSettings.allowCreateSubflows, true),
    allowModifyRouter: booleanSetting(adaptationSettings.allowModifyRouter, true),
    allowModifyExpectations: booleanSetting(adaptationSettings.allowModifyExpectations, true),
    allowModifyActionTargets: booleanSetting(adaptationSettings.allowModifyActionTargets, true),
    allowDeleteOrDisableBehavior: booleanSetting(adaptationSettings.allowDeleteOrDisableBehavior, false),
    requireApprovalForDestructiveChanges: booleanSetting(adaptationSettings.requireApprovalForDestructiveChanges, true),
    maxRetriesPerAction: numberInputValue(trainingSettings.recoveryBudget?.maxRetriesPerAction ?? 1),
    maxRecoveryAttemptsPerSubflow: numberInputValue(trainingSettings.recoveryBudget?.maxRecoveryAttemptsPerSubflow ?? 2),
    maxReroutesPerRun: numberInputValue(trainingSettings.recoveryBudget?.maxReroutesPerRun ?? 2),
    interfaceInputs: (flow?.interface?.inputs ?? []).map(flowPortSettingsDraft),
    interfaceOutputs: (flow?.interface?.outputs ?? []).map(flowPortSettingsDraft),
    dependencyPins: flow?.source?.mode === "code" ? [...(flow.source.declaredDependencies ?? [])] : [],
    authorizedDomainIds: [...(flow?.executionDefaults?.authorizedDomainIds ?? [])],
    maxInterventionsPerRun: numberInputValue(budgets.maxInterventionsPerRun ?? metadata.maxInterventionsPerRun),
    maxTokensPerRun: numberInputValue(budgets.maxTokensPerRun ?? metadata.maxTokensPerRun),
    maxCostUsdPerTrainingWindow: numberInputValue(budgets.maxCostUsdPerTrainingWindow ?? metadata.maxCostUsdPerTrainingWindow),
    maxAdaptationInterventionsPerRun: numberInputValue(adaptationSettings.maxInterventionsPerRun),
    maxAdaptationCostUsdPerRun: numberInputValue(adaptationSettings.maxEstimatedCostUsdPerRun),
    budgetExhaustedBehavior: budgets.exhaustedBehavior === "stop" || metadata.budgetExhaustedBehavior === "stop" ? "stop" : "ask",
    llmProvider: String(metadata.llmProvider ?? ""),
    llmModel: String(metadata.llmModel ?? flowLlmProvider(String(metadata.llmProvider ?? "host")).models[0]),
    llmSecretKeyId: String(metadata.llmSecretKeyId ?? ""),
    adaptationPolicyId: String(metadata.adaptationPolicyId ?? "")
  };
}

export function buildFlowSettingsSavePayload(flow: any, draft: FlowSettingsDraft) {
  const rawMetadata = flow?.metadata ?? {};
  const {
    trainingMode: _oldTrainingMode, proposalMode: _oldProposalMode, proposalApprovalMode: _oldProposalApprovalMode,
    requireFirstManualReviewBeforeAutoPromotion: _oldFirstReview, manualReviewForStructuralChanges: _oldStructuralReview,
    trainingModeSettings: _oldTrainingSettings, adaptationPolicySettings: _oldAdaptationSettings,
    budgetExhaustedBehavior: _oldBudgetBehavior, llmProvider: _oldLlmProvider, llmModel: _oldLlmModel,
    llmSecretKeyId: _oldLlmSecretKeyId, adaptationPolicyId: _oldAdaptationPolicyId, ...retainedMetadata
  } = rawMetadata;
  const llmProvider = draft.llmProvider.trim();
  const llmModel = draft.llmModel.trim();
  const llmSecretKeyId = draft.llmSecretKeyId.trim();
  const adaptationPolicyId = draft.adaptationPolicyId.trim();
  const recoveryBudget = {
    ...(Number(draft.maxRetriesPerAction) !== 1 ? { maxRetriesPerAction: Math.round(Number(draft.maxRetriesPerAction)) } : {}),
    ...(Number(draft.maxRecoveryAttemptsPerSubflow) !== 2 ? { maxRecoveryAttemptsPerSubflow: Math.round(Number(draft.maxRecoveryAttemptsPerSubflow)) } : {}),
    ...(Number(draft.maxReroutesPerRun) !== 2 ? { maxReroutesPerRun: Math.round(Number(draft.maxReroutesPerRun)) } : {})
  };
  const budgets = {
    ...(Number(draft.maxInterventionsPerRun) !== 2 ? { maxInterventionsPerRun: Number(draft.maxInterventionsPerRun) } : {}),
    ...(Number(draft.maxTokensPerRun) !== 12000 ? { maxTokensPerRun: Number(draft.maxTokensPerRun) } : {}),
    ...(Number(draft.maxCostUsdPerTrainingWindow) !== 5 ? { maxCostUsdPerTrainingWindow: Number(draft.maxCostUsdPerTrainingWindow) } : {}),
    ...(draft.budgetExhaustedBehavior !== "ask" ? { exhaustedBehavior: draft.budgetExhaustedBehavior } : {})
  };
  const trainingModeSettings = {
    ...(draft.trainingMode !== "continuous_adaptive" ? { mode: draft.trainingMode } : {}),
    ...(Number(draft.trainForRunCount) !== 3 ? { trainForRunCount: Number(draft.trainForRunCount) } : {}),
    ...(Number(draft.minimumStabilityScore) !== 0.9 ? { minimumStabilityScore: Number(draft.minimumStabilityScore) } : {}),
    ...(draft.allowLlmIntervention !== true ? { allowLlmIntervention: draft.allowLlmIntervention } : {}),
    ...(draft.allowRuntimeRecovery !== true ? { allowRuntimeRecovery: draft.allowRuntimeRecovery } : {}),
    ...(draft.allowAdaptationCreation !== true ? { allowAdaptationCreation: draft.allowAdaptationCreation } : {}),
    ...(draft.proposalApprovalMode !== "auto" ? { proposalApprovalMode: draft.proposalApprovalMode } : {}),
    ...(draft.allowPromotion !== true ? { allowPromotion: draft.allowPromotion } : {}),
    ...(draft.requireFirstManualReviewBeforeAutoPromotion ? { requireFirstManualReviewBeforeAutoPromotion: true } : {}),
    ...(Object.keys(recoveryBudget).length ? { recoveryBudget } : {}),
    ...(Object.keys(budgets).length ? { budgets } : {})
  };
  const adaptationPolicySettings = {
    ...(draft.adaptationPreset !== "adaptive" ? { preset: draft.adaptationPreset } : {}),
    ...(draft.adaptationProposalMode !== "auto" ? { proposalMode: draft.adaptationProposalMode } : {}),
    ...(draft.manualReviewForStructuralChanges !== true ? { manualReviewForStructuralChanges: draft.manualReviewForStructuralChanges } : {}),
    ...(draft.allowRuntimeRecovery !== true ? { allowRuntimeRecovery: draft.allowRuntimeRecovery } : {}),
    ...(draft.allowCreateRecoveryPaths !== true ? { allowCreateRecoveryPaths: draft.allowCreateRecoveryPaths } : {}),
    ...(draft.allowModifySubflows !== true ? { allowModifySubflows: draft.allowModifySubflows } : {}),
    ...(draft.allowCreateSubflows !== true ? { allowCreateSubflows: draft.allowCreateSubflows } : {}),
    ...(draft.allowModifyRouter !== true ? { allowModifyRouter: draft.allowModifyRouter } : {}),
    ...(draft.allowModifyExpectations !== true ? { allowModifyExpectations: draft.allowModifyExpectations } : {}),
    ...(draft.allowModifyActionTargets !== true ? { allowModifyActionTargets: draft.allowModifyActionTargets } : {}),
    ...(draft.allowDeleteOrDisableBehavior ? { allowDeleteOrDisableBehavior: true } : {}),
    ...(draft.requireApprovalForDestructiveChanges !== true ? { requireApprovalForDestructiveChanges: false } : {}),
    ...(Number(draft.maxAdaptationInterventionsPerRun) !== 3 ? { maxInterventionsPerRun: Number(draft.maxAdaptationInterventionsPerRun) } : {}),
    ...(Number(draft.maxAdaptationCostUsdPerRun) !== 1 ? { maxEstimatedCostUsdPerRun: Number(draft.maxAdaptationCostUsdPerRun) } : {})
  };
  const { timeoutMs: _oldTimeout, maxConcurrency: _oldConcurrency, authorizedDomainIds: _oldDomains, ...retainedExecutionDefaults } = flow.executionDefaults ?? {};
  const authorizedDomainIds = [...new Set(draft.authorizedDomainIds.map((item) => item.trim()).filter(Boolean))];
  return {
    ...flow,
    name: draft.name.trim() || flow.name,
    description: draft.description.trim(),
    visibility: draft.visibility,
    interface: { inputs: draft.interfaceInputs.map(flowPortFromSettingsDraft), outputs: draft.interfaceOutputs.map(flowPortFromSettingsDraft) },
    ...(flow.source?.mode === "code" ? { source: { ...flow.source, declaredDependencies: [...new Set(draft.dependencyPins)] } } : {}),
    executionDefaults: {
      ...retainedExecutionDefaults,
      ...(Number(draft.timeoutSeconds) !== 30 ? { timeoutMs: Math.round(Number(draft.timeoutSeconds) * 1000) } : {}),
      ...(Number(draft.maxConcurrency) !== 1 ? { maxConcurrency: Math.round(Number(draft.maxConcurrency)) } : {}),
      ...(authorizedDomainIds.length ? { authorizedDomainIds } : {})
    },
    metadata: {
      ...retainedMetadata,
      adaptationModeVersion: 1,
      adaptationMode: draft.adaptationMode,
      ...(Object.keys(trainingModeSettings).length ? { trainingModeSettings } : {}),
      ...(Object.keys(adaptationPolicySettings).length ? { adaptationPolicySettings } : {}),
      ...(llmProvider && llmProvider !== "host" ? { llmProvider } : {}),
      ...(llmModel && llmModel !== "host-default" ? { llmModel } : {}),
      ...(llmSecretKeyId ? { llmSecretKeyId } : {}),
      ...(adaptationPolicyId && adaptationPolicyId !== "policy.default" ? { adaptationPolicyId } : {})
    }
  };
}

export function flowSettingsMetadata(flow: any) {
  const existingMetadata = flow?.metadata ?? {};
  const trainingModeSettings = {
    mode: "continuous_adaptive",
    trainForRunCount: 3,
    minimumStabilityScore: 0.9,
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    requireFirstManualReviewBeforeAutoPromotion: false,
    budgets: {
      maxInterventionsPerRun: 2,
      maxTokensPerRun: 12000,
      maxCostUsdPerTrainingWindow: 5,
      exhaustedBehavior: "ask"
    }
  };
  const adaptationPolicySettings = {
    preset: "adaptive",
    proposalMode: "auto",
    manualReviewForStructuralChanges: true,
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1
  };
  const existingAdaptationSettings = existingMetadata.adaptationPolicySettings && typeof existingMetadata.adaptationPolicySettings === "object" ? existingMetadata.adaptationPolicySettings : {};
  const mergedTrainingModeSettings = {
    ...trainingModeSettings,
    ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" ? existingMetadata.trainingModeSettings : {}),
    budgets: {
      ...trainingModeSettings.budgets,
      ...(existingMetadata.trainingModeSettings && typeof existingMetadata.trainingModeSettings === "object" && existingMetadata.trainingModeSettings.budgets && typeof existingMetadata.trainingModeSettings.budgets === "object" ? existingMetadata.trainingModeSettings.budgets : {})
    }
  };
  return {
    trainingMode: trainingModeSettings.mode,
    proposalMode: trainingModeSettings.proposalApprovalMode,
    proposalApprovalMode: trainingModeSettings.proposalApprovalMode,
    llmProvider: "host",
    adaptationPolicyId: "policy.default",
    adaptationPolicySettings: { ...adaptationPolicySettings, ...existingAdaptationSettings },
    budgetExhaustedBehavior: "ask",
    frozenScopeCount: 0,
    ...existingMetadata,
    trainingModeSettings: mergedTrainingModeSettings
  };
}

function flowSettingsTrainingMode(value: unknown): FlowSettingsDraft["trainingMode"] {
  return value === "train_for_runs" || value === "train_until_stable" || value === "continuous_adaptive" ? value : "normal";
}

export function flowSettingsProposalMode(value: unknown): FlowSettingsDraft["proposalApprovalMode"] {
  return value === "manual" || value === "mixed" ? value : "auto";
}

function flowSettingsAdaptationPreset(value: unknown): FlowSettingsDraft["adaptationPreset"] {
  return value === "locked" || value === "observe" || value === "autonomous" ? value : "adaptive";
}

function flowSettingsAdaptationMode(metadata: any, trainingMode: FlowSettingsDraft["trainingMode"], preset: unknown, approval: unknown): FlowSettingsDraft["adaptationMode"] {
  if (metadata?.adaptationModeVersion === 1 && (metadata.adaptationMode === "fully_adaptive" || metadata.adaptationMode === "manual_approval" || metadata.adaptationMode === "no_llm_intervention")) return metadata.adaptationMode;
  if (trainingMode === "normal" || preset === "locked" || approval === "disabled" || approval === "deterministic") return "no_llm_intervention";
  if (approval === "manual" || approval === "mixed" || approval === "manual_approval" || preset === "observe" || preset === "repair") return "manual_approval";
  return "fully_adaptive";
}

function booleanSetting(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function numberInputValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
