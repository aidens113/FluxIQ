// Every Flow setting must survive being changed, saved and read back.
//
// The defect this file exists to stop is not a crash and not a rejected save.
// It is a save the server accepts while the control snaps back to the value it
// had before, under the words "Settings saved." The LLM model did exactly that
// for every Flow: `buildFlowSettingsSavePayload` wrote the chosen id and
// `flowSettingsDraftFromFlow` read the framework default back over it, so
// choosing the non-default model appeared simply not to work. Nothing failed,
// so nothing was reported, and only a round trip catches it.
//
// So the round trip is asserted for every setting at once rather than for the
// field that happened to break. `SETTINGS_ROUND_TRIP_VALUES` must name a value
// for every key of the draft -- a test below fails if it does not -- which
// means a setting added later cannot ship without one.

import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { FlowSettingsViewContent, buildFlowSettingsSavePayload, flowLimitsInterfaceErrors, flowSettingsDraftFromFlow, flowSettingsNotPersisted, subflowSettingsDraft, subflowSettingsNotPersisted, type FlowSettingsDraft } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flowOf = (metadata: Record<string, unknown> = {}): any => ({
  flowId: "flow.one",
  name: "Flow",
  updatedAt: 7,
  source: { mode: "visual" },
  executionDefaults: {},
  interface: { inputs: [], outputs: [] },
  metadata
});

/** A value for every setting that differs from the framework default, so that a setting silently reset to its default is a failure rather than a coincidence. */
const SETTINGS_ROUND_TRIP_VALUES: FlowSettingsDraft = {
  name: "Renamed Flow",
  description: "What this Flow does",
  visibility: "public",
  timeoutSeconds: "45",
  maxConcurrency: "4",
  adaptationMode: "manual_approval",
  trainingMode: "train_for_runs",
  trainForRunCount: "7",
  minimumStabilityScore: "0.5",
  proposalApprovalMode: "mixed",
  requireFirstManualReviewBeforeAutoPromotion: true,
  adaptationPreset: "observe",
  adaptationProposalMode: "mixed",
  manualReviewForStructuralChanges: false,
  allowLlmIntervention: false,
  allowRuntimeRecovery: false,
  allowAdaptationCreation: false,
  allowPromotion: false,
  allowCreateRecoveryPaths: false,
  allowModifySubflows: false,
  allowCreateSubflows: false,
  allowModifyRouter: false,
  allowModifyExpectations: false,
  allowModifyActionTargets: false,
  allowDeleteOrDisableBehavior: true,
  requireApprovalForDestructiveChanges: false,
  maxRetriesPerAction: "5",
  maxRecoveryAttemptsPerSubflow: "6",
  maxReroutesPerRun: "7",
  maxNodesPerSubflow: "150",
  interfaceInputs: [{ id: "input.order", name: "Order", valueKind: "json", required: true, description: "Order payload", defaultValue: '{"id":1}' }],
  interfaceOutputs: [{ id: "output.result", name: "Result", valueKind: "string", required: false, description: "The answer", defaultValue: "none" }],
  dependencyPins: [],
  authorizedDomainIds: ["domain.shop"],
  maxInterventionsPerRun: "9",
  maxTokensPerRun: "22000",
  maxCostUsdPerTrainingWindow: "9",
  maxAdaptationInterventionsPerRun: "8",
  maxAdaptationCostUsdPerRun: "2",
  budgetExhaustedBehavior: "stop",
  llmProvider: "deepseek",
  llmModel: "deepseek-v4-pro",
  llmSecretKeyId: "key.deepseek",
  llmMaxInputTokens: "1234",
  llmMaxOutputTokens: "555",
  llmMaxTotalTokens: "4000",
  llmTimeoutSeconds: "11",
  llmMaxCostUsd: "0.11",
  llmRetryCount: "0",
  adaptationPolicyId: "policy.custom",
  resultCheckEnabled: false,
  resultCheckShape: "linear_decay",
  resultCheckInitialRunCount: "9",
  resultCheckInterval: "4",
  resultCheckDecay: "2",
  resultCheckMaxInterval: "40",
  resultCheckRepairOnRefutation: false
};

function textOf(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return node?.children ? textOf(node.children) : "";
}

describe("Flow settings round trip", () => {
  it("covers every setting the form exposes", () => {
    // Guards the guard: a setting added to the draft without a value here would
    // otherwise be waved through by every assertion below.
    const missing = Object.keys(flowSettingsDraftFromFlow(flowOf())).filter((key) => !(key in SETTINGS_ROUND_TRIP_VALUES));
    expect(missing, "settings with no round-trip coverage").toEqual([]);
  });

  it("keeps every changed setting through change, save and read back", () => {
    const readBack = flowSettingsDraftFromFlow(buildFlowSettingsSavePayload(flowOf(), SETTINGS_ROUND_TRIP_VALUES));
    expect(flowSettingsNotPersisted(SETTINGS_ROUND_TRIP_VALUES, readBack)).toEqual([]);
    expect(readBack).toEqual(SETTINGS_ROUND_TRIP_VALUES);
  });

  it("keeps a chosen LLM model rather than reading the framework default back over it", () => {
    const draft = { ...flowSettingsDraftFromFlow(flowOf()), llmModel: "deepseek-v4-pro" } as FlowSettingsDraft;
    const saved = buildFlowSettingsSavePayload(flowOf(), draft);
    expect(saved.metadata.llmModel).toBe("deepseek-v4-pro");
    expect(flowSettingsDraftFromFlow(saved).llmModel).toBe("deepseek-v4-pro");
  });

  it("leaves a setting untouched by a save that changed nothing", () => {
    // A Flow with one stored adaptation setting used to lose every framework
    // default beside it, which emptied the two adaptation budgets and wrote
    // them back as 0 on the next save -- adaptation turned off by nobody.
    for (const metadata of [{}, { adaptationPolicySettings: { preset: "observe" } }, { trainingModeSettings: { mode: "train_for_runs" } }]) {
      const flow = flowOf(metadata);
      const draft = flowSettingsDraftFromFlow(flow);
      expect(draft.maxAdaptationInterventionsPerRun, JSON.stringify(metadata)).toBe("3");
      expect(draft.maxAdaptationCostUsdPerRun, JSON.stringify(metadata)).toBe("0.25");
      const once = flowSettingsDraftFromFlow(buildFlowSettingsSavePayload(flow, draft));
      expect(flowSettingsNotPersisted(draft, once), JSON.stringify(metadata)).toEqual([]);
      const twice = flowSettingsDraftFromFlow(buildFlowSettingsSavePayload(buildFlowSettingsSavePayload(flow, draft), once));
      expect(flowSettingsNotPersisted(once, twice), JSON.stringify(metadata)).toEqual([]);
    }
  });

  // The user's rule (2026-10-01): a run -- a build, or a recovery -- costs at
  // most $0.10 unless FLUXIQ_LLM_RUN_COST_CEILING_USD sets another ceiling.
  // Core holds every build and recovery to that ceiling whatever a Flow stores,
  // so a form defaulting above it described a limit that does not exist. Pinned
  // to Core's source, as the permission defaults below are, because Core's only
  // public export of the constant also carries the server runtime.
  it("defaults a Flow's adaptation cost per run independently of test runtime limits", () => {
    const coreSource = (file: string) => readFileSync(new URL(`../../../../../../../packages/fluxiq/src/programs/automation-studio/${file}`, import.meta.url), "utf8");
    const ceiling = coreSource("model/run-cost-ceiling/run-cost-ceiling-env.ts").match(/AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD = ([0-9.]+);/)?.[1];
    const flows = coreSource("model/flows.ts");
    const draft = flowSettingsDraftFromFlow(flowOf());
    expect(draft.maxAdaptationCostUsdPerRun).toBe("0.25");
    expect(Number(draft.maxAdaptationCostUsdPerRun)).toBe(Number(ceiling));
    // A new Flow's stored default is the ceiling itself, not a copy of it.
    expect(flows).toContain("maxEstimatedCostUsdPerRun: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_DEFAULT_USD");
    expect(flowLimitsInterfaceErrors(draft).filter((error) => error.startsWith("Adaptation cost per run"))).toEqual([]);
    expect((buildFlowSettingsSavePayload(flowOf(), draft).metadata as any).adaptationPolicySettings.maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  it("shows the permission defaults Core actually runs a Flow under", () => {
    // The panel kept its own copy of these and every one of them was the
    // opposite of Core's, so a Flow storing nothing was described as needing
    // approval it does not need. Core exports no defaults constant to import,
    // only the resolver, so the copy is pinned to Core's source here: changing
    // Core's values without changing the panel's fails this test rather than
    // quietly making the settings screen describe a Flow that does not exist.
    const core = readFileSync(new URL("../../../../../../../packages/fluxiq/src/programs/automation-studio/runtime/service/flow-settings/adaptation-policy.ts", import.meta.url), "utf8");
    const coreDefault = (field: string) => {
      const found = core.match(new RegExp(`${field}:\\s*booleanSetting\\(settings\\.${field},\\s*(true|false)\\)`));
      expect(found, `Core no longer resolves ${field} with a boolean default; re-read adaptation-policy.ts`).toBeTruthy();
      return found![1] === "true";
    };
    const draft = flowSettingsDraftFromFlow(flowOf());
    for (const field of ["allowDeleteOrDisableBehavior", "requireApprovalForDestructiveChanges", "allowRuntimeRecovery", "allowCreateRecoveryPaths", "allowModifySubflows", "allowCreateSubflows", "allowModifyRouter", "allowModifyExpectations", "allowModifyActionTargets"] as const) {
      expect(draft[field], field).toBe(coreDefault(field));
    }
  });

  it("turns a setting back to its default through Core's merge", () => {
    // Core's `update-flow-settings` merges the patch over the stored metadata
    // rather than replacing it, so a key this form leaves out keeps its stored
    // value. A save that wrote only the settings differing from their defaults
    // could therefore never clear one: the person set it back, the key dropped
    // out of the patch, and the merge handed the old override straight back.
    const stored: any = {
      ...flowOf({
        adaptationPolicySettings: { preset: "observe", allowModifySubflows: false, allowExternalSideEffects: true },
        adaptationPolicyId: "policy.custom",
        llmSecretKeyId: "key.old"
      })
    };
    const loaded = flowSettingsDraftFromFlow(stored);
    expect(loaded).toMatchObject({ adaptationPreset: "observe", allowModifySubflows: false, adaptationPolicyId: "policy.custom", llmSecretKeyId: "key.old" });
    const wanted = { ...loaded, adaptationPreset: "adaptive", allowModifySubflows: true, adaptationPolicyId: "policy.default", llmSecretKeyId: "" } as FlowSettingsDraft;
    const patch = buildFlowSettingsSavePayload(stored, wanted);
    const merged = { ...stored, metadata: { ...stored.metadata, ...patch.metadata } };
    expect(flowSettingsNotPersisted(wanted, flowSettingsDraftFromFlow(merged))).toEqual([]);
    // A stored setting this form does not offer survives the save it is not part of.
    expect(merged.metadata.adaptationPolicySettings.allowExternalSideEffects).toBe(true);
  });

  it("refuses a blank limit instead of saving it as zero", () => {
    const blank = { ...flowSettingsDraftFromFlow(flowOf()), maxAdaptationInterventionsPerRun: "", maxTokensPerRun: "", maxCostUsdPerTrainingWindow: "" } as FlowSettingsDraft;
    const errors = flowLimitsInterfaceErrors(blank);
    expect(errors).toEqual(expect.arrayContaining([
      "Adaptation interventions per run must be a whole number from 0 to 100.",
      "Training-window cost must be from 0 to 100,000 USD."
    ]));
    // The one limit where blank is a setting: no token cap, the default since
    // 2026-09-30 (a run's tokens are bounded by its cost ceiling).
    expect(errors.some((error) => error.startsWith("LLM tokens per run"))).toBe(false);
    expect(flowLimitsInterfaceErrors({ ...blank, maxTokensPerRun: "64" })).toContain("LLM tokens per run must be blank (no limit) or a whole number from 128 to 1,000,000.");
  });

  it("saves a blank token limit as no cap, and a 12,000 a person types as theirs", () => {
    const draft = flowSettingsDraftFromFlow(flowOf());
    const blank = buildFlowSettingsSavePayload(flowOf(), { ...draft, maxTokensPerRun: "" });
    expect(blank.metadata.trainingModeSettings.budgets?.maxTokensPerRun).toBeUndefined();
    const typed = buildFlowSettingsSavePayload(flowOf(), { ...draft, maxTokensPerRun: "12000" });
    expect(typed.metadata.trainingModeSettings.budgets?.maxTokensPerRun).toBe(12000);
    // Core reads the key as "this Flow's token limit is a person's own", so its
    // clearing of the old 12,000 default never touches a value typed here.
    expect(typed.metadata.tokensPerRunDefaultCleared).toBe(true);
  });

  it("names a setting the save did not keep, and stays quiet about formatting", () => {
    const requested = flowSettingsDraftFromFlow(flowOf());
    expect(flowSettingsNotPersisted({ ...requested, llmModel: "deepseek-v4-pro", allowModifySubflows: false }, requested)).toEqual(["Modify subflows", "Model"]);
    // Trimming and re-spacing a structured default are not lost settings.
    expect(flowSettingsNotPersisted({ ...requested, name: "  Flow  " }, requested)).toEqual([]);
    expect(flowSettingsNotPersisted(
      { ...requested, interfaceInputs: [{ id: "a", name: " Order ", valueKind: "json", required: true, description: "", defaultValue: '{ "id": 1 }' }] },
      { ...requested, interfaceInputs: [{ id: "a", name: "Order", valueKind: "json", required: true, description: "", defaultValue: '{"id":1}' }] }
    )).toEqual([]);
  });
});

describe("Subflow settings round trip", () => {
  const stored = {
    name: "Checkout step",
    description: "Pays for the basket",
    role: "site",
    routeTags: ["checkout", "payment"],
    localInstructionIds: ["instruction.one"],
    status: "active",
    interventionModeOverride: "manual_approval",
    inputMapping: [{ flowInputId: "in.a", subflowInputId: "sub.a", required: true }],
    outputMapping: [{ subflowOutputId: "sub.b", flowOutputId: "out.b" }]
  };

  it("keeps every Subflow setting the save states", () => {
    expect(subflowSettingsNotPersisted(subflowSettingsDraft(stored), subflowSettingsDraft(stored))).toEqual([]);
  });

  it("names a Subflow setting the save did not keep", () => {
    const requested = subflowSettingsDraft(stored);
    const returned = subflowSettingsDraft({ ...stored, role: "utility", interventionModeOverride: null });
    expect(subflowSettingsNotPersisted(requested, returned)).toEqual(["Role", "LLM intervention mode"]);
  });

  it("does not report route tags the server merely re-punctuated", () => {
    const requested = { ...subflowSettingsDraft(stored), routeTags: "checkout,  payment" };
    expect(subflowSettingsNotPersisted(requested, subflowSettingsDraft(stored))).toEqual([]);
  });
});

describe("Flow settings form", () => {
  const detailOf = (model: string) => ({
    flowId: "flow.one",
    name: "Flow",
    updatedAt: 8,
    settings: { llm: { provider: "deepseek", model, secretKeyId: "key.deepseek", execution: { tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, maxCalls: 1, timeoutMs: 20000, maxEstimatedCostUsd: 0.25, retryCount: 0 } } },
    inputs: [],
    outputs: []
  });

  async function mountAndChooseModel(saveResponseModel: string) {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined };
    const commands = {
      loadFlow: vi.fn(async () => ({ ok: true, payload: { flow: detailOf("deepseek-flash") } })),
      listLlmSecrets: vi.fn(async () => ({ ok: true, payload: { keys: [{ id: "key.deepseek", name: "DeepSeek key", kind: "llm", enabled: true, provider: "DeepSeek", scope: "global" }] } })),
      listPublications: vi.fn(async () => ({ ok: true, payload: { publications: [] } })),
      saveFlow: vi.fn(async () => ({ ok: true, payload: { flow: detailOf(saveResponseModel) } }))
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.one", name: "Flow", updatedAt: 7, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />);
    });
    const labelled = (name: string) => renderer.root.findAll((node) => typeof node.type === "string" && node.props["aria-label"] === name);
    const buttonNamed = (name: string) => renderer.root.findAll((node) => node.type === "button" && textOf(node) === name);
    await act(async () => labelled("Model")[0]!.props.onChange({ target: { value: "deepseek-v4-pro" } }));
    expect(labelled("Model")[0]!.props.value).toBe("deepseek-v4-pro");
    await act(async () => buttonNamed("Save Settings")[0]!.props.onClick());
    const restore = async () => {
      await act(async () => { renderer?.unmount(); });
      if (previousWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = previousWindow;
    };
    return { renderer, commands, labelled, restore };
  }

  it("saves the chosen model and keeps showing it", async () => {
    const { renderer, commands, labelled, restore } = await mountAndChooseModel("deepseek-v4-pro");
    try {
      expect((commands.saveFlow.mock.calls[0] as any[])[0].flow.metadata.llmModel).toBe("deepseek-v4-pro");
      expect(labelled("Model")[0]!.props.value).toBe("deepseek-v4-pro");
      expect(textOf(renderer.toJSON())).toContain("Settings saved.");
    } finally {
      await restore();
    }
  });

  it("tells the person when an accepted save did not keep their change", async () => {
    // The server takes the write and reports the old value. Before, the control
    // simply snapped back and the page still said the settings were saved.
    const { renderer, restore } = await mountAndChooseModel("deepseek-flash");
    try {
      const rendered = textOf(renderer.toJSON());
      expect(rendered).toContain("did not take effect");
      expect(rendered).toContain("Model");
      expect(rendered).not.toContain("Settings saved.");
    } finally {
      await restore();
    }
  });

  it("does not let a catalog summary redraw saved settings as defaults", async () => {
    const { renderer, commands, labelled, restore } = await mountAndChooseModel("deepseek-v4-pro");
    try {
      // A store refresh after a save pushes the same Flow with a newer stamp and
      // no settings metadata. Adopting it reset every control to its default.
      // The same `commands` object is reused deliberately: a new identity would
      // re-run the load effect and reload the Flow, testing something else.
      await act(async () => {
        renderer.update(<FlowSettingsViewContent commands={commands as any} flow={{ flowId: "flow.one", name: "Flow", updatedAt: 99, metadata: { summaryOnly: true }, source: { mode: "visual" } }} projectId="project.one" />);
      });
      expect(labelled("Model")[0]!.props.value).toBe("deepseek-v4-pro");
    } finally {
      await restore();
    }
  });
});
