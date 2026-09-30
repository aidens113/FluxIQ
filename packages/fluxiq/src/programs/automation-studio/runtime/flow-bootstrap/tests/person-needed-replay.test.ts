// A dry run whose replay meets a check asks the person too.
//
// The replay runs through the same executor the build's calls do
// (`../../llm/node-tools/replay-draft.ts`), so the wrapper sees it. Without
// that, a check on the replay was a step that "did not run again" -- refused
// as failed, or put to the model as unreproducible -- and the model was asked
// to amend a Flow that had nothing wrong with it.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftReplayClearedCode, runAutomationStudioLlmEvidenceLoop, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import type { AutomationStudioAsk, AutomationStudioParkingPort } from "../../parking/index.ts";
import { automationStudioFlowBootstrapPersonNeeded } from "../person-needed.ts";

const tool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true };

async function build(answer: "person_done" | "person_stop") {
  const decide = vi.fn()
    .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "node.open", parameters: {}, consequences: [] }, add: true })
    .mockResolvedValue({ kind: "complete", result: { summary: "done" } });
  const executeTool = vi.fn(async ({ value }: { value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    // The replayed step lands on a check the first run did not meet.
    if (value.replay === "step") return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "USER_INTERVENTION_REQUIRED" }, effectApplied: true, resultCode: "core.replay.failed", personNeeded: true };
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { at: "the list" },
      effectApplied: true,
      draft: {
        actionId: "node.open",
        input: value,
        ranWith: { node: "node.open", parameters: { to: "the list" }, consequences: [] },
        effect: "mutate",
        proposes: true,
        replay: { from: { at: "the start" }, produced: { opened: true } }
      }
    };
  });
  const opened: AutomationStudioAsk[] = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask) => ({ askId: ask.askId, answeredAt: 1, kind: "choice", value: answer, actorId: "person" })
  };
  const personNeeded = automationStudioFlowBootstrapPersonNeeded({ executeTool, tools: [tool], ask: { port }, clearedResultCode: automationStudioFlowDraftReplayClearedCode });
  const result = await runAutomationStudioLlmEvidenceLoop({
    tools: [tool], decide, executeTool: personNeeded.executeTool, signal: personNeeded.signal,
    maxIterations: 6, maxToolCalls: 6, minToolCalls: 1,
    unusableDecisions: { maxConsecutive: 4, stalled: () => new Error("stalled") }
  });
  return { result, decide, opened, personNeeded };
}

describe("a dry run whose replay meets a check", () => {
  it("asks the person, and on Continue counts the step replayed and accepts the result", async () => {
    const { result, decide, opened } = await build("person_done");
    expect(opened).toHaveLength(1);
    expect(result.ok).toBe(true);
    // The press and the completion: no refused completion, no amendment asked for.
    expect(decide).toHaveBeenCalledTimes(2);
    expect(result.steps.map((step) => step.replayed?.status)).toEqual(["replayed"]);
  });

  it("ends the build as needing a person on Stop, never as a failed or unreproducible step", async () => {
    const { result, decide, personNeeded } = await build("person_stop");
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.code).toBe("llm_evidence_loop.cancelled");
    expect(decide).toHaveBeenCalledTimes(2);
    expect(result.steps.map((step) => step.replayed?.status)).toEqual([undefined]);
    expect(personNeeded.endedOnIntervention(result)?.diagnostic).toMatchObject({ code: "flow_bootstrap.user_intervention_required", issueCodes: ["person_needed.stopped"] });
  });
});
