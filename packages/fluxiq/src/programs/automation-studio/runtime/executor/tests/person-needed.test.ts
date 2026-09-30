import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND,
  AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION,
  AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION,
  AUTOMATION_STUDIO_PERSON_NEEDED_TEXT,
  type AutomationStudioAsk,
  type AutomationStudioAskAnswer,
  type AutomationStudioParkingPort
} from "../../parking/index.ts";
import {
  AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN,
  resumeAutomationStudioGraph,
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace
} from "../index.ts";

const NOW = 1_000;
const CHECK_CODE = "web.intervention.required";

/** Four page steps in a row, then End. Which of them meet a check is up to each test. */
function pageFlow(stepIds: string[], extraEdges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  const nodes: AutomationStudioFlowDocument["nodes"] = [
    { id: "start", definitionId: "builtin.control.start", parameterValues: { emitTimestamp: false } },
    ...stepIds.map((id) => ({ id, definitionId: "domain.page.step" })),
    { id: "done", definitionId: "builtin.control.end" }
  ];
  const chain = ["start", ...stepIds, "done"];
  return {
    schemaVersion: "0.1",
    flowId: "flow.person-needed",
    ownerKind: "routine",
    ownerId: "routine.person-needed",
    name: "Person needed",
    createdAt: 1,
    updatedAt: 1,
    nodes,
    edges: [
      ...chain.slice(1).map((target, index) => ({ id: `e.${chain[index]}`, sourceNodeId: chain[index]!, targetNodeId: target, sourcePortId: "success", targetPortId: "in" })),
      ...extraEdges
    ]
  };
}

const CHECK_RESULT: AutomationNodeExecutionResult = {
  status: "failed",
  route: "failed",
  outputs: {},
  message: "A robot check is on the page.",
  failure: { category: "user_intervention_required", code: CHECK_CODE, retryable: false, stage: "execution" }
};

/** A host that executes page steps: those in `checked` meet a check, the rest read the page. */
function pageHost(checked: ReadonlySet<string>, extra: AutomationStudioGraphExecutionOptions = {}): { executed: string[]; inputs: Record<string, Record<string, JsonValue>>; options: AutomationStudioGraphExecutionOptions } {
  const executed: string[] = [];
  const inputs: Record<string, Record<string, JsonValue>> = {};
  return {
    executed,
    inputs,
    options: {
      now: () => NOW,
      delay: () => Promise.resolve(),
      nativeNodeExecutor: (request) => {
        executed.push(request.node.id);
        inputs[request.node.id] = request.inputs;
        return Promise.resolve({ result: checked.has(request.node.id) ? CHECK_RESULT : { status: "success", route: "success", outputs: { text: `read by ${request.node.id}` } } });
      },
      ...extra
    }
  };
}

function choice(askId: string, value: string): AutomationStudioAskAnswer {
  return { askId, answeredAt: NOW + 5, kind: "choice", value, actorId: null };
}

/** A port that holds the run open and answers every ask the same way; `null` is nobody answering. */
function inPlacePort(value: string | null): { asked: AutomationStudioAsk[]; port: AutomationStudioParkingPort } {
  const asked: AutomationStudioAsk[] = [];
  return {
    asked,
    port: {
      open: (ask) => void asked.push(ask),
      awaitAnswer: (ask) => Promise.resolve(value === null ? undefined : choice(ask.askId, value))
    }
  };
}

function attemptOf(trace: AutomationStudioGraphExecutionTrace, nodeId: string) {
  return trace.attempts.filter((attempt) => attempt.nodeId === nodeId).at(-1);
}

describe("a step that meets something only a person can get past", () => {
  it("asks the person with the person-needed ask instead of failing", async () => {
    const host = pageHost(new Set(["check"]));
    const { asked, port } = inPlacePort(AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION);

    await runAutomationStudioGraph(pageFlow(["check", "read"]), { ...host.options, parking: port });

    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({
      askId: "check.attempt.2",
      kind: "choice",
      parks: true,
      status: "pending",
      text: AUTOMATION_STUDIO_PERSON_NEEDED_TEXT,
      control: { kind: AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND },
      raisedBy: { stage: "execution", nodeId: "check", definitionId: "domain.page.step", attemptId: "check.attempt.2" }
    });
    expect(asked[0]?.options?.map((option) => option.id)).toEqual([AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION]);
  });

  it("goes on down success after Continue, and the next step reads the page fresh", async () => {
    const host = pageHost(new Set(["check"]));
    const { port } = inPlacePort(AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION);

    const trace = await runAutomationStudioGraph(pageFlow(["check", "read"]), { ...host.options, parking: port });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "check", "read", "done"]);
    // The check was not retried by the ladder: the person got past it, once.
    expect(host.executed).toEqual(["check", "read"]);
    const check = attemptOf(trace, "check")!;
    expect(check.status).toBe("failed");
    expect(check.failure).toMatchObject({ category: "user_intervention_required", code: CHECK_CODE });
    expect(check.ask).toMatchObject({ status: "answered", route: "success", personNeeded: true });
    expect(check.recoveryDecision).toBeUndefined();
    // The failed step produced nothing, and nothing it did not produce reaches the next one.
    expect(host.inputs.read).toEqual({});
    expect(attemptOf(trace, "read")).toMatchObject({ status: "succeeded", outputs: { text: "read by read" } });
    // "Continue" is not Flow data: it is not written over an `answer` output.
    expect(trace.values.answer).toBeUndefined();
    expect(trace.values["check.answer"]).toBeUndefined();
  });

  it.each([
    ["the person presses Stop", AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, "the person pressed Stop", "answered"],
    ["nobody answers", null, "nobody answered in time", "expired"]
  ] as const)("ends failed with a person-needed ending when %s, and runs no ladder", async (_case, value, said, status) => {
    const host = pageHost(new Set(["check"]));
    const { port } = inPlacePort(value);

    const trace = await runAutomationStudioGraph(pageFlow(["check", "read"]), { ...host.options, parking: port });

    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("check");
    expect(trace.message).toContain("a person was needed");
    expect(trace.message).toContain(said);
    expect(trace.message).toContain("user_intervention_required");
    expect(trace.message).toContain(CHECK_CODE);
    expect(host.executed).toEqual(["check"]);
    const last = trace.attempts.at(-1)!;
    expect(last.nodeId).toBe("check");
    expect(last.failure).toMatchObject({ category: "user_intervention_required", code: CHECK_CODE });
    expect(last.ask).toMatchObject({ status, route: "failed", personNeeded: true });
    expect(last.recoveryDecision).toBeUndefined();
  });

  it("does not let the Flow's last step succeed by being stopped", async () => {
    const host = pageHost(new Set(["check"]));
    const flow = pageFlow(["check"]);
    const lastStep = { ...flow, edges: flow.edges.filter((edge) => edge.sourceNodeId !== "check"), nodes: flow.nodes.filter((node) => node.id !== "done") };

    const trace = await runAutomationStudioGraph(lastStep, { ...host.options, parking: inPlacePort(AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION).port });

    expect(trace.status).toBe("failed");
    expect(trace.message).toContain("the person pressed Stop");
  });

  it("takes a failed route the Flow authored, as every ask does", async () => {
    const host = pageHost(new Set(["check"]));
    const flow = pageFlow(["check", "read"], [{ id: "e.check.failed", sourceNodeId: "check", targetNodeId: "done", sourcePortId: "failed", targetPortId: "in" }]);

    const trace = await runAutomationStudioGraph(flow, { ...host.options, parking: inPlacePort(AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION).port });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "check", "done"]);
    expect(attemptOf(trace, "check")?.recoveryDecision).toBeUndefined();
  });

  it("fails as it always did when no parking port is bound: nobody asked, the ladder decides", async () => {
    const host = pageHost(new Set(["check"]));

    const trace = await runAutomationStudioGraph(pageFlow(["check", "read"]), host.options);

    expect(trace.status).toBe("failed");
    expect(trace.parked).toBeUndefined();
    const check = attemptOf(trace, "check")!;
    expect(check.ask).toBeUndefined();
    expect(check.recoveryDecision).toBeDefined();
    expect(check.failure).toMatchObject({ category: "user_intervention_required", code: CHECK_CODE });
    expect(trace.message ?? "").not.toContain("a person was needed");
  });

  it("does not add a question to a step that raised its own", async () => {
    const asked: AutomationStudioAsk[] = [];
    const flow = pageFlow(["check"]);
    const trace = await runAutomationStudioGraph(flow, {
      now: () => NOW,
      nativeNodeExecutor: () => Promise.resolve({
        result: {
          ...CHECK_RESULT,
          effects: [{ type: "ask.requested", payload: { kind: "confirm", parks: true, text: "Own question?" } }]
        }
      }),
      parking: { open: (ask) => void asked.push(ask) }
    });

    expect(trace.status).toBe("waiting");
    expect(asked.map((ask) => ask.text)).toEqual(["Own question?"]);
    expect(attemptOf(trace, "check")?.ask?.personNeeded).toBeUndefined();
  });
});

describe("a run parked durably on a person-needed ask", () => {
  async function parkedAtCheck(): Promise<{ trace: AutomationStudioGraphExecutionTrace; host: ReturnType<typeof pageHost>; flow: AutomationStudioFlowDocument }> {
    const host = pageHost(new Set(["check"]));
    const flow = pageFlow(["check", "read"]);
    const trace = await runAutomationStudioGraph(flow, { ...host.options, parking: { open: () => undefined } });
    return { trace, host, flow };
  }

  it("parks with the marked ask and its routes", async () => {
    const { trace } = await parkedAtCheck();

    expect(trace.status).toBe("waiting");
    expect(trace.parked?.ask.control?.kind).toBe(AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND);
    expect(trace.parked?.routes).toEqual({ granted: "success", denied: "failed", timedOut: "failed" });
    expect(trace.parked?.expiresAtMs).toBe(NOW + 300_000);
    expect(attemptOf(trace, "check")?.ask).toMatchObject({ status: "pending", personNeeded: true });
  });

  it("resumes down success on Continue without running the checked step again", async () => {
    const { trace, host, flow } = await parkedAtCheck();

    const resumed = await resumeAutomationStudioGraph({ flow, trace, resumption: { kind: "answer", answer: choice(trace.parked!.ask.askId, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION) }, options: host.options });

    expect(resumed.outcome).toBe("resumed");
    const run = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(run.status).toBe("succeeded");
    expect(run.attempts.map((attempt) => attempt.nodeId)).toEqual(["start", "check", "read", "done"]);
    expect(host.executed).toEqual(["check", "read"]);
    expect(attemptOf(run, "check")?.ask).toMatchObject({ status: "answered", route: "success", personNeeded: true });
  });

  it.each([
    ["Stop", { kind: "answer" as const, answer: choice("check.attempt.2", AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION) }, NOW, "the person pressed Stop"],
    ["nobody answering", { kind: "timeout" as const }, NOW + 300_000, "nobody answered in time"]
  ])("resumes down failed on %s and ends with the person-needed ending", async (_case, resumption, resumedAt, said) => {
    const { trace, host, flow } = await parkedAtCheck();

    const resumed = await resumeAutomationStudioGraph({ flow, trace, resumption, options: { ...host.options, now: () => resumedAt } });

    expect(resumed.outcome).toBe("resumed");
    const run = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    expect(run.status).toBe("failed");
    expect(run.message).toContain(said);
    expect(run.message).toContain(CHECK_CODE);
    expect(host.executed).toEqual(["check"]);
    const last = run.attempts.at(-1)!;
    expect(last.failure).toMatchObject({ category: "user_intervention_required", code: CHECK_CODE });
    expect(last.recoveryDecision).toBeUndefined();
  });
});

describe("a check that is still there after Continue", () => {
  const steps = ["one", "two", "three", "four"];

  it(`stops asking after ${AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN} asks and ends with the person-needed ending`, async () => {
    const host = pageHost(new Set(steps));
    const { asked, port } = inPlacePort(AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION);

    const trace = await runAutomationStudioGraph(pageFlow(steps), { ...host.options, parking: port });

    expect(asked).toHaveLength(AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN);
    expect(trace.status).toBe("failed");
    expect(trace.currentNodeId).toBe("four");
    expect(trace.message).toContain(`asked ${AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN} times`);
    expect(trace.message).toContain(CHECK_CODE);
    const last = trace.attempts.at(-1)!;
    expect(last).toMatchObject({ nodeId: "four", failure: { category: "user_intervention_required", code: CHECK_CODE } });
    expect(last.ask).toBeUndefined();
    expect(last.recoveryDecision).toBeUndefined();
    expect(host.executed).toEqual(steps);
  });

  it("keeps the count across durable parks", async () => {
    const host = pageHost(new Set(steps));
    const flow = pageFlow(steps);
    const options = { ...host.options, parking: { open: () => undefined } };
    let trace = await runAutomationStudioGraph(flow, options);
    let parks = 0;
    while (trace.status === "waiting" && parks < 10) {
      parks += 1;
      const resumed = await resumeAutomationStudioGraph({ flow, trace, resumption: { kind: "answer", answer: choice(trace.parked!.ask.askId, AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION) }, options });
      trace = (resumed as { trace: AutomationStudioGraphExecutionTrace }).trace;
    }

    expect(parks).toBe(AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN);
    expect(trace.status).toBe("failed");
    expect(trace.message).toContain(`asked ${AUTOMATION_STUDIO_PERSON_NEEDED_ASKS_PER_RUN} times`);
  });
});
