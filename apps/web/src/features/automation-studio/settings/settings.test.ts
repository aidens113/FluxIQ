import { describe, expect, it, vi } from "vitest";
import { applyFlowAdaptationPreset, buildFlowSettingsSavePayload, flowLlmProvider, flowSettingsDraftFromFlow } from "./flow-settings-model";
import { subflowSettingsDraft, subflowSettingsErrors } from "./subflow-settings-model";
import { saveFlowSettings } from "./settings-commands";
import { FlowSettingsView, FlowSettingsViewContent } from "./FlowSettingsView";
import { SubflowSettingsView, SubflowSettingsViewContent } from "./SubflowSettingsView";
import { loadSubflowSettingsResources } from "./settings-queries";
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
    expect(post).toHaveBeenCalledWith("update-flow-settings", { projectId: "p" });
    expect(FlowSettingsViewContent.toString()).toContain("commitAutomationStudioMutation");
    expect(SubflowSettingsViewContent.toString()).toContain("commitAutomationStudioMutation");
  });
  it("converts rejected ancillary Subflow Settings requests into visible results", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { subflow: { subflowId: "subflow.one" } } })
      .mockRejectedValueOnce(new Error("parent unavailable"))
      .mockResolvedValueOnce({ ok: true, payload: { instructions: [] } })
      .mockRejectedValueOnce(new Error("router unavailable"));
    const [subflow, parent, instructions, router] = await loadSubflowSettingsResources({ post } as any, {
      projectId: "project.one",
      flowId: "flow.one",
      subflowId: "subflow.one"
    });
    expect(subflow.ok).toBe(true);
    expect(parent).toMatchObject({ ok: false, error: expect.stringContaining("parent unavailable") });
    expect(instructions.ok).toBe(true);
    expect(router).toMatchObject({ ok: false, error: expect.stringContaining("router unavailable") });
    expect(post).toHaveBeenNthCalledWith(2, "get-flow-metadata-detail", { projectId: "project.one", flowId: "flow.one" });
  });
});
