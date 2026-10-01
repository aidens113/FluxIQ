// What a run says in the activity stream about a wait on the person: the ask
// row that opens it (`graph-run.ts`) and the one that settles it, whether the
// run waited in place (`graph-run.ts`) or parked and was resumed (`resume.ts`).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION,
  AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION,
  type AutomationStudioAskAnswer,
  type AutomationStudioParkingPort
} from "../../parking/index.ts";
import { resumeAutomationStudioGraph, runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

const NOW = 1_000;

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

/** Start, a page step that meets a robot check, a step that reads the page, End. */
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.ask-activity",
  ownerKind: "routine",
  ownerId: "routine.ask-activity",
  name: "Ask activity",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
    { id: "check", definitionId: "domain.page.step" },
    { id: "read", definitionId: "domain.page.step" },
    { id: "done", definitionId: "builtin.control.end" }
  ],
  edges: [
    { id: "e.start", sourceNodeId: "start", targetNodeId: "check", sourcePortId: "success", targetPortId: "in" },
    { id: "e.check", sourceNodeId: "check", targetNodeId: "read", sourcePortId: "success", targetPortId: "in" },
    { id: "e.read", sourceNodeId: "read", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
  ]
};

const CHECK_RESULT: AutomationNodeExecutionResult = {
  status: "failed",
  route: "failed",
  outputs: {},
  message: "A robot check is on the page.",
  failure: { category: "user_intervention_required", code: "web.intervention.required", retryable: false, stage: "execution" }
};

const options: AutomationStudioGraphExecutionOptions = {
  now: () => NOW,
  delay: () => Promise.resolve(),
  nativeNodeExecutor: (request) => Promise.resolve({ result: request.node.id === "check" ? CHECK_RESULT : { status: "success", route: "success", outputs: {} } })
};

function choice(askId: string, value: string): AutomationStudioAskAnswer {
  return { askId, answeredAt: NOW + 5, kind: "choice", value, actorId: null };
}

/** A port that holds the run open and answers the same way; `null` is nobody answering. */
function inPlace(value: string | null, during?: () => void): AutomationStudioParkingPort {
  return {
    open: () => undefined,
    awaitAnswer: (ask) => {
      during?.();
      return Promise.resolve(value === null ? undefined : choice(ask.askId, value));
    }
  };
}

async function inRun<T>(fn: () => Promise<T>): Promise<T> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "r1", projectId: "p1" }, fn);
}

/** The ask rows the run said, as [phase, ref, status, resolution, text]. */
function askRows(): unknown[][] {
  return seen.filter((event) => event.detail?.kind === "ask").map((event) => [event.phase, event.detail!.ref, event.detail!.status, event.detail!.resolution, event.detail!.text]);
}

describe("a run's wait on the person, in the activity stream", () => {
  it.each([
    ["Continue", AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, "succeeded", "answered", "You pressed Continue."],
    ["Stop", AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, "failed", "declined", "You pressed Stop."],
    ["nobody answering", null, "failed", "timed_out", "Nobody answered in time."]
  ] as const)("opens with the ask id and settles on %s with one row for the same ask", async (_case, value, status, resolution, text) => {
    await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: inPlace(value) }));
    expect(askRows()).toEqual([
      ["waiting_permission", "check.attempt.2", "started", undefined, undefined],
      ["running", "check.attempt.2", status, resolution, text]
    ]);
    const [waiting, resolved] = seen.filter((event) => event.detail?.kind === "ask");
    expect(resolved!.detail!.title).toBe(waiting!.detail!.title);
    expect(waiting!.detail!.title).toBe("Asked the person to complete a check");
  });

  it("settles as cancelled for a run cancelled while it waited", async () => {
    const cancel = new AbortController();
    const trace = await inRun(() => runAutomationStudioGraph(flow, { ...options, signal: cancel.signal, parking: inPlace(null, () => cancel.abort()) }));
    expect(trace.status).not.toBe("succeeded");
    expect(askRows()).toEqual([
      ["waiting_permission", "check.attempt.2", "started", undefined, undefined],
      ["running", "check.attempt.2", "failed", "cancelled", "The work stopped before this was answered."]
    ]);
  });

  it("settles as cancelled when the thread could not be read, or the answer could not settle the ask", async () => {
    const broken: AutomationStudioParkingPort = { open: () => undefined, awaitAnswer: () => Promise.reject(new Error("the thread is gone")) };
    await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: broken })).catch(() => undefined);
    const mismatched: AutomationStudioParkingPort = { open: () => undefined, awaitAnswer: () => Promise.resolve(choice("another.ask", AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION)) };
    const refused = await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: mismatched }));
    expect(refused.status).toBe("failed");
    expect(askRows()).toEqual([
      ["waiting_permission", "check.attempt.2", "started", undefined, undefined],
      ["running", "check.attempt.2", "failed", "cancelled", "The work stopped before this was answered."],
      ["waiting_permission", "check.attempt.2", "started", undefined, undefined],
      ["running", "check.attempt.2", "failed", "cancelled", "The work stopped before this was answered."]
    ]);
  });

  it("settles a parked run's wait when it is resumed with the answer", async () => {
    const parked = await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: { open: () => undefined } }));
    expect(parked.status).toBe("waiting");
    const resumed = await inRun(() => resumeAutomationStudioGraph({ flow, trace: parked, resumption: { kind: "answer", answer: choice(parked.parked!.ask.askId, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION) }, options }));
    expect((resumed as { trace: AutomationStudioGraphExecutionTrace }).trace.status).toBe("succeeded");
    expect(askRows()).toEqual([
      ["waiting_permission", "check.attempt.2", "started", undefined, undefined],
      ["running", "check.attempt.2", "succeeded", "answered", "You pressed Continue."]
    ]);
  });

  it("says nothing for a resume that was refused, since the wait is not over", async () => {
    const parked = await inRun(() => runAutomationStudioGraph(flow, { ...options, parking: { open: () => undefined } }));
    seen = [];
    const refused = await inRun(() => resumeAutomationStudioGraph({ flow, trace: parked, resumption: { kind: "answer", answer: choice("another.ask", AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION) }, options }));
    expect(refused.outcome).toBe("refused");
    expect(askRows()).toEqual([]);
  });
});
