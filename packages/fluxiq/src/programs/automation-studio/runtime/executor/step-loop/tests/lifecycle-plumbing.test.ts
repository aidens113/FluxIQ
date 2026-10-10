// Lifecycle events fire only at steps that act on or read the host
// (`../lifecycle-dispatch.ts`, `../../lifecycle/event-applies.ts`): Core
// plumbing -- a Merge, a Wait, the Start and the End -- gets no dispatch, no
// fact check and no handler run, and an acting step still does.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { timingNodes } from "../../../../nodes/timing/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { automationStudioLifecycleEventApplies } from "../../lifecycle/index.ts";
import { closer, fact, line, page, pageOptions, press } from "../../lifecycle-run/tests/wiring-fixtures.ts";

const merge: AutomationStudioFlowNode = { id: "merge", definitionId: "builtin.control.merge" };
const pause: AutomationStudioFlowNode = { id: "pause", definitionId: "builtin.timing.wait", parameterValues: { duration: 1 } };

/** start -> s1 -> merge -> pause -> s2 -> done, with one Handler in subflow scope. */
function plumbedLine(handler: JsonObject) {
  return line("graph.main", [press("s1"), merge, pause, press("s2")], [closer("h", { scope: { kind: "subflow" }, ...handler })]);
}

describe("lifecycle boundaries at Core plumbing", () => {
  it("asks the host about a Before handler only at the steps that act, never at Start, Merge, Wait or End", async () => {
    const current = page();
    const trace = await runAutomationStudioGraph(plumbedLine({ event: "before", when: [fact("nothing-known")], completionCheck: [fact("cleared")] }), pageOptions(current));

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "s1", "merge", "pause", "s2", "done"]);
    // One batched fact check per acting boundary: s1 and s2.
    expect(current.factBatches).toHaveLength(2);
  });

  it("runs a handler whose facts hold before the next acting step, not before the plumbing in between", async () => {
    const current = page({ popupAfter: ["s1"] });
    const trace = await runAutomationStudioGraph(plumbedLine({ event: "before", when: [fact("popup")], completionCheck: [fact("cleared")] }), pageOptions(current));

    expect(trace.status).toBe("succeeded");
    expect(current.presses).toEqual(["s1", "dismiss", "s2"]);
    expect(trace.handlerExecutions?.map((record) => [record.event, record.nodeId, record.disposition.kind])).toEqual([["before", "s2", "resume"]]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "merge")?.lifecycle).toBeUndefined();
    expect(trace.attempts.find((attempt) => attempt.nodeId === "s2")?.lifecycle).toMatchObject({ event: "before", disposition: { kind: "resume" } });
  });

  it("dispatches Before Next after an acting step only", async () => {
    const current = page();
    await runAutomationStudioGraph(plumbedLine({ event: "before_next", when: [fact("nothing-known")] }), pageOptions(current));

    expect(current.factBatches).toHaveLength(2);
  });

  it("names plumbing by definition: control flow but Call Subflow, and Wait; `start` fires at any frame's first node", () => {
    const at = (definitionId: string, event: Parameters<typeof automationStudioLifecycleEventApplies>[0] = "before") => automationStudioLifecycleEventApplies(event, { definitionId });
    for (const id of ["builtin.control.start", "builtin.control.end", "builtin.control.merge", "builtin.control.parallel", "builtin.control.branch", "builtin.control.switch", "builtin.control.loop", "builtin.control.for-each", "builtin.control.repeat", "builtin.control.handler", "builtin.control.handler-end", "builtin.timing.wait"]) {
      expect([id, at(id), at(id, "retry"), at(id, "fail"), at(id, "before_next")]).toEqual([id, false, false, false, false]);
    }
    for (const id of ["builtin.control.call-subflow", "builtin.policy.action", "web.output.dom-click", "flow.call"]) expect([id, at(id)]).toEqual([id, true]);
    expect(at("builtin.control.start", "start")).toBe(true);
    // The Wait id this rule names is the timing node's own.
    expect(timingNodes.map((definition) => definition.id)).toContain("builtin.timing.wait");
  });
});
