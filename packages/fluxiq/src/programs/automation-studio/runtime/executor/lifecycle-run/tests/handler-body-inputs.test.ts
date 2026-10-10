// A handler body is handed only what it can read (t411; t408 measured 3.7-4.5 s
// of trace withholding per body run when it was handed every parent value):
// the frame's inputs, plus the values its own nodes' bindings name.

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { automationStudioRootInvocation } from "../../frames/index.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";
import { dispatchAutomationStudioLifecycleEvent } from "../index.ts";
import { dispatchInput, edge, fact, fakeHost, flowWith, HANDLER, HANDLER_END } from "./lifecycle-fixtures.ts";

/** About 1 MB of rows, as a read list's outputs hold them. */
function bigRows(): JsonValue[] {
  return Array.from({ length: 5_000 }, (_, index) => ({ name: `Person ${index}`, link: `https://example.test/people/${index}`, about: "x".repeat(160) }));
}

/** A Handler whose body reads `tag.value` and the frame's `who` input, then resumes. */
function readingFlow() {
  return flowWith("graph.inputs", [{
    nodes: [
      { id: "h", definitionId: HANDLER, parameterValues: { event: "retry", scope: { kind: "nodes", nodeIds: ["press"] }, when: [fact("popup")], completionCheck: [fact("cleared")] } },
      { id: "h.read", definitionId: "builtin.data.constant", parameterValues: { value: { tag: { $state: { path: "tag.value" } }, who: { $state: { path: "who" } } } } },
      { id: "h.end", definitionId: HANDLER_END, parameterValues: { disposition: "resume" } }
    ],
    edges: [edge("h", "h.read", "body"), edge("h.read", "h.end")]
  }]);
}

describe("a handler body's inputs", () => {
  it("are the frame's inputs and the values the body's bindings name, not every value of the parent", async () => {
    const flow = readingFlow();
    const handed: Array<{ keys: string[]; ms: number }> = [];
    const invocation = automationStudioRootInvocation(flow, { currentSubflowId: "main", inputs: { who: "Amara" } }, async (target, options, onExecuted) => {
      const startedAt = performance.now();
      const trace = await runAutomationStudioGraph(target.graph, options, onExecuted);
      handed.push({ keys: Object.keys(options.inputs ?? {}).sort(), ms: performance.now() - startedAt });
      return trace;
    });
    invocation.run.stack.push(invocation.frame);
    const values: Record<string, JsonValue> = { who: "Amara", "big.value": bigRows(), big: bigRows(), "tag.value": "friend requests", "other.value": "not read" };
    const host = fakeHost({ popup: "true", cleared: "true" });

    const outcome = await dispatchAutomationStudioLifecycleEvent(dispatchInput(flow, { invocation, hostRuntime: host.runtime }, { event: "retry", values }));
    // The before and after of t411 are read from this line: the body run's own time, withholding included.
    console.log(`t411 handler body run: ${handed[0]?.ms.toFixed(0)} ms, ${handed[0]?.keys.length} inputs`);

    expect(outcome).toMatchObject({ kind: "handled", decision: { kind: "resume" } });
    expect(handed.map((run) => run.keys)).toEqual([["tag.value", "who"]]);
    const read = outcome.runs[0]?.bodyTrace?.attempts.find((attempt) => attempt.nodeId === "h.read");
    expect(read?.status).toBe("succeeded");
  });
});
