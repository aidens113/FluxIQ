// A person's save marks the Flow's cost limit chosen only when it means the limit: the form resends
// every field, so a save of another setting must leave the marker alone.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY, automationStudioAnswerFirstExplicitLimitUsd } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import { updateFlowSettingsForRequest } from "../update.ts";

const KEY = AUTOMATION_STUDIO_COST_LIMIT_CHOSEN_KEY;

function save(stored: Record<string, unknown>, sent: Record<string, unknown>) {
  let flow: any = { flowId: "flow.1", metadata: { adaptationPolicySettings: stored } };
  const service = {
    getFlow: async () => flow,
    saveFlow: async (input: { flow: unknown }) => { flow = input.flow; },
    getFlowMetadataDetail: async () => ({})
  } as unknown as Parameters<typeof updateFlowSettingsForRequest>[0];
  return updateFlowSettingsForRequest(service, "project.1", "flow.1", { flow: { metadata: { adaptationPolicySettings: sent } } }).then(() => flow.metadata.adaptationPolicySettings as Record<string, unknown>);
}

describe("marking the cost limit chosen", () => {
  it("does not mark it when a save resends the stored default and changes another setting", async () => {
    const saved = await save({ maxEstimatedCostUsdPerRun: 0.25, preset: "balanced" }, { maxEstimatedCostUsdPerRun: 0.25, preset: "strict" });
    expect(saved[KEY]).toBeUndefined();
    expect(saved.preset).toBe("strict");
    expect(automationStudioAnswerFirstExplicitLimitUsd({ adaptationPolicySettings: saved })).toBeUndefined();
  });
  it("marks it when the person changes the value, back to $0.25 included", async () => {
    const saved = await save({ maxEstimatedCostUsdPerRun: 1 }, { maxEstimatedCostUsdPerRun: 0.25 });
    expect(saved[KEY]).toBe(true);
    expect(automationStudioAnswerFirstExplicitLimitUsd({ adaptationPolicySettings: saved })).toBe(0.25);
  });
  it("marks it when the save names the marker, which is how the stored $0.25 is kept on purpose", async () => {
    const saved = await save({ maxEstimatedCostUsdPerRun: 0.25 }, { maxEstimatedCostUsdPerRun: 0.25, [KEY]: true });
    expect(automationStudioAnswerFirstExplicitLimitUsd({ adaptationPolicySettings: saved })).toBe(0.25);
  });
  it("keeps a stored marker through a save that rewrites the settings without it, and clears it when told false", async () => {
    expect((await save({ maxEstimatedCostUsdPerRun: 0.25, [KEY]: true }, { maxEstimatedCostUsdPerRun: 0.25, preset: "strict" }))[KEY]).toBe(true);
    expect((await save({ maxEstimatedCostUsdPerRun: 0.25, [KEY]: true }, { maxEstimatedCostUsdPerRun: 0.25, [KEY]: false }))[KEY]).toBeUndefined();
  });
  it("reads a Flow record that has no marker", async () => {
    const saved = await save({ preset: "balanced" }, { preset: "strict" });
    expect(saved[KEY]).toBeUndefined();
  });
});
