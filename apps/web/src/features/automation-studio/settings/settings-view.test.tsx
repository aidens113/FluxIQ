import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { SettingsView, SubflowSettingsView, SubflowSettingsViewContent, FlowSettingsView, FlowSettingsViewContent, FLOW_LLM_PROVIDERS, SubflowMappingEditor, applyFlowAdaptationPreset, applyFlowTrainingMode, buildFlowSettingsSavePayload, flowAdaptationErrors, flowEffectiveSettings, flowGeneralRuntimeErrors, flowLimitsInterfaceErrors, flowLlmProvider, flowLlmSettingsErrors, flowSettingsDraftFromFlow, readSettingsSection, settingsDraftIsDirty, subflowSettingsDraft, subflowSettingsErrors } from "./index";

describe("Automation Settings workspace", () => {
  it("validates General and Runtime settings and renders user-facing runtime defaults", () => {
    const valid = { name: "Checkout", timeoutSeconds: "30", maxConcurrency: "2", trainingMode: "continuous_adaptive" as const, trainForRunCount: "3", minimumStabilityScore: "0.9" };
    expect(flowGeneralRuntimeErrors(valid)).toEqual([]);
    expect(flowGeneralRuntimeErrors({ ...valid, name: "", timeoutSeconds: "0", maxConcurrency: "1.5", trainingMode: "train_for_runs", trainForRunCount: "0" })).toEqual(expect.arrayContaining(["Flow name is required.", "Runtime timeout must be between 1 second and 1 hour.", "Concurrency must be a whole number from 1 to 100.", "Fixed training mode needs at least one run."]));
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {}, executionDefaults: { timeoutMs: 45000, maxConcurrency: 4 } } }));
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Fixed training runs");
    expect(html).toContain("Until stable");
    expect(html).toContain("No LLM intervention");
    expect(html).toContain("Runtime Defaults");
    expect(html).toContain("Flow timeout");
    expect(html).toContain('value="45"');
    expect(html).toContain('value="4"');
  });
  it("uses controlled LLM provider/model choices and encrypted key summaries", () => {
    expect(FLOW_LLM_PROVIDERS.map((provider) => provider.id)).toContain("deepseek");
    expect(flowLlmProvider("deepseek").models).toContain("deepseek-reasoner");
    const draft = { allowLlmIntervention: true, llmProvider: "deepseek", llmModel: "deepseek-chat", llmSecretKeyId: "" };
    expect(flowLlmSettingsErrors(draft, [], true)).toContain("Choose an enabled encrypted key for this provider.");
    expect(flowLlmSettingsErrors({ ...draft, llmSecretKeyId: "secret.deepseek" }, [{ id: "secret.deepseek" }], true)).toEqual([]);
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: { llmProvider: "deepseek", llmModel: "deepseek-reasoner" } } }));
    expect(html).toContain("LLM Connection");
    expect(html).toContain("DeepSeek");
    expect(html).toContain("deepseek-reasoner");
    expect(html).toContain("Encrypted API key");
    expect(html).toContain("Manage Keys");
    expect(html).toContain("Secret values are never loaded here");
  });
  it("keeps adaptation presets, approval, and training behavior internally consistent", () => {
    const base: any = { trainingMode: "continuous_adaptive", adaptationPreset: "adaptive", adaptationProposalMode: "auto", proposalApprovalMode: "auto", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true, allowCreateRecoveryPaths: true, allowModifySubflows: true, allowCreateSubflows: true, allowModifyRouter: true, allowModifyExpectations: true, allowModifyActionTargets: true, allowDeleteOrDisableBehavior: false, requireApprovalForDestructiveChanges: true };
    expect(applyFlowTrainingMode(base, "normal")).toMatchObject({ trainingMode: "normal", allowLlmIntervention: false, allowAdaptationCreation: false, allowPromotion: false });
    expect(applyFlowAdaptationPreset(base, "locked")).toMatchObject({ adaptationPreset: "locked", allowAdaptationCreation: false, allowPromotion: false, allowModifyRouter: false });
    expect(applyFlowAdaptationPreset(base, "adaptive")).toMatchObject({ adaptationPreset: "adaptive", allowAdaptationCreation: true, allowPromotion: true, allowDeleteOrDisableBehavior: false });
    expect(flowAdaptationErrors({ trainingMode: "normal", allowLlmIntervention: true, allowAdaptationCreation: true, allowPromotion: true, adaptationProposalMode: "manual" })).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain("Adaptation behavior");
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Observe only");
    expect(html).toContain("Manual for risky");
    expect(html).toContain("Manual only");
    expect(html).toContain("validated low-risk changes");
  });
  it("edits bounded recovery limits, friendly Flow interfaces, and dependencies", () => {
    const valid: any = { maxInterventionsPerRun: "2", maxTokensPerRun: "12000", maxCostUsdPerTrainingWindow: "5", maxAdaptationInterventionsPerRun: "3", maxAdaptationCostUsdPerRun: "1", maxRetriesPerAction: "1", maxRecoveryAttemptsPerSubflow: "2", maxReroutesPerRun: "2", interfaceInputs: [{ id: "input.customer", name: "Customer email", valueKind: "string", required: true, description: "", defaultValue: "" }], interfaceOutputs: [{ id: "output.result", name: "Result", valueKind: "json", required: false, description: "", defaultValue: '{"ok":true}' }] };
    expect(flowLimitsInterfaceErrors(valid)).toEqual([]);
    expect(flowLimitsInterfaceErrors({ ...valid, maxRetriesPerAction: "21", interfaceInputs: [...valid.interfaceInputs, { ...valid.interfaceInputs[0] }] })).toEqual(expect.arrayContaining(["Retries per action must be a whole number from 0 to 20.", "Input names must be unique."]));
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", scope: { kind: "global" }, source: { mode: "visual" }, interface: { inputs: [{ id: "input.customer", name: "Customer email", valueType: { kind: "string" }, required: true }], outputs: [{ id: "output.result", name: "Result", valueType: { kind: "json" } }] }, nodes: [{ id: "call.billing", definitionId: "builtin.control.call-flow", parameterValues: { flowId: "flow.billing", version: "2.1.0" } }], metadata: {} } }));
    expect(html).toContain("Flow Inputs");
    expect(html).toContain("Flow Outputs");
    expect(html).toContain("Customer email");
    expect(html).toContain("Add input");
    expect(html).toContain("Dependencies");
    expect(html).toContain("Recovery limits");
    expect(html).toContain("side-effect access are enforced by runtime capability grants");
    expect(html).not.toContain('value="input.customer"');
  });
  it("shows effective sources and removes reset overrides from persistence", () => {
    const flow: any = { flowId: "flow.override", name: "Override", source: { mode: "visual" }, interface: { inputs: [], outputs: [] }, executionDefaults: { timeoutMs: 90000 }, metadata: { llmProvider: "deepseek", llmModel: "deepseek-chat", trainingModeSettings: { recoveryBudget: { maxRetriesPerAction: 4 } } } };
    const draft: any = flowSettingsDraftFromFlow(flow);
    expect(flowEffectiveSettings(flow, draft)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "timeoutSeconds", source: "Flow override", resettable: true }),
      expect.objectContaining({ key: "maxConcurrency", source: "Framework default", resettable: false }),
      expect.objectContaining({ key: "maxRetriesPerAction", value: "4", source: "Flow override" })
    ]));
    const payload = buildFlowSettingsSavePayload(flow, { ...draft, timeoutSeconds: "30", llmProvider: "host", llmModel: "host-default", maxRetriesPerAction: "1" });
    expect(payload.executionDefaults).not.toHaveProperty("timeoutMs");
    expect(payload.metadata).not.toHaveProperty("llmProvider");
    expect(payload.metadata.trainingModeSettings ?? {}).not.toHaveProperty("recoveryBudget");
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow }));
    expect(html).toContain("Framework default");
    expect(html).toContain("Flow override");
    expect(html).toContain("Use Default");
    expect(html).toContain("Show Technical Metadata");
  });
  it("gives Flow Settings anchored navigation and one dirty-aware sticky footer", () => {
    expect(settingsDraftIsDirty({ name: "A" }, { name: "A" })).toBe(false);
    expect(settingsDraftIsDirty({ name: "B" }, { name: "A" })).toBe(true);
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain('aria-label="Flow settings sections"');
    expect(html).toContain('id="flow-settings-general"');
    expect(html).toContain('id="flow-settings-runtime"');
    expect(html).toContain('id="flow-settings-adaptation"');
    expect(html).toContain('id="flow-settings-limits"');
    expect(html).toContain("automation-settings-form-footer");
    expect(html).toContain("Discard Changes");
    expect(html).toContain("All Flow settings saved");
  });
  it("renders dedicated settings for a subflow graph instead of Flow training settings", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, {
      projectId: null,
      flow: {
        flowId: "flow.checkout.subflow.primary.graph",
        name: "Primary Graph",
        metadata: {
          subflowGraph: true,
          parentFlowId: "flow.checkout",
          parentSubflowId: "subflow.primary"
        }
      }
    }));

    expect(html).toContain("Subflow Settings");
    expect(SettingsView.toString()).toContain("SubflowSettingsView");
    expect(html).toContain("routing, mappings, instructions, and approval behavior");
    expect(html).not.toContain("Flow Identity");
    expect(html).not.toContain("Training Mode");
    expect(html).not.toContain("Show Flow Settings JSON");
  });
  it("uses named typed Subflow mappings and validates boundary settings", () => {
    const parentInputs = [{ id: "flow.customer", name: "Customer email", valueType: { kind: "string" } }];
    const subflowInputs = [{ id: "subflow.customer", name: "Customer", valueType: { kind: "string" } }];
    const draft: any = subflowSettingsDraft({ name: "Checkout", status: "active", inputMapping: [{ flowInputId: "flow.customer", subflowInputId: "subflow.customer", required: true }], outputMapping: [], localInstructionIds: ["instruction.checkout"] });
    expect(draft.localInstructionIds).toEqual(["instruction.checkout"]);
    expect(subflowSettingsErrors(draft, parentInputs, [], subflowInputs, [])).toEqual([]);
    expect(subflowSettingsErrors({ ...draft, name: "", inputMapping: [{ flowInputId: "flow.customer", subflowInputId: "missing" }] }, parentInputs, [], subflowInputs, [])).toEqual(expect.arrayContaining(["Subflow name is required.", "Input mappings must choose existing named ports."]));
    const html = renderToStaticMarkup(createElement(SubflowMappingEditor, { title: "Input Mapping", leftLabel: "Flow input", rightLabel: "Subflow input", leftKey: "flowInputId", rightKey: "subflowInputId", leftOptions: parentInputs, rightOptions: subflowInputs, rows: draft.inputMapping, onChange: () => undefined }));
    expect(html).toContain("Customer email (Text)");
    expect(html).toContain("Customer (Text)");
    expect(html).toContain("<select");
    expect(html).not.toContain('<input value="flow.customer"');
    expect(SettingsView.toString()).not.toContain("Local instruction IDs");
  });
  it("restores Settings deep links and uses in-product authorization", () => {
    expect(readSettingsSection("settingsSection=flow-settings-limits", "flow")).toBe("flow-settings-limits");
    expect(readSettingsSection("settingsSection=subflow-settings-outputs", "subflow")).toBe("subflow-settings-outputs");
    expect(readSettingsSection("settingsSection=unknown", "flow")).toBe("flow-settings-general");
    expect(FlowSettingsViewContent.toString()).not.toContain("window.prompt");
    expect(SubflowSettingsViewContent.toString()).not.toContain("window.prompt");
    expect(FlowSettingsViewContent.toString()).toContain("expectedUpdatedAt");
    expect(SubflowSettingsViewContent.toString()).toContain("expectedUpdatedAt");
  });
  it("keeps friendly Flow settings visible while raw metadata remains opt-in", () => {
    const settingsHtml = renderToStaticMarkup(createElement(SettingsView, {
      projectId: "project.debug",
      flow: { flowId: "flow.checkout", metadata: { hiddenSecret: "should-not-render-until-expanded" } }
    }));
    expect(settingsHtml).toContain("automation-flow-settings-workspace");
    expect(settingsHtml).toContain("Save Settings");
    expect(settingsHtml).toContain("Flow Identity");
    expect(settingsHtml).toContain("Training Mode");
    expect(settingsHtml).toContain("<strong>Safety</strong>");
    expect(settingsHtml).toContain("Adaptations");
    expect(settingsHtml).toContain("Adaptation behavior");
    expect(settingsHtml).toContain("Approval");
    expect(settingsHtml).toContain("Fully adaptive");
    expect(settingsHtml).toContain("Require first adaptation to be reviewed manually");
    expect(settingsHtml).toContain("Manual review for structural changes");
    expect(settingsHtml).toContain("Modify Flow Map routes");
    expect(settingsHtml).not.toContain("Allow external side effects");
    expect(settingsHtml).not.toContain("Allow browser/API actions");
    expect(settingsHtml).not.toContain("Require approval before browser/API actions");
    expect(settingsHtml).toContain("LLM Budget");
    expect(settingsHtml).toContain("value=\"host\"");
    expect(settingsHtml).toContain("value=\"policy.default\"");
    expect(settingsHtml).toContain("value=\"12000\"");
    expect(settingsHtml).not.toContain("summary-strip");
    expect(settingsHtml).toContain("Effective Values");
    expect(settingsHtml).not.toContain("Show Flow Settings JSON");
    expect(settingsHtml).not.toContain("should-not-render-until-expanded");
  });
});
