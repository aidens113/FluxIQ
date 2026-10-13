// An interruption the client's defence closed while a step succeeded (t516):
// the executor asks the run session once to learn it, holds the handler the
// session overlays for the rest of the frame, and lists it among the run's
// kept repairs. Real graph runs against the wiring page; no model.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import type { AutomationStudioIncidentRepair, AutomationStudioInterruptionLearningRequest } from "../../lifecycle-run/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { adding, rowsFlow, rowsRun } from "../../lifecycle-run/tests/in-run-repair-fixtures.ts";
import { closer, fact, line, page, pageOptions, press } from "../../lifecycle-run/tests/wiring-fixtures.ts";

/** The promotion the defence closed, as Core reads it off a dispatch. */
const PROMOTION: JsonObject = { kind: "dialog", control: "Maybe later", name: "Join the reading club", controlName: "Maybe later, thanks", wayOut: "way-out.0a1b", wayOutDefinitionId: "test.output.press" };

/** The page's press of `elementId` also reports `layers` closed, as a client that cleared them answers. */
function closesWhilePressing(options: AutomationStudioGraphExecutionOptions, elementId: string, layers: JsonObject[]): void {
  const dispatch = options.effectDispatcher!;
  options.effectDispatcher = async (effect, context) => {
    const answer = await dispatch(effect, context);
    const id = /"elementId":"([^"]+)"/u.exec(JSON.stringify(effect.payload ?? null))?.[1];
    return id === elementId && answer ? { ...answer, outputs: { ...(answer.outputs ?? {}), result: { clearedLayers: layers } } } : answer;
  };
}

/** A learning callback that records each request and answers `answer`. */
function learner(answer: (request: AutomationStudioInterruptionLearningRequest) => AutomationStudioIncidentRepair) {
  const requests: AutomationStudioInterruptionLearningRequest[] = [];
  const callback = async (request: AutomationStudioInterruptionLearningRequest) => {
    requests.push(request);
    return answer(request);
  };
  return { requests, callback };
}

describe("learning an interruption the defence closed", () => {
  it("asks once, holds the learned handler for the rest of the frame, and lists it among the run's repairs", async () => {
    const current = page();
    const options = pageOptions(current);
    closesWhilePressing(options, "s1", [PROMOTION]);
    const flow = line("graph.main", [press("s1"), press("s2")]);
    const learned = adding(flow, closer("h.learned", { event: "before", scope: { kind: "nodes", nodeIds: ["s1"] }, when: [fact("popup")], completionCheck: [fact("cleared")] }));
    const learning = learner(() => ({ kind: "overlay", repairId: "learn-1", unit: { kind: "handler", handlerNodeId: "h.learned" }, graph: learned, reason: "The Flow now closes the reading club offer here." }));
    const trace = await runAutomationStudioGraph(flow, { ...options, learnInterruption: learning.callback });

    expect(trace.status).toBe("succeeded");
    expect(learning.requests).toHaveLength(1);
    expect(learning.requests[0]).toMatchObject({ subflowId: "main", attempt: { nodeId: "s1", status: "succeeded" }, layer: { name: "Join the reading club", wayOut: "way-out.0a1b" } });
    expect(learning.requests[0]!.graph).toBe(flow);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s1")?.repair).toEqual({ repairId: "learn-1", unit: { kind: "handler", handlerNodeId: "h.learned" }, outcome: "held", reason: "The Flow now closes the reading club offer here." });
    expect(trace.repairs).toEqual(["learn-1"]);
    expect(current.landed).toEqual(["s1", "s2"]);
  });

  it("asks once per step and layer however often the loop meets it, and the handler it learned runs when the layer is there", async () => {
    const { current, options } = rowsRun();
    closesWhilePressing(options, "s1", [PROMOTION]);
    const flow = rowsFlow();
    // The learned handler closes the popup before s2 when it is up; the page puts it up after each s2 press.
    current.popupAfter.add("s2");
    const learned = adding(flow, closer("h.learned", { event: "before", scope: { kind: "nodes", nodeIds: ["s1"] }, when: [fact("popup")], completionCheck: [fact("cleared")] }));
    const learning = learner(() => ({ kind: "overlay", repairId: "learn-rows", unit: { kind: "handler", handlerNodeId: "h.learned" }, graph: learned }));
    const trace = await runAutomationStudioGraph(flow, { ...options, learnInterruption: learning.callback });

    expect(trace.status).toBe("succeeded");
    expect(learning.requests).toHaveLength(1);
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.disposition.kind])).toEqual([["before", "s1", "resume"], ["before", "s1", "resume"]]);
    expect(trace.repairs).toEqual(["learn-rows"]);
  });

  it("asks nothing for a layer with no name or no way out to press, and a run with no callback keeps today's trace", async () => {
    const bare = page();
    const bareOptions = pageOptions(bare);
    closesWhilePressing(bareOptions, "s1", [PROMOTION]);
    const plain = await runAutomationStudioGraph(line("graph.main", [press("s1"), press("s2")]), bareOptions);
    expect(JSON.stringify(plain)).not.toMatch(/"repairs?"/u);

    const current = page();
    const options = pageOptions(current);
    const { name: _name, ...unnamed } = PROMOTION;
    const { wayOut: _wayOut, wayOutDefinitionId: _definition, ...unpressable } = PROMOTION;
    closesWhilePressing(options, "s1", [unnamed, unpressable]);
    const learning = learner(() => ({ kind: "none", reason: "unused" }));
    const trace = await runAutomationStudioGraph(line("graph.main", [press("s1"), press("s2")]), { ...options, learnInterruption: learning.callback });
    expect(learning.requests).toHaveLength(0);
    expect(trace.repairs).toBeUndefined();
  });

  it("carries on unchanged when the session learns nothing", async () => {
    const current = page();
    const options = pageOptions(current);
    closesWhilePressing(options, "s1", [PROMOTION]);
    const learning = learner(() => ({ kind: "none", reason: "The way out could not be named." }));
    const trace = await runAutomationStudioGraph(line("graph.main", [press("s1"), press("s2")]), { ...options, learnInterruption: learning.callback });
    expect(trace.status).toBe("succeeded");
    expect(learning.requests).toHaveLength(1);
    expect(trace.repairs).toBeUndefined();
    expect(trace.attempts.some((attempt) => attempt.repair)).toBe(false);
  });
});
