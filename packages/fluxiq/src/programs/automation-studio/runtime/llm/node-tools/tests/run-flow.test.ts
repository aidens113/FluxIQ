// `core.run_flow` as the loop offers it, and when (`../run-flow.ts`, t244).
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID,
  automationStudioLlmRunFlowBinding,
  automationStudioLlmRunFlowTool,
  type AutomationStudioLlmEvidenceTool
} from "../../index.ts";
import { automationStudioLlmEvidenceValidTools } from "../../evidence-loop-decision.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

const press: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true };

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.click",
  toolId: "core.run_node",
  input: { node: "web.click", parameters: {} },
  ranWith: { node: "web.click", parameters: {}, consequences: [] },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: "https://store.test/" } },
  ...over
});

describe("automationStudioLlmRunFlowTool", () => {
  it("is Core's mutating tool that takes a first step and an optional last one", () => {
    const tool = automationStudioLlmRunFlowTool();
    expect(tool.toolId).toBe(AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID);
    expect(AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID).toBe("core.run_flow");
    expect(tool.effect).toBe("mutate");
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["from"],
      properties: { from: { type: "integer", minimum: 1 }, to: { type: "integer", minimum: 1 } }
    });
    expect(automationStudioLlmEvidenceValidTools([tool])).toBe(true);
  });

  it("says what it is in under 1,200 characters, in Core's words, and that it is never the Flow's test", () => {
    const { description } = automationStudioLlmRunFlowTool();
    expect(description.length).toBeLessThan(1_200);
    expect(description).not.toMatch(/\bpage\b/iu);
    expect(description).toMatch(/nothing is reset/iu);
    expect(description).toMatch(/never the Flow's test/iu);
    expect(description).toMatch(/run whole from its start and been judged/iu);
  });

  it("is a fresh copy each time", () => {
    const one = automationStudioLlmRunFlowTool();
    (one.inputSchema as JsonObject).changed = true;
    expect((automationStudioLlmRunFlowTool().inputSchema as JsonObject).changed).toBeUndefined();
  });
});

describe("automationStudioLlmRunFlowBinding", () => {
  const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" }));

  it("adds the tool after the loop's own only where the loop drafts, runs its dry run and can act", () => {
    expect(automationStudioLlmRunFlowBinding({ tools: [press], executeTool, steps: [], enabled: true }).tools.map((tool) => tool.toolId)).toEqual(["core.run_node", "core.run_flow"]);
    expect(automationStudioLlmRunFlowBinding({ tools: [press], executeTool, steps: [], enabled: false }).tools).toEqual([press]);
    expect(automationStudioLlmRunFlowBinding({ tools: [], executeTool, steps: [], enabled: true }).tools).toEqual([]);
    const look: AutomationStudioLlmEvidenceTool = { toolId: "look", description: "Look.", inputSchema: { type: "object" }, effect: "observe" };
    expect(automationStudioLlmRunFlowBinding({ tools: [look], executeTool, steps: [], enabled: true }).tools).toEqual([look]);
    const own = { ...press, toolId: "core.run_flow" };
    expect(automationStudioLlmRunFlowBinding({ tools: [own], executeTool, steps: [], enabled: true }).tools).toEqual([own]);
  });

  it("offers it only while the draft holds a proposed step that can run again", () => {
    const steps: AutomationStudioFlowDraftStep[] = [];
    const binding = automationStudioLlmRunFlowBinding({ tools: [press], executeTool, steps, enabled: true });
    const runFlow = binding.tools[1]!;
    expect(binding.offered(press)).toBe(true);
    expect(binding.offered(runFlow)).toBe(false);
    steps.push(step(1, { disposition: "taken" }));
    expect(binding.offered(runFlow)).toBe(false);
    const { replay: _replay, ...noReplay } = step(2);
    steps.push(noReplay);
    expect(binding.offered(runFlow)).toBe(false);
    steps.push(step(3));
    expect(binding.offered(runFlow)).toBe(true);
  });

  it("answers a core.run_flow call by running the draft's steps through the loop's executor, and passes every other call on", async () => {
    executeTool.mockClear();
    const steps = [step(1), step(2)];
    const binding = automationStudioLlmRunFlowBinding({ tools: [press], executeTool, steps, enabled: true });
    const ran = await binding.executeTool({ callId: "c1", toolId: "core.run_flow", value: { from: 2 } });
    expect(ran).toMatchObject({ resultCode: "core.run_flow.ran", evidence: { ok: true, from: 2, to: 2 } });
    expect(executeTool.mock.calls.map((call) => (call as unknown as [{ callId: string }])[0].callId)).toEqual(["c1.2"]);
    await binding.executeTool({ callId: "c2", toolId: "core.run_node", value: { node: "web.read" } });
    expect(executeTool).toHaveBeenLastCalledWith({ callId: "c2", toolId: "core.run_node", value: { node: "web.read" } });
  });
});
