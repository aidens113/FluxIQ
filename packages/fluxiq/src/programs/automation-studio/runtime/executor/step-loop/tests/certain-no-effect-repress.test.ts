// Confirmed no-effect presses share the ordinary first attempt and three
// retries in saved playback and candidate trials. Retry provenance stays on
// the trace; a later uncertain lasting effect still stops another press.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../contracts.ts";
import { runAutomationStudioGraph } from "../../graph-run.ts";

/** A press after which, once the page settled, nothing on it had changed and the control was still there to press. */
const IGNORED: AutomationStudioFailureRecord = { category: "action_failed", code: "test.no_effect", retryable: true, stage: "execution", effect: "unacted", certainNoEffect: true };

/** A page that turned the press away as busy: unacted, but not certain about anything else. */
const BUSY: AutomationStudioFailureRecord = { category: "action_failed", code: "test.busy", retryable: true, stage: "execution", effect: "unacted" };

function post(metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id: "post", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "post" } }, ...(metadata ? { metadata } : {}) };
}

function line(node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, node, { id: "done", definitionId: "builtin.control.end" }];
  const edges = [
    { id: "e0", sourceNodeId: "start", targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" },
    { id: "e1", sourceNodeId: node.id, targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
  ];
  return { schemaVersion: "0.1", flowId: "flow.repress", ownerKind: "routine", ownerId: "routine.repress", name: "Repress", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Answers each press with `answers` in turn, then succeeds; counts the presses. */
function site(answers: readonly AutomationStudioFailureRecord[]) {
  const pressed = { count: 0 };
  const options: AutomationStudioGraphExecutionOptions = {
    delay: async () => undefined,
    now: () => 1_000,
    hostRuntime: { capabilities: [] },
    effectDispatcher: () => {
      const failure = answers[pressed.count];
      pressed.count += 1;
      if (failure) return { status: "failed", route: "failed", message: "The press changed nothing.", failure };
      return { status: "success", route: "success", outputs: { ok: true } };
    }
  };
  return { pressed, options };
}

const lasting = post({ declaredConsequences: ["send_or_publish"] });

describe("a lasting press that certainly changed nothing, in a graph run", () => {
  it.each([2, 3])("succeeds after %i confirmed no-effect attempts within the ordinary retry budget", async (failures) => {
    const { pressed, options } = site(Array.from({ length: failures }, () => IGNORED));
    const trace = await runAutomationStudioGraph(line(lasting), options);
    expect(trace.status).toBe("succeeded");
    expect(pressed.count).toBe(failures + 1);
    const presses = trace.attempts.filter((attempt) => attempt.nodeId === "post");
    expect(presses.slice(1).every((attempt) => attempt.retry?.repress === true)).toBe(true);
    expect(presses.at(-1)?.retry?.maxAttempts).toBe(4);
  });

  it("stops if a later press leaves its lasting effect uncertain", async () => {
    const uncertain: AutomationStudioFailureRecord = { category: "action_failed", code: "test.reply_lost", retryable: true, stage: "execution", effect: "ambiguous" };
    const { pressed, options } = site([IGNORED, uncertain]);
    const trace = await runAutomationStudioGraph(line(lasting), options);
    expect(pressed.count).toBe(2);
    expect(trace.status).toBe("failed");
    expect(trace.attempts.some((attempt) => attempt.nodeId === "done")).toBe(false);
  });

  it("is pressed once more, and the attempt that does so says it is that press", async () => {
    const { pressed, options } = site([IGNORED]);
    const trace = await runAutomationStudioGraph(line(lasting), options);
    expect(trace.status).toBe("succeeded");
    expect(pressed.count).toBe(2);
    const presses = trace.attempts.filter((attempt) => attempt.nodeId === "post");
    expect(presses.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(presses[1]?.retry).toMatchObject({ attemptNumber: 2, previousAttemptId: presses[0]?.attemptId, repress: true });
  });

  it("fails after exactly four confirmed no-effect presses", async () => {
    const { pressed, options } = site([IGNORED, IGNORED, IGNORED, IGNORED]);
    const trace = await runAutomationStudioGraph(line(lasting), options);
    expect(pressed.count).toBe(4);
    expect(trace.status).toBe("failed");
    expect(trace.attempts.some((attempt) => attempt.nodeId === "done")).toBe(false);
    const presses = trace.attempts.filter((attempt) => attempt.nodeId === "post");
    expect(presses.map((attempt) => attempt.status)).toEqual(["failed", "failed", "failed", "failed"]);
    const last = presses.at(-1);
    expect(last?.failure?.certainNoEffect).toBe(true);
    expect(last?.retry?.repress).toBe(true);
  });

  it("preserves an authored failed route after the lasting press is exhausted", async () => {
    const { pressed, options } = site([IGNORED, IGNORED, IGNORED, IGNORED]);
    const flow = line(lasting);
    flow.edges.push({ id: "failed", sourceNodeId: "post", targetNodeId: "done", sourcePortId: "failed", targetPortId: "in" });
    const trace = await runAutomationStudioGraph(flow, options);
    expect(pressed.count).toBe(4);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.some((attempt) => attempt.nodeId === "done")).toBe(true);
  });

  it("preserves explicit optional continuation of a lasting step", async () => {
    const { pressed, options } = site([IGNORED, IGNORED, IGNORED, IGNORED]);
    const trace = await runAutomationStudioGraph(line(post({ declaredConsequences: ["send_or_publish"], optional: true })), options);
    expect(pressed.count).toBe(4);
    expect(trace.status).toBe("succeeded");
  });

  it("leaves every other unacted failure, and a press that does not last, with the first attempt and three retries", async () => {
    const busy = site([BUSY, BUSY, BUSY, BUSY]);
    await runAutomationStudioGraph(line(lasting), busy.options);
    expect(busy.pressed.count).toBe(4);
    const plain = site([IGNORED, IGNORED, IGNORED, IGNORED]);
    const trace = await runAutomationStudioGraph(line(post({ declaredConsequences: [] })), plain.options);
    expect(plain.pressed.count).toBe(4);
    const presses = trace.attempts.filter((attempt) => attempt.nodeId === "post");
    expect(presses.slice(1).map((attempt) => attempt.retry?.repress)).toEqual([true, true, true]);
  });
});
