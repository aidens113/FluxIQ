import { describe, expect, it, vi } from "vitest";
import { applyFlowAdaptationPreset, buildFlowSettingsSavePayload, flowLlmProvider, flowSettingsDraftFromFlow } from "./flow-settings-model";
import { subflowSettingsDraft, subflowSettingsErrors } from "./subflow-settings-model";
import { saveFlowSettings } from "./settings-commands";
import { FlowSettingsView, FlowSettingsViewContent } from "./FlowSettingsView";
import { SubflowSettingsView, SubflowSettingsViewContent } from "./SubflowSettingsView";
describe("settings domain", () => {
  it("builds typed Flow drafts and save payloads", () => {
    const flow = { flowId: "f", name: "Flow", metadata: {}, interface: { inputs: [], outputs: [] } };
    const draft = applyFlowAdaptationPreset(flowSettingsDraftFromFlow(flow), "adaptive");
    expect(flowLlmProvider("deepseek").label).toBe("DeepSeek");
    expect(buildFlowSettingsSavePayload(flow, draft).name).toBe("Flow");
  });
  it("validates Subflow mappings and owns Flow saves", async () => {
    const draft = subflowSettingsDraft({ name: "Subflow", inputMapping: [], outputMapping: [] });
    expect(subflowSettingsErrors(draft, [], [], [], [])).toEqual([]);
    const post = vi.fn().mockResolvedValue({ ok: true });
    await saveFlowSettings({ post } as any, { projectId: "p" });
    expect(post).toHaveBeenCalledWith("save-flow", { projectId: "p" });
    expect(FlowSettingsViewContent.toString()).toContain("commitAutomationStudioMutation");
    expect(SubflowSettingsViewContent.toString()).toContain("commitAutomationStudioMutation");
  });
});
