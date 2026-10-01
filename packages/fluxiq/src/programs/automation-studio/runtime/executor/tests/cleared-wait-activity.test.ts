// What a Flow run says when an output dispatch reports a wait on the page that
// cleared by itself (`node-execution.ts`): the same pair a tool call's would be
// (`activity/ask/cleared-wait.ts`), one card per node attempt.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activityActionKey, activityActionOf } from "../../../../../ui/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.cleared-wait",
  ownerKind: "task",
  ownerId: "task.cleared-wait",
  name: "Cleared wait",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
  edges: []
};

async function inRun(options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, options));
}

const answering = (extra: Partial<AutomationNodeExecutionResult>): AutomationStudioGraphExecutionOptions => ({
  effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true }, ...extra })
});

const askRows = () => seen.filter((event) => event.detail?.kind === "ask");

describe("a Flow run whose output dispatch met a check that cleared by itself", () => {
  it("says one waiting and waited-out pair for the node attempt, inside the run", async () => {
    const trace = await inRun(answering({ clearedWait: { waitedMs: 3_200 } }));

    const rows = askRows();
    expect(rows.map((event) => [event.phase, event.detail?.status, event.detail?.ref, event.detail?.resolution])).toEqual([
      ["waiting_permission", "started", "waited-out.output.attempt.1", undefined],
      ["running", "succeeded", "waited-out.output.attempt.1", "waited_out"]
    ]);
    const [waiting, resolved] = rows;
    expect(waiting).toMatchObject({ activityId: "run:run.1", subject: { kind: "run", id: "run.1" } });
    expect(resolved!.detail!.text).toBe("The check cleared on its own after 3 s.");
    expect(resolved!.detail!.title).toBe(waiting!.detail!.title);
    expect(activityActionOf(waiting!)).toMatchObject({ kind: "person_check", outcome: "waiting" });
    expect(activityActionOf(resolved!)).toMatchObject({ kind: "person_check", outcome: "done", why: null });
    expect(activityActionKey(resolved!)).toBe(activityActionKey(waiting!));
    // Told, not kept: the attempt carries no copy of it.
    expect(trace.attempts[0]).toMatchObject({ status: "succeeded" });
    expect(trace.attempts[0]).not.toHaveProperty("clearedWait");
  });

  it("says it for a dispatch that failed after the check cleared", async () => {
    await inRun({ effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false }, message: "Not found.", clearedWait: { waitedMs: 1_000 } }) });
    expect(askRows().map((event) => event.detail?.resolution)).toEqual([undefined, "waited_out"]);
  });

  it("keys a Call Flow child's node attempt under the attempt that called it", async () => {
    await inRun({ ...answering({ clearedWait: { waitedMs: 0 } }), callFlowAttemptPath: ["call.attempt.2"] });
    expect(askRows().map((event) => event.detail?.ref)).toEqual(["waited-out.call.attempt.2/output.attempt.1", "waited-out.call.attempt.2/output.attempt.1"]);
  });

  it("says nothing when the dispatch reports no cleared wait", async () => {
    await inRun(answering({}));
    expect(askRows()).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["a number", 4_400],
    ["an array", [4_400]],
    ["no waitedMs", {}],
    ["a string waitedMs", { waitedMs: "4400" }],
    ["a fraction", { waitedMs: 4_400.5 }],
    ["a negative", { waitedMs: -1 }],
    ["more than a day", { waitedMs: 86_400_001 }],
    ["NaN", { waitedMs: Number.NaN }],
    ["null", null]
  ])("says nothing for %s", async (_name, clearedWait) => {
    await inRun(answering({ clearedWait: clearedWait as { waitedMs: number } }));
    expect(askRows()).toEqual([]);
  });
});
