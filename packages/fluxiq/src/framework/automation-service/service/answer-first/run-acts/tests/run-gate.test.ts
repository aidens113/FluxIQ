// The gate on a real run, under the real engine: what it does at each door a lasting
// act goes through, row by row, and what it leaves alone (t861, plan D6).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../../../runtime/automation-activity/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioRunGraphOptions } from "../../../runtime-session/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../index.ts";

const PRESS = "domain.press";
const WORDS = { what: "Added a line", where: "On a page" };
const ADD = { selector: ".add", element: { text: "Add" } };
const OAK = { name: "Oak", $handle: "read-1-row-0" };
const ELM = { name: "Elm", $handle: "read-1-row-1" };

let unsubscribe: () => void = () => undefined;
afterEach(() => unsubscribe());

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Flow = ReturnType<typeof graph>;

const declared = { declaredConsequences: ["create_new"] };
const pressNode = (id = "press", parameterValues: JsonObject = ADD, metadata: AutomationStudioFlowNode["metadata"] = declared): AutomationStudioFlowNode => ({ id, label: "Add the line", definitionId: PRESS, parameterValues, ...(metadata ? { metadata } : {}) });

/** Start, a press, end. */
const oneStep = (node = pressNode()) => graph("graph.one", [{ id: "start", definitionId: "builtin.control.start" }, node, { id: "done", definitionId: "builtin.control.end" }], [edge("start", node.id, "next"), edge(node.id, "done")]);

/** Start, a read of rows, a For Each handing each row to a press, end. */
function eachRow(): ReturnType<typeof graph> {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "read", definitionId: "domain.read" },
    { id: "each", definitionId: "builtin.control.for-each" },
    pressNode(),
    { id: "done", definitionId: "builtin.control.end" }
  ];
  const edges: AutomationStudioFlowEdge[] = [
    edge("start", "read", "next"), edge("read", "each"), { ...edge("read", "each", "rows"), targetPortId: "items" },
    edge("each", "press", "body"), { ...edge("each", "press", "item"), targetPortId: "item" }, edge("press", "each"), edge("each", "done", "done")
  ];
  return graph("graph.each", nodes, edges);
}

/** Options whose native door reads rows and counts the presses it is really asked for, with the row each carried. */
function counted(rows: JsonObject[] = []) {
  const presses: Array<JsonValue | undefined> = [];
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    nativeNodeExecutor: async ({ node, inputs }) => {
      if (node.definitionId === "domain.read") return { result: { status: "success", route: "success", outputs: { rows } } };
      presses.push(inputs.item);
      return { result: { status: "success", route: "success", outputs: { success: true } } };
    }
  };
  return { options, presses };
}

function recordWith(...settle: Array<{ parameters?: JsonObject; row?: JsonObject; actionId?: string; uncertain?: true; consequences?: string[] }>): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  for (const { parameters = ADD, row, actionId = PRESS, uncertain, consequences = ["create_new"] } of settle) {
    record.settled({ actionId, parameters, consequences, stage: "exploration", ...(row ? { row } : {}) }, { effectApplied: true, words: WORDS, ...(uncertain ? { uncertain } : {}) });
  }
  return record;
}

async function ran(flow: ReturnType<typeof graph>, options: AutomationStudioGraphExecutionOptions) {
  const seen: ClientGatewayActivity[] = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
  const trace = await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "p" }, () => runAutomationStudioGraph(flow, options));
  return { trace, skipped: seen.filter((event) => event.detail?.skipped?.reason === "already_done") };
}

describe("the native door", () => {
  it("does not dispatch a matching act: the attempt reads success, the run goes on, the chat is told", async () => {
    const { options, presses } = counted();
    const { trace, skipped } = await ran(oneStep(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({}) }));
    expect(presses).toEqual([]);
    expect(trace.status).toBe("succeeded");
    const attempt = trace.attempts.find((entry) => entry.nodeId === "press")!;
    expect(attempt).toMatchObject({ status: "succeeded", route: "success", effects: [] });
    expect(attempt.message).toMatch(/did not do it again/u);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.detail).toMatchObject({ kind: "step", status: "succeeded", ref: "press", title: "Already done: Add the line", skipped: { reason: "already_done", subject: "Add the line" } });
  });

  it("dispatches what is not the act: another target, another action", async () => {
    const { options, presses } = counted();
    const { skipped } = await ran(oneStep(pressNode("press", { selector: ".other", element: { text: "Other" } })), automationStudioAnswerFirstRunActGate(options, { record: recordWith({}) }));
    expect(presses).toHaveLength(1);
    expect(skipped).toEqual([]);
    const other = counted();
    await ran(oneStep(), automationStudioAnswerFirstRunActGate(other.options, { record: recordWith({ actionId: "domain.other" }) }));
    expect(other.presses).toHaveLength(1);
  });

  it("presses every row but the one already done, by the row's own fields, whatever a later read minted", async () => {
    const { options, presses } = counted([{ name: "Oak", $handle: "read-2-row-1" }, { name: "Elm", $handle: "read-2-row-0" }]);
    const { trace, skipped } = await ran(eachRow(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ row: OAK, parameters: { selector: "#oak .add", element: { text: "Add" } } }) }));
    expect(trace.status).toBe("succeeded");
    expect(presses).toEqual([{ name: "Elm", $handle: "read-2-row-0" }]);
    expect(skipped).toHaveLength(1);
  });

  it("presses every row where only another row's act is held", async () => {
    const { options, presses } = counted([OAK]);
    await ran(eachRow(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ row: ELM }) }));
    expect(presses).toEqual([OAK]);
  });

  it("does not repeat an act that may have landed, and says it may have", async () => {
    const { options, presses } = counted();
    const { trace } = await ran(oneStep(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ uncertain: true }) }));
    expect(presses).toEqual([]);
    expect(trace.attempts.find((entry) => entry.nodeId === "press")!.message).toMatch(/may already have happened/u);
  });

  it("never holds back an undeclared press", async () => {
    const { options, presses } = counted();
    await ran(oneStep(pressNode("press", ADD, undefined)), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ consequences: [] }) }));
    expect(presses).toHaveLength(1);
  });

  it("matches a step the Flow no longer declares lasting: it is still the same act", async () => {
    const { options, presses } = counted();
    await ran(oneStep(pressNode("press", ADD, undefined)), automationStudioAnswerFirstRunActGate(options, { record: recordWith({}) }));
    expect(presses).toEqual([]);
  });

  it("knows a step by its plan key where a source named only that", async () => {
    const { options, presses } = counted();
    const record = new AutomationStudioAttemptActRecord({ seed: { kind: "attempt_act_record", schemaVersion: 1, rows: [], acts: [{ id: "act.1", what: "Press", where: "On the site", classes: [], state: "landed", stage: "trial", actions: [], keys: [], handleKeys: [], rows: [], steps: ["step:s2"], lookedSince: false, at: 1 }] } });
    await ran(oneStep(pressNode("press", ADD, { bootstrapSymbolicKey: "s2" })), automationStudioAnswerFirstRunActGate(options, { record }));
    expect(presses).toEqual([]);
  });
});

describe("the output door", () => {
  const policy = (id = "act"): AutomationStudioFlowNode => ({ id, label: "Add the line", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.press", parameters: ADD }, metadata: declared });

  function dispatching() {
    const sent: JsonValue[] = [];
    const options: AutomationStudioGraphExecutionOptions = {
      inputs: {}, runtimeCapabilities: ["policy-output", "io"],
      effectDispatcher: async (effect) => {
        sent.push(effect.payload ?? null);
        return { status: "success", route: "success", outputs: {} };
      }
    };
    return { options, sent };
  }

  it("does not send a Core node's matching output, under the node that fixes it or its own id", async () => {
    const definitions = () => [{ id: PRESS, outputAction: { fixedOutputId: "output.press" } }];
    const byNode = dispatching();
    const { trace, skipped } = await ran(oneStep(policy()), automationStudioAnswerFirstRunActGate(byNode.options, { record: recordWith({}), definitions }));
    expect(byNode.sent).toEqual([]);
    expect(trace.status).toBe("succeeded");
    expect(skipped).toHaveLength(1);
    const byOutput = dispatching();
    await ran(oneStep(policy()), automationStudioAnswerFirstRunActGate(byOutput.options, { record: recordWith({ actionId: "output.press" }) }));
    expect(byOutput.sent).toEqual([]);
  });

  it("sends what is not the act", async () => {
    const { options, sent } = dispatching();
    await ran(oneStep(policy()), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ actionId: "output.other" }) }));
    expect(sent).toHaveLength(1);
  });

  it("sends an admitted native node's outputs uncompared: it was compared with its row, and has none here", async () => {
    const sent: JsonValue[] = [];
    const options: AutomationStudioGraphExecutionOptions = {
      inputs: {}, runtimeCapabilities: ["policy-output", "io"],
      effectDispatcher: async (effect) => {
        sent.push(effect.payload ?? null);
        return { status: "success", route: "success", outputs: {} };
      },
      nativeNodeExecutor: async ({ node }) => node.definitionId === "domain.read"
        ? { result: { status: "success", route: "success", outputs: { rows: [ELM] } } }
        : { result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: PRESS, parameters: ADD } }] } }
    };
    // The act is Oak's, under the very parameters Elm's press sends.
    await ran(eachRow(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ row: OAK }) }));
    expect(sent).toHaveLength(1);
  });
});

describe("the check on what a step brought", () => {
  const signed = () => pressNode("press", ADD, { ...declared, routeSignatures: { effect: { shows: "a line" } } });
  const host = (answer: "not_seen" | "seen") => ({ capabilities: [], observeRouteState: () => ({ page: "p" }), routeEffectSeen: () => answer }) as unknown as Host;
  const flow = () => ({ ...oneStep(signed()), ownerKind: "project", projectId: "p", ownerId: "p" }) as unknown as Flow;

  it("does not fail a step that pressed nothing for an effect not on the page in hand", async () => {
    const { options, presses } = counted();
    options.hostRuntime = host("not_seen");
    const { trace } = await ran(flow(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({}) }));
    expect(presses).toEqual([]);
    expect(trace.status).toBe("succeeded");
  });

  it("still holds a step that really pressed to its effect", async () => {
    const { options, presses } = counted();
    options.hostRuntime = host("not_seen");
    const { trace } = await ran(flow(), automationStudioAnswerFirstRunActGate(options, { record: recordWith({ actionId: "domain.other" }) }));
    expect(presses).toHaveLength(1);
    expect(trace.attempts.find((entry) => entry.nodeId === "press")!.failure?.code).toBe("core.step.effect_not_seen");
  });

  it("keeps the host otherwise as it was, its methods on itself", () => {
    class Held {
      readonly tag = "held";
      capabilities = [];
      routeEffectSeen() {
        return "unknown" as const;
      }
      observed() {
        return this.tag;
      }
    }
    const { options } = counted();
    options.hostRuntime = new Held() as unknown as Host;
    const gated = automationStudioAnswerFirstRunActGate(options, { record: recordWith({}) }).hostRuntime as unknown as Held;
    expect(gated.observed()).toBe("held");
    expect(gated.routeEffectSeen()).toBe("unknown");
  });
});

describe("the options of a run", () => {
  const abort = new AbortController();

  it("are exactly today's without a project, or with nothing to carry: the same object, no wrapper", async () => {
    const memory = { paths: { root: undefined }, flows: { flowDirectory: () => "" }, projects: { ensureProjectStructure: async () => undefined } };
    const owner = {};
    const input = { signal: abort.signal, authorizedDomainIds: [] };
    const plain = automationStudioRunGraphOptions(input);
    const without = await automationStudioRunGraphOptions({ ...input, carryActs: { ...memory, owner, projectId: undefined, flowId: "f", runId: "r" } });
    const empty = await automationStudioRunGraphOptions({ ...input, carryActs: { ...memory, owner, projectId: "p", flowId: "f", runId: "r" } });
    expect(without).toStrictEqual(plain);
    expect(empty).toStrictEqual(plain);
  });

  it("a trial, which names no carried acts, stays synchronous and ungated", () => {
    const options = automationStudioRunGraphOptions({ signal: abort.signal, authorizedDomainIds: [] });
    expect(options).not.toBeInstanceOf(Promise);
    expect(options.nativeNodeExecutor).toBeUndefined();
  });
});
