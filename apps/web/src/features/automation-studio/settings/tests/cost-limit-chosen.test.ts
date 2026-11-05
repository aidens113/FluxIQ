import { describe, expect, it } from "vitest";
import { applyFlowSettingsField } from "../draft-field";
import { buildFlowSettingsSavePayload, flowSettingsDraftFromFlow } from "../flow-settings-model";
import { flowSettingsNotPersisted } from "../persistence-check";

const flow = { flowId: "f", name: "Flow", metadata: { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 0.25 } }, interface: { inputs: [], outputs: [] } };
const saved = (draft: ReturnType<typeof flowSettingsDraftFromFlow>) => (buildFlowSettingsSavePayload(flow, draft).metadata as any).adaptationPolicySettings;

describe("the cost limit a person chose", () => {
  it("is marked chosen when the person edited the limit, even back to the same $0.25", () => {
    let draft = flowSettingsDraftFromFlow(flow);
    draft = applyFlowSettingsField(draft, "maxAdaptationCostUsdPerRun", "0.3");
    draft = applyFlowSettingsField(draft, "maxAdaptationCostUsdPerRun", "0.25");
    expect(saved(draft)).toMatchObject({ maxEstimatedCostUsdPerRun: 0.25, maxEstimatedCostUsdPerRunChosen: true });
  });

  it("is not marked when another setting is saved", () => {
    const draft = applyFlowSettingsField(flowSettingsDraftFromFlow(flow), "description", "Something else");
    expect(saved(draft)).not.toHaveProperty("maxEstimatedCostUsdPerRunChosen");
    expect(saved(draft).maxEstimatedCostUsdPerRun).toBe(0.25);
  });

  it("keeps a marker that is already stored, and never reads the edited note back", () => {
    const stored = { ...flow, metadata: { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 0.25, maxEstimatedCostUsdPerRunChosen: true } } };
    const draft = flowSettingsDraftFromFlow(stored);
    expect(draft.maxAdaptationCostUsdPerRunEdited).toBeUndefined();
    expect((buildFlowSettingsSavePayload(stored, draft).metadata as any).adaptationPolicySettings.maxEstimatedCostUsdPerRunChosen).toBe(true);
  });

  it("is no unsaved setting in the round-trip check", () => {
    const edited = applyFlowSettingsField(flowSettingsDraftFromFlow(flow), "maxAdaptationCostUsdPerRun", "0.25");
    expect(flowSettingsNotPersisted(edited, flowSettingsDraftFromFlow(flow))).toEqual([]);
  });
});
