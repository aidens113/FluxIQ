import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import {
  automationStudioAskEffect,
  type AutomationStudioAsk,
  type AutomationStudioAskAnswer
} from "../../parking/index.ts";
import {
  resumeAutomationStudioGraph,
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace
} from "../index.ts";

const PARKED_AT = 1_000;
const TIMEOUT_MS = 60_000;

/**
 * Sends a draft, then asks before publishing it. Everything before the
 * approval is work a resume must not repeat: the variable the run wrote, and
 * the one dispatch it already made.
 */
const approvalFlow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.publish-approval",
  ownerKind: "routine",
  ownerId: "routine.publish-approval",
  name: "Publish approval",
  createdAt: 1,
  updatedAt: 1,
  nodes: [
    { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
    { id: "draft", definitionId: "builtin.data.constant", parameterValues: { value: "draft-42" } },
    { id: "remember", definitionId: "builtin.data.set-variable", parameterValues: { name: "draftId", writeMode: "replace" } },
    { id: "send", definitionId: "builtin.policy.action", parameterValues: { outputId: "send-draft" } },
    { id: "approve", definitionId: "builtin.routine.approval", parameterValues: { prompt: "Publish the draft?", timeoutMs: TIMEOUT_MS, defaultRoute: "rejected" } },
    { id: "recall", definitionId: "builtin.data.get-variable", parameterValues: { name: "draftId" } },
    { id: "discard", definitionId: "builtin.policy.action", parameterValues: { outputId: "discard-draft" } },
    { id: "done", definitionId: "builtin.control.end" }
  ],
  edges: [
    { id: "e.start", sourceNodeId: "start", targetNodeId: "draft", sourcePortId: "success", targetPortId: "in" },
    { id: "e.draft", sourceNodeId: "draft", targetNodeId: "remember", sourcePortId: "success", targetPortId: "in" },
    { id: "e.remember", sourceNodeId: "remember", targetNodeId: "send", sourcePortId: "success", targetPortId: "in" },
    { id: "e.send", sourceNodeId: "send", targetNodeId: "approve", sourcePortId: "success", targetPortId: "in" },
    { id: "e.approved", sourceNodeId: "approve", targetNodeId: "recall", sourcePortId: "approved", targetPortId: "in" },
    { id: "e.rejected", sourceNodeId: "approve", targetNodeId: "discard", sourcePortId: "rejected", targetPortId: "in" },
    { id: "e.recalled", sourceNodeId: "recall", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" },
    { id: "e.discarded", sourceNodeId: "discard", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
  ]
};

function dispatchRecorder(): { outputIds: string[]; options: AutomationStudioGraphExecutionOptions } {
  const outputIds: string[] = [];
  return {
    outputIds,
    options: {
      now: () => PARKED_AT,
      effectDispatcher: (effect) => {
        const payload = effect.payload as { outputId?: string } | undefined;
        if (payload?.outputId) outputIds.push(payload.outputId);
        return { status: "success", route: "success", outputs: {} };
      }
    }
  };
}

async function parkedRunTrace(options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runAutomationStudioGraph(approvalFlow, options);
}

function grant(askId: string, atMs = PARKED_AT + 5): AutomationStudioAskAnswer {
  return { askId, answeredAtMs: atMs, kind: "grant" };
}

describe("a run that reaches an approval", () => {
  it("parks on the question with everything needed to go on, and does not route out of the node", async () => {
    const recorder = dispatchRecorder();

    const trace = await parkedRunTrace(recorder.options);

    expect(trace.status).toBe("waiting");
    expect(trace.currentNodeId).toBe("approve");
    expect(trace.parked?.ask.text).toBe("Publish the draft?");
    expect(trace.parked?.ask.kind).toBe("confirm");
    expect(trace.parked?.ask.parks).toBe(true);
    expect(trace.parked?.ask.status).toBe("pending");
    expect(trace.parked?.nodeId).toBe("approve");
    expect(trace.parked?.routes).toEqual({ answered: "approved", denied: "rejected", expired: "rejected" });
    expect(trace.parked?.expiresAtMs).toBe(PARKED_AT + TIMEOUT_MS);
    expect(trace.parked?.carried.variables).toEqual({ draftId: "draft-42" });
    // The work before the question happened once, and neither branch after it ran.
    expect(recorder.outputIds).toEqual(["send-draft"]);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve"]);
    expect(trace.attempts.at(-1)?.ask).toMatchObject({ status: "pending", parks: true });
  });

  it("tells whoever is bound the question, and fails the run rather than waiting silently when nobody can be told", async () => {
    const asked: AutomationStudioAsk[] = [];
    const heard = await parkedRunTrace({ ...dispatchRecorder().options, parking: { open: (ask) => void asked.push(ask) } });
    expect(heard.status).toBe("waiting");
    expect(asked.map((ask) => ask.text)).toEqual(["Publish the draft?"]);
    expect(asked[0]?.raisedBy).toMatchObject({ stage: "execution", nodeId: "approve", definitionId: "builtin.routine.approval" });

    const undelivered = await parkedRunTrace({
      ...dispatchRecorder().options,
      parking: { open: () => { throw new Error("no conversation store"); } }
    });

    expect(undelivered.status).toBe("failed");
    expect(undelivered.message).toContain("could not be delivered");
    expect(undelivered.parked).toBeUndefined();
  });
});

describe("answering a parked run", () => {
  it("resumes it down the approved route with its earlier work intact, and never runs the parked node again", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);
    const askId = parked.parked!.ask.askId;

    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: parked,
      resumption: { kind: "answer", answer: grant(askId) },
      options: recorder.options
    });

    expect(resumed.outcome).toBe("resumed");
    const trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(trace.status).toBe("succeeded");
    // One run, not two: the same start, the earlier attempts, and one dispatch.
    expect(trace.startedAt).toBe(parked.startedAt);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "recall", "done"]);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "approve")).toHaveLength(1);
    expect(recorder.outputIds).toEqual(["send-draft"]);
    // The variable the run wrote before it parked is still readable after it.
    expect(trace.values["recall.value"]).toBe("draft-42");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "approve")?.ask).toMatchObject({ askId, status: "answered", route: "approved" });
    expect(trace.parked).toBeUndefined();
  });

  it("resumes down the rejected route when the answer is a refusal", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);

    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: parked,
      resumption: { kind: "answer", answer: { askId: parked.parked!.ask.askId, answeredAtMs: PARKED_AT + 5, kind: "deny" } },
      options: recorder.options
    });

    const trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "discard", "done"]);
    expect(recorder.outputIds).toEqual(["send-draft", "discard-draft"]);
  });

  it("refuses an answer that names another ask, and leaves the run parked", async () => {
    const parked = await parkedRunTrace(dispatchRecorder().options);

    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: parked,
      resumption: { kind: "answer", answer: grant("some.other.ask") },
      options: dispatchRecorder().options
    });

    expect(resumed).toMatchObject({ outcome: "refused", reason: "ask_mismatch" });
    expect(parked.status).toBe("waiting");
  });
});

describe("a second answer to the same question", () => {
  it("is refused once the run has moved on, so nothing it already did happens twice", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);
    const answer = { kind: "answer", answer: grant(parked.parked!.ask.askId) } as const;
    const first = await resumeAutomationStudioGraph({ flow: approvalFlow, trace: parked, resumption: answer, options: recorder.options });
    const firstTrace = (first as { trace: AutomationStudioGraphExecutionTrace }).trace;

    const second = await resumeAutomationStudioGraph({ flow: approvalFlow, trace: firstTrace, resumption: answer, options: recorder.options });

    expect(second).toMatchObject({ outcome: "refused", reason: "not_parked" });
    expect(recorder.outputIds).toEqual(["send-draft"]);
  });

  it("is refused while the run is still parked, once the ask itself has been settled", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);
    // What the conversation store records when it takes the first answer: the
    // ask is answered, and the run holding it is no longer resumable from it.
    const settled: AutomationStudioGraphExecutionTrace = {
      ...parked,
      parked: { ...parked.parked!, ask: { ...parked.parked!.ask, status: "answered" } }
    };

    const second = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: settled,
      resumption: { kind: "answer", answer: grant(parked.parked!.ask.askId) },
      options: recorder.options
    });

    expect(second).toMatchObject({ outcome: "refused", reason: "already_settled" });
    expect(recorder.outputIds).toEqual(["send-draft"]);
  });
});

describe("nobody answering", () => {
  it("takes the node's default route once the ask has run out of time", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);

    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: parked,
      resumption: { kind: "timeout" },
      options: { ...recorder.options, now: () => PARKED_AT + TIMEOUT_MS + 1 }
    });

    const trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "discard", "done"]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "approve")?.ask).toMatchObject({ status: "expired", route: "rejected" });
  });

  it("is refused before the ask has run out of time, so a default route cannot be taken early", async () => {
    const recorder = dispatchRecorder();
    const parked = await parkedRunTrace(recorder.options);

    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow,
      trace: parked,
      resumption: { kind: "timeout" },
      options: { ...recorder.options, now: () => PARKED_AT + TIMEOUT_MS - 1 }
    });

    expect(resumed).toMatchObject({ outcome: "refused", reason: "not_expired" });
  });

  it("takes the approved route when that is what the node says to do about silence", async () => {
    const recorder = dispatchRecorder();
    const flow: AutomationStudioFlowDocument = {
      ...approvalFlow,
      nodes: approvalFlow.nodes.map((node) => node.id === "approve"
        ? { ...node, parameterValues: { ...node.parameterValues, defaultRoute: "approved" } }
        : node)
    };
    const parked = await runAutomationStudioGraph(flow, recorder.options);
    expect(parked.parked?.routes.expired).toBe("approved");

    const resumed = await resumeAutomationStudioGraph({
      flow,
      trace: parked,
      resumption: { kind: "timeout" },
      options: { ...recorder.options, now: () => PARKED_AT + TIMEOUT_MS + 1 }
    });

    const trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "recall", "done"]);
  });
});

describe("a host that can hold the run open", () => {
  it("never returns waiting at all: the answer arrives in place and the run finishes in one call", async () => {
    const recorder = dispatchRecorder();
    const asked: string[] = [];

    const trace = await runAutomationStudioGraph(approvalFlow, {
      ...recorder.options,
      parking: {
        open: (ask) => void asked.push(ask.askId),
        awaitAnswer: (ask) => Promise.resolve(grant(ask.askId))
      }
    });

    expect(asked).toHaveLength(1);
    expect(trace.status).toBe("succeeded");
    expect(trace.parked).toBeUndefined();
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "draft", "remember", "send", "approve", "recall", "done"]);
    expect(recorder.outputIds).toEqual(["send-draft"]);
  });

  it("takes the default route when it waited and nobody answered", async () => {
    const recorder = dispatchRecorder();

    const trace = await runAutomationStudioGraph(approvalFlow, {
      ...recorder.options,
      parking: { open: () => undefined, awaitAnswer: () => Promise.resolve(undefined) }
    });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.find((attempt) => attempt.nodeId === "approve")?.ask).toMatchObject({ status: "expired", route: "rejected" });
    expect(recorder.outputIds).toEqual(["send-draft", "discard-draft"]);
  });
});

describe("parking is the run's capability, not the Approval node's", () => {
  const domainFlow: AutomationStudioFlowDocument = {
    ...approvalFlow,
    flowId: "flow.domain-permission",
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
      { id: "publish", definitionId: "domain.social.publish" },
      { id: "done", definitionId: "builtin.control.end" }
    ],
    edges: [
      { id: "e.start", sourceNodeId: "start", targetNodeId: "publish", sourcePortId: "success", targetPortId: "in" },
      { id: "e.publish", sourceNodeId: "publish", targetNodeId: "done", sourcePortId: "success", targetPortId: "in" }
    ]
  };

  function domainOptions(parks: boolean, extra: AutomationStudioGraphExecutionOptions = {}): AutomationStudioGraphExecutionOptions {
    return {
      now: () => PARKED_AT,
      nativeNodeExecutor: () => Promise.resolve({
        result: {
          status: "success",
          route: "success",
          outputs: { published: false as JsonValue },
          effects: [automationStudioAskEffect({
            kind: "permission",
            parks,
            text: "Publish to the account? This posts publicly.",
            missing: ["external_side_effect"],
            routes: { answered: "success", denied: "failed", expired: "failed" }
          })]
        }
      }),
      ...extra
    };
  }

  it("parks a node that succeeded, because `parks` is the flag and the status is not", async () => {
    const trace = await runAutomationStudioGraph(domainFlow, domainOptions(true));

    expect(trace.status).toBe("waiting");
    expect(trace.parked?.ask.kind).toBe("permission");
    expect(trace.parked?.ask.missing).toEqual(["external_side_effect"]);
    expect(trace.parked?.nodeId).toBe("publish");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "publish"]);

    const resumed = await resumeAutomationStudioGraph({
      flow: domainFlow,
      trace,
      resumption: { kind: "answer", answer: grant(trace.parked!.ask.askId) },
      options: domainOptions(true)
    });

    const continued = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(continued.status).toBe("succeeded");
    expect(continued.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "publish", "done"]);
  });

  it("says an ask that does not park without stopping the run", async () => {
    const asked: string[] = [];

    const trace = await runAutomationStudioGraph(domainFlow, domainOptions(false, { parking: { open: (ask) => void asked.push(ask.text) } }));

    expect(trace.status).toBe("succeeded");
    expect(trace.parked).toBeUndefined();
    expect(asked).toEqual(["Publish to the account? This posts publicly."]);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "publish")?.ask).toMatchObject({ parks: false, status: "pending" });
  });

  it("never hands an ask to a host's effect dispatcher", async () => {
    const dispatched: string[] = [];

    await runAutomationStudioGraph(domainFlow, domainOptions(true, {
      effectDispatcher: (effect) => {
        dispatched.push(effect.type);
        return undefined;
      }
    }));

    expect(dispatched).toEqual([]);
  });
});
