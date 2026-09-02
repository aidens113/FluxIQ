import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { SettingsView, SubflowSettingsView, SubflowSettingsViewContent, FlowSettingsView, FlowSettingsViewContent, FLOW_LLM_PROVIDERS, SubflowMappingEditor, applyFlowAdaptationPreset, applyFlowTrainingMode, buildFlowSettingsSavePayload, flowAdaptationErrors, flowEffectiveSettings, flowGeneralRuntimeErrors, flowLimitsInterfaceErrors, flowLlmProvider, flowLlmSettingsErrors, flowSettingsDraftFromFlow, flowSettingsFlowFromDetail, readSettingsSection, settingsConcurrentRevisionAction, settingsDraftIsDirty, subflowSettingsDraft, subflowSettingsErrors } from "./index";

describe("Automation Settings workspace", () => {
  it("validates General and Runtime settings and renders user-facing runtime defaults", () => {
    const valid = { name: "Checkout", timeoutSeconds: "30", maxConcurrency: "2", trainingMode: "continuous_adaptive" as const, trainForRunCount: "3", minimumStabilityScore: "0.9" };
    expect(flowGeneralRuntimeErrors(valid)).toEqual([]);
    expect(flowGeneralRuntimeErrors({ ...valid, name: "", timeoutSeconds: "0", maxConcurrency: "1.5", trainingMode: "train_for_runs", trainForRunCount: "0" })).toEqual(expect.arrayContaining(["Flow name is required.", "Runtime timeout must be between 1 second and 1 hour.", "Concurrency must be a whole number from 1 to 100.", "Fixed training mode needs at least one run."]));
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {}, executionDefaults: { timeoutMs: 45000, maxConcurrency: 4 } } }));
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Manual approval");
    expect(html).toContain("No LLM intervention");
    expect(html).toContain("Runtime Defaults");
    expect(html).toContain("Flow timeout");
    expect(html).toContain('value="45"');
    expect(html).toContain('value="4"');
  });
  it("maps persisted SQL settings details into the editable Flow form", () => {
    const loaded = flowSettingsFlowFromDetail(
      { flowId: "flow.checkout", name: "", metadata: { summaryOnly: true }, source: { mode: "visual" } },
      {
        flowId: "flow.checkout",
        name: "Checkout",
        description: "Complete an order",
        visibility: "domain",
        scopeKind: "domain",
        scopeId: "web",
        settingsRevision: 4,
        updatedAt: 42,
        settings: {
          interventionMode: "manual_approval",
          interventionModeVersion: 1,
          executionDefaults: { timeoutMs: 45000, maxConcurrency: 3 },
          training: { mode: "continuous_adaptive" },
          adaptation: { preset: "adaptive", proposalMode: "manual", policyId: "policy.checkout" },
          llm: { provider: "deepseek", model: "deepseek-chat", secretKeyId: "key.deepseek" },
          revision: 4
        },
        inputs: [{ portId: "input.order", name: "Order", valueType: { kind: "json" }, required: true, defaultValue: null, description: "Order payload" }],
        outputs: [{ portId: "output.result", name: "Result", valueType: { kind: "json" }, required: false, defaultValue: null, description: "" }]
      }
    );
    expect(loaded).toMatchObject({ name: "Checkout", description: "Complete an order", visibility: "public", scope: { kind: "domain", domainId: "web" }, metadata: { summaryOnly: false, settingsRevision: 4 } });
    expect(flowSettingsDraftFromFlow(loaded)).toMatchObject({
      name: "Checkout",
      timeoutSeconds: "45",
      maxConcurrency: "3",
      adaptationMode: "manual_approval",
      llmProvider: "deepseek",
      llmModel: "deepseek-chat",
      llmSecretKeyId: "key.deepseek",
      adaptationPolicyId: "policy.checkout",
      interfaceInputs: [{ id: "input.order", name: "Order" }]
    });
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
    expect(html).toContain("Runtime Mode");
    expect(html).toContain("Fully adaptive");
    expect(html).toContain("Manual approval");
    expect(html).toContain("No LLM intervention");
    expect(html).toContain("Safe validated adaptations are applied automatically");
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
  it("gives Flow Settings persistent section navigation and one dirty-aware footer", () => {
    expect(settingsDraftIsDirty({ name: "A" }, { name: "A" })).toBe(false);
    expect(settingsDraftIsDirty({ name: "B" }, { name: "A" })).toBe(true);
    const html = renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow: { flowId: "flow.checkout", name: "Checkout", metadata: {} } }));
    expect(html).toContain('aria-label="Flow settings sections"');
    expect(html).toContain("automation-settings-section-sidebar");
    expect(html).toContain("automation-settings-content");
    expect(html).toContain("Choose an area to configure");
    expect(html).toContain("Identity and visibility");
    expect(html).toContain("Resolved configuration");
    expect(html).toContain('aria-controls="flow-settings-general"');
    expect(html).toContain('id="flow-settings-general"');
    expect(html).toContain('id="flow-settings-runtime"');
    expect(html).toContain('id="flow-settings-adaptation"');
    expect(html).toContain('id="flow-settings-limits"');
    expect(html).toContain("automation-settings-form-footer");
    expect(html).toContain("Discard Changes");
    expect(html).toContain("All Flow settings saved");
  });
  it("keeps navigation and save controls outside the dedicated settings scroll owner", () => {
    const layoutSource = readFileSync(new URL("./SettingsSectionLayout.tsx", import.meta.url), "utf8");
    const flowSource = readFileSync(new URL("./FlowSettingsView.tsx", import.meta.url), "utf8");
    const subflowSource = readFileSync(new URL("./SubflowSettingsView.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../styles/instructions-settings-adaptations-problems/06-settings.css", import.meta.url), "utf8");

    expect(layoutSource).toContain('className="automation-settings-content"');
    expect(layoutSource).toContain("onScroll={trackSection}");
    expect(layoutSource).toContain("visibleSettingsSection");
    expect(layoutSource).toContain("keepSelectedSectionVisible");
    expect(layoutSource).toContain("navigation.scrollTo({ top, left");
    expect(layoutSource).toContain('behavior: "auto"');
    expect(flowSource).not.toContain("scrollToSettingsSection");
    expect(subflowSource).not.toContain("scrollToSettingsSection");
    expect(flowSource).not.toContain("saving || settingsErrors.length > 0");
    expect(flowSource).toContain("Fix the highlighted settings before saving.");
    expect(css).toMatch(/\.automation-runs-workspace\.automation-flow-settings-workspace \{[^}]*overflow: hidden;/su);
    expect(css).toMatch(/\.automation-settings-content \{[^}]*overflow-y: auto;/su);
    expect(css).toMatch(/\.automation-settings-section-nav \{[^}]*overflow-y: auto;/su);
    expect(css).toMatch(/\.automation-settings-form-footer \{[^}]*min-height: calc\(var\(--control-height-default\) \+ 21px\);/su);
    expect(css).toMatch(/\.automation-settings-form-footer > div \{[^}]*min-height: var\(--control-height-default\);/su);
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
  it("preserves dirty drafts across concurrent Flow and Subflow revisions", () => {
    expect(settingsConcurrentRevisionAction({ currentRevision: 10, incomingRevision: 10, dirty: true })).toBe("ignore");
    expect(settingsConcurrentRevisionAction({ currentRevision: 10, incomingRevision: 11, dirty: false })).toBe("adopt");
    expect(settingsConcurrentRevisionAction({ currentRevision: 10, incomingRevision: 11, dirty: true })).toBe("conflict");
    for (const source of [FlowSettingsViewContent.toString(), SubflowSettingsViewContent.toString()]) {
      expect(source).toContain("Reload Saved");
      expect(source).toContain("Keep My Draft");
      expect(source).toContain("Compare");
      expect(source).toContain("settingsConcurrentRevisionAction");
    }
  });
  it("keeps friendly Flow settings visible while raw metadata remains opt-in", () => {
    const settingsHtml = renderToStaticMarkup(createElement(SettingsView, {
      projectId: null,
      flow: { flowId: "flow.checkout", metadata: { hiddenSecret: "should-not-render-until-expanded" } }
    }));
    expect(settingsHtml).toContain("automation-flow-settings-workspace");
    expect(settingsHtml).toContain("Save Settings");
    expect(settingsHtml).toContain("Flow Identity");
    expect(settingsHtml).toContain("Runtime Mode");
    expect(settingsHtml).toContain("<strong>Safety</strong>");
    expect(settingsHtml).toContain("Adaptations");
    expect(settingsHtml).toContain("LLM intervention mode");
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
