import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import {
  automationStudioAskEffect,
  type AutomationStudioAsk,
  type AutomationStudioAskAnswer
} from "../../parking/index.ts";
import {
  automationStudioReferenceNow,
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
  return { askId, answeredAt: atMs, kind: "grant", value: null, actorId: null };
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
    expect(trace.parked?.routes).toEqual({ granted: "approved", denied: "rejected", timedOut: "rejected" });
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
  it("retains an earlier explicit date reference through saved-trace hydration while the resumed clock advances", async () => {
    const referenceNow = PARKED_AT - 500;
    const references: Array<number | undefined> = [];
    const recorder = dispatchRecorder();
    const dispatch: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect, context) => {
      references.push(context?.referenceNow);
      return recorder.options.effectDispatcher!(effect, context);
    };
    const parked = await parkedRunTrace({ ...recorder.options, referenceNow, effectDispatcher: dispatch });
    expect(parked.parked?.expiresAtMs).toBe(PARKED_AT + TIMEOUT_MS);
    const hydrated = JSON.parse(JSON.stringify(parked)) as AutomationStudioGraphExecutionTrace;
    const resumed = await resumeAutomationStudioGraph({
      flow: approvalFlow, trace: hydrated,
      resumption: { kind: "answer", answer: { askId: hydrated.parked!.ask.askId, answeredAt: PARKED_AT + 5, kind: "deny", value: null, actorId: null } },
      options: { now: () => PARKED_AT + 10, referenceNow: PARKED_AT + 10, effectDispatcher: dispatch }
    });
    expect(resumed.outcome).toBe("resumed");
    if (resumed.outcome !== "resumed") throw new Error("parked run did not resume");
    expect(resumed.trace).toMatchObject({ status: "succeeded", startedAt: PARKED_AT, referenceNow, finishedAt: PARKED_AT + 10 });
    expect(references).toEqual([referenceNow, referenceNow]);
    expect(recorder.outputIds).toEqual(["send-draft", "discard-draft"]);
  });

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
      resumption: { kind: "answer", answer: { askId: parked.parked!.ask.askId, answeredAt: PARKED_AT + 5, kind: "deny", value: null, actorId: null } },
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
    expect(parked.parked?.routes.timedOut).toBe("approved");

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
            missing: ["send_or_publish"],
            routes: { granted: "success", denied: "failed", timedOut: "failed" }
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
    expect(trace.parked?.ask.missing).toEqual(["send_or_publish"]);
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

const MIDNIGHT = Date.UTC(2026, 9, 31);

function flowOf(nodes: AutomationStudioFlowNode[], flowId = "reference-clock"): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId, ownerKind: "routine", ownerId: flowId, name: flowId, createdAt: 1, updatedAt: 1, nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `next.${index}`, sourceNodeId: nodes[index]!.id, sourcePortId: "success", targetNodeId: node.id, targetPortId: "in" }))
  };
}

const action = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: id } });

describe("the enclosing execution's relative-date reference", () => {
  it("reads valid epoch milliseconds and drops malformed references", () => {
    for (const value of [0, MIDNIGHT, 8_640_000_000_000_000]) expect(automationStudioReferenceNow(value)).toBe(value);
    for (const value of [undefined, null, "1", -1, 0.5, NaN, Infinity, 8_640_000_000_000_001]) expect(automationStudioReferenceNow(value)).toBeUndefined();
  });

  it("captures a root start once while attempt and finish timestamps keep advancing", async () => {
    let live = MIDNIGHT - 100;
    const references: Array<number | undefined> = [];
    const trace = await runAutomationStudioGraph(flowOf([action("first"), action("second")]), {
      now: () => live++,
      effectDispatcher: (_effect, context) => {
        references.push(context?.referenceNow);
        return { status: "success", route: "success", outputs: {} };
      }
    });
    expect(trace.status).toBe("succeeded");
    expect(trace.startedAt).toBe(MIDNIGHT - 100);
    expect(references).toEqual([trace.startedAt, trace.startedAt]);
    expect(trace.attempts[0]!.startedAt).toBeGreaterThan(trace.startedAt);
    expect(trace.finishedAt).toBeGreaterThan(trace.attempts.at(-1)!.startedAt);
  });

  it("keeps retry waits live across midnight and sends the same reference to every native and effect attempt", async () => {
    let live = MIDNIGHT - 100;
    const references: Array<number | undefined> = [], nativeReferences: Array<number | undefined> = [], waits: number[] = [];
    const trace = await runAutomationStudioGraph(flowOf([{ id: "read", definitionId: "custom.read" }]), {
      now: () => live,
      delay: async (ms) => {
        waits.push(ms);
        live += ms;
      },
      nativeNodeExecutor: async ({ hostContext }) => {
        nativeReferences.push(hostContext?.referenceNow);
        return { result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: "read" } }] } };
      },
      effectDispatcher: (_effect, context) => {
        references.push(context?.referenceNow);
        return references.length === 1
          ? { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "read.busy", retryable: true, effect: "unacted", stage: "execution" } }
          : { status: "success", route: "success", outputs: {} };
      }
    });
    expect(trace.status).toBe("succeeded");
    expect(waits.length).toBeGreaterThan(0);
    expect(trace.finishedAt).toBeGreaterThan(MIDNIGHT);
    expect(references).toEqual([MIDNIGHT - 100, MIDNIGHT - 100]);
    expect(nativeReferences).toEqual(references);
    expect(trace.attempts.map((attempt) => attempt.startedAt)).toEqual([MIDNIGHT - 100, trace.finishedAt]);
  });

  it("lets an explicit enclosing reference win and passes it into nested child graphs", async () => {
    let live = MIDNIGHT + 100;
    const references: Array<number | undefined> = [];
    const child = flowOf([action("child")], "child");
    const trace = await runAutomationStudioGraph(flowOf([{ id: "call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "child" } }]), {
      referenceNow: MIDNIGHT - 100,
      now: () => live++,
      effectDispatcher: (_effect, context) => {
        references.push(context?.referenceNow);
        return { status: "success", route: "success", outputs: {} };
      },
      subflowGraphs: { load: async () => ({ subflowId: "child", graph: child, graphRevision: null }) }
    });
    expect(trace.status).toBe("succeeded");
    expect(trace.referenceNow).toBe(MIDNIGHT - 100);
    expect(trace.startedAt).toBe(MIDNIGHT + 100);
    expect(trace.attempts[0]!.childTrace?.referenceNow).toBe(MIDNIGHT - 100);
    expect(trace.attempts[0]!.childTrace?.attempts[0]?.framePath).toEqual(["invocation-1", "invocation-2"]);
    expect(references).toEqual([MIDNIGHT - 100]);
  });

  it("drops a malformed explicit value and captures a fresh reference for each new root", async () => {
    let live = MIDNIGHT - 1;
    const references: Array<number | undefined> = [];
    const options = {
      referenceNow: NaN,
      now: () => live,
      effectDispatcher: (_effect: unknown, context?: { referenceNow?: number }) => {
        references.push(context?.referenceNow);
        return { status: "success" as const, route: "success", outputs: {} };
      }
    };
    const first = await runAutomationStudioGraph(flowOf([action("read")]), options);
    live = MIDNIGHT + 1;
    const second = await runAutomationStudioGraph(flowOf([action("read")]), options);
    expect([first.status, second.status]).toEqual(["succeeded", "succeeded"]);
    expect(references).toEqual([MIDNIGHT - 1, MIDNIGHT + 1]);
    expect(options.referenceNow).toBeNaN();
  });
});
