// `settle: true` on the run gate, under the real engine (t870, plan D6): what a real run does goes
// on the attempt's record as it happens, nothing lasting is done twice across a by-hand read and
// the engine's For Each, and a press that dies leaves a may-have-landed. No model, Lab or browser;
// a lending library's loans stand in, unrelated to any realistic scenario.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../../../../engine/automation/defensive/index.ts";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed, parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActRecordData } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate, automationStudioAnswerFirstRunActNodeAnswer } from "../index.ts";

const PRESS = "library.press";
const RENEW = { selector: ".renew", element: { text: "Renew" } };
const WORDS = { what: "Renewed a loan", where: "On the loans page" };
const declared = { declaredConsequences: ["modify_existing"] };

type Native = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;
type Execution = NonNullable<Awaited<ReturnType<Native>>>;
type Result = Execution["result"];

const pressNode = (id = "press", metadata: AutomationStudioFlowNode["metadata"] = declared, label = "Renew the loan"): AutomationStudioFlowNode => ({ id, label, definitionId: PRESS, parameterValues: RENEW, ...(metadata ? { metadata } : {}) });
const oneStep = (node = pressNode()) => graph("graph.one", [{ id: "start", definitionId: "builtin.control.start" }, node, { id: "done", definitionId: "builtin.control.end" }], [edge("start", node.id, "next"), edge(node.id, "done")]);

function eachRow(): ReturnType<typeof graph> {
  const nodes: AutomationStudioFlowNode[] = [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "read", definitionId: "library.read" },
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

/** A do-while over one step that carries no row, as the assembler writes it (`components/automation/control-flow/repeat.ts`). */
function repeating(most: number, node = pressNode()): ReturnType<typeof graph> {
  return graph("graph.repeat", [
    { id: "start", definitionId: "builtin.control.start" },
    { id: "again", definitionId: "builtin.control.repeat", parameterValues: { most } },
    node,
    { id: "done", definitionId: "builtin.control.end" }
  ], [edge("start", "again", "next"), edge("again", node.id, "body"), edge(node.id, "again"), edge("again", "done", "done")]);
}

function counted(rows: JsonObject[] = [], answer: (node: AutomationStudioFlowNode, press: number) => Result = () => ({ status: "success", route: "success", outputs: { success: true } })) {
  const presses: Array<JsonValue | undefined> = [];
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    delay: async () => undefined,
    nativeNodeExecutor: async ({ node, inputs }) => {
      if (node.definitionId === "library.read") return { result: { status: "success", route: "success", outputs: { rows } } };
      presses.push(inputs.item);
      return { result: answer(node, presses.length) };
    }
  };
  return { options, presses };
}

function writing(asked?: number) {
  const written: AutomationStudioAttemptActRecordData[] = [];
  const record = new AutomationStudioAttemptActRecord({ persist: async (data) => { written.push(data); }, ...(asked ? { asked: () => asked } : {}) });
  return { record, written };
}

function restarted(written: readonly AutomationStudioAttemptActRecordData[]): AutomationStudioAttemptActRecord {
  const read = parseAutomationStudioAttemptActRecordData(JSON.parse(JSON.stringify(written.at(-1))));
  if (!read.ok) throw new Error(read.issues.join(", "));
  return new AutomationStudioAttemptActRecord({ seed: read.data });
}

const settling = (options: AutomationStudioGraphExecutionOptions, record: AutomationStudioAttemptActRecord) => automationStudioAnswerFirstRunActGate(options, { record, settle: true });
const SAME_PRESS = { actionId: PRESS, parameters: RENEW, consequences: ["modify_existing"], stage: "exploration" as const };
const failedAs = (effect: "unacted" | "ambiguous" | undefined, over: JsonObject = {}): Result => ({ status: "failed", route: "failed", outputs: {}, message: "It did not go.", failure: { category: "ambiguous_or_unknown", code: "library.failed", retryable: effect === "unacted", stage: "dispatch", ...(effect ? { effect } : {}), ...over } as NonNullable<Result["failure"]> });

describe("what it records", () => {
  it("a landed step, at stage run, with the node's own consequences, its label and its row, as it happens", async () => {
    const { options } = counted([{ title: "Old Roads", member: "Ann Lee" }]);
    const { record } = writing();
    await runAutomationStudioGraph(eachRow(), settling(options, record));
    expect(record.data().acts).toEqual([expect.objectContaining({ stage: "run", classes: ["modify_existing"], state: "landed", what: "Renew the loan", where: "On the site", rowIdentity: expect.stringMatching(/^sha256:/u) })]);
    expect(record.rowDone({ book: "Old Roads", borrower: "Ann Lee" })).toBe(true);
    expect(record.rowDone({ book: "The Long Winter", borrower: "Ann Lee" })).toBe(false);
  });

  it("a step's label the contract's screen refuses is not said: the control's own word is, and the class's line only where it has none", async () => {
    const { options } = counted();
    const { record } = writing();
    await runAutomationStudioGraph(oneStep(pressNode("press", declared, "<b>Renew</b>")), settling(options, record));
    expect(record.acts()).toEqual([expect.objectContaining({ what: "Renew" })]);
    expect(JSON.stringify(record.acts())).not.toContain("<b>");
  });

  it("not a step the node reports as failed before anything acted, and the engine's retry goes ahead", async () => {
    const { options, presses } = counted([], (_node, press) => press === 1 ? failedAs("unacted") : { status: "success", route: "success", outputs: {} });
    const { record } = writing();
    await runAutomationStudioGraph(oneStep(), settling(options, record));
    expect(presses).toHaveLength(2);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });

  it("as may have landed, a step whose failure says it may have, and the same failure saying nothing, as the engine reads it", async () => {
    for (const answer of [failedAs("ambiguous"), failedAs(undefined)]) {
      const { options, presses } = counted([], () => answer);
      const { record } = writing();
      const trace = await runAutomationStudioGraph(oneStep(), settling(options, record));
      expect(presses).toHaveLength(1);
      expect(trace.status).toBe("failed");
      expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
      expect(record.acts()[0]?.state).not.toBe("landed");
    }
  });

  it("as may have landed, a step that threw, and never presses it again", async () => {
    const presses: string[] = [];
    const { record, written } = writing();
    const options: AutomationStudioGraphExecutionOptions = {
      inputs: {}, delay: async () => undefined,
      nativeNodeExecutor: async () => {
        presses.push("press");
        throw new TypeError("the socket went away");
      }
    };
    await runAutomationStudioGraph(oneStep(), settling(options, record)).catch(() => undefined);
    await record.flushed();
    expect(presses).toHaveLength(1);
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("nothing for a step that pressed nothing: already in its state, waiting or skipped", () => {
    const nothing = { applied: false, uncertain: false };
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "success", outputs: { result: { skipped: "already_in_state" } } })).toEqual(nothing);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "success", outputs: { skipped: "already_in_state" } })).toEqual(nothing);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "waiting" })).toEqual(nothing);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "skipped" })).toEqual(nothing);
  });

  it("reads a failure found finding the target as nothing acted, and any word of doubt in a success as may have", () => {
    const nothing = { applied: false, uncertain: false };
    const may = { applied: false, uncertain: true };
    expect(automationStudioAnswerFirstRunActNodeAnswer(failedAs(undefined, { stage: "target_resolution" }))).toEqual(nothing);
    expect(automationStudioAnswerFirstRunActNodeAnswer(failedAs(undefined, { category: "target_not_found" }))).toEqual(nothing);
    expect(automationStudioAnswerFirstRunActNodeAnswer(undefined)).toEqual(may);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "success", outputs: { result: { reason: "outcome_uncertain" } } })).toEqual(may);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "success", outputs: { result: { effectUncertain: "The page drew no change." } } })).toEqual(may);
    expect(automationStudioAnswerFirstRunActNodeAnswer({ status: "success", outputs: { result: {} } })).toEqual({ applied: true, uncertain: false });
  });

  it("nothing for a step that declares nothing lasting, read or press: the record can only hold what it would refuse", async () => {
    const { options, presses } = counted([{ title: "Old Roads" }]);
    const { record, written } = writing();
    await runAutomationStudioGraph(repeating(2, pressNode("press", {})), settling(options, record));
    await record.flushed();
    expect(presses).toHaveLength(2);
    expect(written).toEqual([]);
    expect(record.data().acts).toEqual([]);
  });

  it("reads where Core keeps a step's declaration: the gate restates its key, so this fails if the two part", () => {
    expect(AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY).toBe("declaredConsequences");
  });

  it("a node marked destructive, though it names no class", async () => {
    const marked = counted();
    const destructive = writing();
    await runAutomationStudioGraph(repeating(2, pressNode("press", { destructive: true })), settling(marked.options, destructive.record));
    expect(marked.presses).toHaveLength(1);
  });

  it("takes the classes a floor names, with what the step declared", async () => {
    const { options } = counted();
    const { record } = writing();
    await runAutomationStudioGraph(oneStep(), settling({ ...options, resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: ["delete"] }) }, record));
    expect(record.acts()[0]?.classes).toEqual(expect.arrayContaining(["modify_existing", "delete"]));
  });
});

describe("without settle", () => {
  it("records nothing, writes nothing, and presses what it pressed before, on every pass", async () => {
    const { options, presses } = counted();
    const { record, written } = writing();
    const options2 = automationStudioAnswerFirstRunActGate(options, { record });
    const trace = await runAutomationStudioGraph(repeating(3, pressNode("press", {})), options2);
    await record.flushed();
    expect(trace.status).toBe("succeeded");
    expect(presses).toHaveLength(3);
    expect(written).toEqual([]);
    expect(record.data().acts).toEqual([]);
    expect(options2.resolveActionEffect).toBeUndefined();
  });

  it("says what it said when it holds an act back", async () => {
    const { options } = counted();
    const { record } = writing();
    record.settled(SAME_PRESS, { effectApplied: true, words: WORDS });
    const trace = await runAutomationStudioGraph(oneStep(), automationStudioAnswerFirstRunActGate(options, { record }));
    expect(trace.attempts.find((entry) => entry.nodeId === "press")!.message).toBe("Already done: Renew the loan: it already happened while the task was being worked out, so this run did not do it again.");
  });
});

describe("nothing lasting is done twice", () => {
  const BY_HAND = { title: "Old Roads", member: "Ann Lee", link: "/loans/17", $handle: "t3" };

  it("by a For Each after a by-hand read, across every shape the row can reach it in", async () => {
    const { record } = writing();
    record.settled({ ...SAME_PRESS, row: BY_HAND }, { effectApplied: true, words: WORDS });
    const rows = [
      { book: "Old Roads", borrower: "Ann Lee", href: "https://library.test/loans/17" },
      { book: "The Long Winter", borrower: "Ann Lee", href: "https://library.test/loans/18" }
    ];
    const { options, presses } = counted(rows);
    const trace = await runAutomationStudioGraph(eachRow(), settling(options, record));
    expect(trace.status).toBe("succeeded");
    expect(presses).toEqual([rows[1]]);
    expect(record.acts()).toHaveLength(2);
  });

  it("by one engine run that meets a row again in another shape: refused the same way, and told so", async () => {
    const rows = [
      { title: "Old Roads", member: "Ann Lee", link: "/loans/17" },
      { book: "Old Roads", borrower: "Ann Lee", href: "https://library.test/loans/17" },
      { title: "The Long Winter", member: "Ann Lee", link: "/loans/18" }
    ];
    const { options, presses } = counted(rows);
    const { record } = writing();
    const trace = await runAutomationStudioGraph(eachRow(), settling(options, record));
    expect(trace.status).toBe("succeeded");
    expect(presses).toEqual([rows[0], rows[2]]);
    expect(trace.attempts.filter((entry) => entry.nodeId === "press").map((entry) => entry.message).filter(Boolean)).toEqual(["Already done: Renew the loan: it already happened earlier in this task, so this run did not do it again."]);
  });

  it("across a by-hand act in an earlier attempt, seeded by the helper, and through a second run of the same attempt", async () => {
    const before = writing();
    before.record.settled({ ...SAME_PRESS, row: BY_HAND }, { effectApplied: true, words: WORDS });
    const seed = automationStudioAttemptActSeed({ data: before.record.data() })!;
    const record = new AutomationStudioAttemptActRecord({ seed });
    const rows = [{ book: "Old Roads", borrower: "Ann Lee" }, { book: "Fen Country", borrower: "Ann Lee" }];
    const first = counted(rows);
    await runAutomationStudioGraph(eachRow(), settling(first.options, record));
    expect(first.presses).toEqual([rows[1]]);
    const second = counted(rows);
    await runAutomationStudioGraph(eachRow(), settling(second.options, record));
    expect(second.presses).toEqual([]);
  });

  it("presses every row of a list of plain values once, each its own pass, and none again", async () => {
    const rows = ["Old Roads", "Fen Country"] as unknown as JsonObject[];
    const { options, presses } = counted(rows);
    const { record } = writing();
    await runAutomationStudioGraph(eachRow(), settling(options, record));
    expect(presses).toEqual(rows);
    expect(record.rowDone({ book: "Old Roads", member: "Ann Lee" })).toBe(true);
    const again = counted(rows);
    await runAutomationStudioGraph(eachRow(), settling(again.options, record));
    expect(again.presses).toEqual([]);
  });

  it("does not repeat an act that may have landed, and says it may have", async () => {
    const { record } = writing();
    record.settled(SAME_PRESS, { effectApplied: false, uncertain: true, words: WORDS });
    const { options, presses } = counted();
    const trace = await runAutomationStudioGraph(oneStep(), settling(options, record));
    expect(presses).toEqual([]);
    expect(trace.attempts.find((entry) => entry.nodeId === "press")!.message).toMatch(/may already have happened earlier in this task/u);
  });
});

describe("a repeat over a step with no row", () => {
  it("with no count in the request presses once: the Flow's repeat is a model's and raises nothing, and the run goes on to its end", async () => {
    const { options, presses } = counted();
    const { record } = writing();
    const trace = await runAutomationStudioGraph(repeating(5), settling(options, record));
    expect(trace.status).toBe("succeeded");
    expect(presses).toHaveLength(1);
    expect(trace.attempts.filter((entry) => entry.nodeId === "again").map((entry) => entry.route)).toEqual(["body", "body", "body", "body", "body", "done"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", what: "Renew the loan" })]);
  });

  it("presses as many times as the person asked, no more, whatever the repeat says", async () => {
    const { options, presses } = counted();
    const { record } = writing(3);
    await runAutomationStudioGraph(repeating(5), settling(options, record));
    expect(presses).toHaveLength(3);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", what: "Renew the loan (3 times)" })]);
  });

  it("presses that many across three separate steps of one control, too", async () => {
    const { options, presses } = counted();
    const { record } = writing(3);
    const nodes = [pressNode("one"), pressNode("two"), pressNode("three"), pressNode("four")];
    const flow = graph("graph.steps", [{ id: "start", definitionId: "builtin.control.start" }, ...nodes, { id: "done", definitionId: "builtin.control.end" }], [
      edge("start", "one", "next"), edge("one", "two"), edge("two", "three"), edge("three", "four"), edge("four", "done")
    ]);
    await runAutomationStudioGraph(flow, settling(options, record));
    expect(presses).toHaveLength(3);
  });

  it("counts what landed by hand before the run: the run presses only what is left", async () => {
    const { record } = writing(3);
    record.settled(SAME_PRESS, { effectApplied: true, words: WORDS });
    const { options, presses } = counted();
    await runAutomationStudioGraph(repeating(5), settling(options, record));
    expect(presses).toHaveLength(2);
  });

  it("stops at a press that may have landed, count or no count: nobody has looked", async () => {
    const { options, presses } = counted([], (_node, press) => press === 2 ? failedAs("ambiguous") : { status: "success", route: "success", outputs: {} });
    const { record } = writing(3);
    await runAutomationStudioGraph(repeating(5), settling(options, record));
    expect(presses).toHaveLength(2);
    expect(record.acts()[0]?.state).toBe("may_have_landed");
  });
});

describe("a web step: the node answers, and its press is sent as an output after", () => {
  const OUTPUT = { type: "policy.output.dispatch", payload: { outputId: PRESS, parameters: RENEW } };

  function sending(send: (written: AutomationStudioAttemptActRecordData[]) => Promise<Result | undefined>, effects = [OUTPUT]) {
    const { record, written } = writing();
    const options: AutomationStudioGraphExecutionOptions = {
      inputs: {}, runtimeCapabilities: ["policy-output", "io"], delay: async () => undefined,
      nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {}, effects } }),
      effectDispatcher: async () => await send(written)
    };
    return { record, written, gated: settling(options, record) };
  }

  it("is on the record as may have landed while its output is out, and landed only once that answers", async () => {
    let during: string[] | undefined;
    const { record, gated } = sending(async (written) => {
      during = written.at(-1)?.acts.map((act) => act.state);
      return { status: "success", route: "success", outputs: {} };
    });
    await runAutomationStudioGraph(oneStep(), gated);
    expect(during).toEqual(["may_have_landed"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });

  it("is not landed when its output failed and says nothing acted, and may have landed when it says it may have", async () => {
    const unacted = sending(async () => failedAs("unacted"));
    await runAutomationStudioGraph(oneStep(), { ...unacted.gated, retryPolicy: { maxAttempts: 1, backoffMs: [] } });
    expect(unacted.record.acts()).toEqual([]);
    const ambiguous = sending(async () => failedAs("ambiguous"));
    await runAutomationStudioGraph(oneStep(), ambiguous.gated);
    expect(ambiguous.record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("may have landed when its output throws, or answers nothing", async () => {
    const threw = sending(async () => { throw new TypeError("the socket went away"); });
    await runAutomationStudioGraph(oneStep(), threw.gated).catch(() => undefined);
    expect(threw.record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    const silent = sending(async () => undefined);
    await runAutomationStudioGraph(oneStep(), silent.gated);
    expect(silent.record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("says nothing was pressed when the output finds the page already in its state", async () => {
    const { record, gated } = sending(async () => ({ status: "success", route: "success", outputs: { result: { skipped: "already_in_state" } } }));
    await runAutomationStudioGraph(oneStep(), gated);
    expect(record.acts()).toEqual([]);
  });

  it("is settled by the last of several outputs", async () => {
    let sends = 0;
    let during: string[] | undefined;
    const { record, gated } = sending(async (written) => {
      sends += 1;
      if (sends === 2) during = written.at(-1)?.acts.map((act) => act.state);
      return { status: "success", route: "success", outputs: {} };
    }, [OUTPUT, OUTPUT]);
    await runAutomationStudioGraph(oneStep(), gated);
    expect(sends).toBe(2);
    expect(during).toEqual(["may_have_landed"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });
});

describe("a Core node, whose output is its whole act", () => {
  const policy = (metadata: AutomationStudioFlowNode["metadata"] = declared): AutomationStudioFlowNode => ({ id: "act", label: "Renew the loan", definitionId: "builtin.policy.action", parameterValues: { outputId: "output.renew", parameters: RENEW }, ...(metadata ? { metadata } : {}) });

  function dispatching(answer: () => Result | Promise<Result> = () => ({ status: "success", route: "success", outputs: {} })) {
    const sent: JsonValue[] = [];
    const options: AutomationStudioGraphExecutionOptions = {
      inputs: {}, runtimeCapabilities: ["policy-output", "io"], delay: async () => undefined,
      effectDispatcher: async (effect) => {
        sent.push(effect.payload ?? null);
        return await answer();
      }
    };
    return { options, sent };
  }

  it("is recorded by what its node declared, read as the engine asks about the node, and not sent twice", async () => {
    const { options, sent } = dispatching();
    const { record } = writing();
    const trace = await runAutomationStudioGraph(repeating(3, policy()), settling(options, record));
    expect(trace.status).toBe("succeeded");
    expect(sent).toHaveLength(1);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", what: "Renew the loan", classes: ["modify_existing"] })]);
  });

  it("is sent every pass, and held by nothing, where its node declared nothing", async () => {
    const { options, sent } = dispatching();
    const { record } = writing();
    await runAutomationStudioGraph(repeating(3, policy({})), settling(options, record));
    expect(sent).toHaveLength(3);
    expect(record.data().acts).toEqual([]);
  });

  it("may have landed when it throws, and is on what was written before it is sent", async () => {
    let during: string[] | undefined;
    const { record, written } = writing();
    const { options } = dispatching(() => {
      during = written.at(-1)?.acts.map((act) => act.state);
      throw new TypeError("the socket went away");
    });
    await runAutomationStudioGraph(oneStep(policy()), settling(options, record)).catch(() => undefined);
    expect(during).toEqual(["may_have_landed"]);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });
});

describe("a process that dies mid-press", () => {
  const request = { node: pressNode(), inputs: {} };

  it("whose node never returns leaves it as may have landed, and a new record refuses it until a look", async () => {
    let reached = () => undefined as void;
    const sending = new Promise<void>((resolve) => { reached = resolve; });
    const { record, written } = writing();
    const gated = settling({
      inputs: {},
      nativeNodeExecutor: () => {
        reached();
        return new Promise<Execution>(() => undefined);
      }
    }, record);
    void gated.nativeNodeExecutor!(request);
    await sending;
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed", stage: "run" })]);
    const fresh = restarted(written);
    expect(fresh.admit(SAME_PRESS).kind).toBe("look_first");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
    fresh.looked();
    expect(fresh.admit(SAME_PRESS).kind).toBe("run");
    expect(fresh.acts().map((act) => act.state)).toEqual(["may_have_landed"]);
  });

  it("whose output never returns leaves it the same, the node's answer having said nothing of it", async () => {
    let reached = () => undefined as void;
    const sending = new Promise<void>((resolve) => { reached = resolve; });
    const { record, written } = writing();
    const gated = settling({
      inputs: {},
      nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: PRESS, parameters: RENEW } }] } }),
      effectDispatcher: () => {
        reached();
        return new Promise<Result>(() => undefined);
      }
    }, record);
    await gated.nativeNodeExecutor!(request);
    void gated.effectDispatcher!({ type: "policy.output.dispatch", payload: { outputId: PRESS, parameters: RENEW } });
    await sending;
    expect(written.at(-1)!.acts).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    expect(restarted(written).admit(SAME_PRESS).kind).toBe("look_first");
  });

  it("closes an act whose outputs were never all sent, when the next step comes, as may have landed", async () => {
    const { record } = writing();
    const gated = settling({
      inputs: {},
      nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {}, effects: [{ type: "policy.output.dispatch", payload: { outputId: PRESS, parameters: RENEW } }] } }),
      effectDispatcher: async () => ({ status: "success", route: "success", outputs: {} })
    }, record);
    await gated.nativeNodeExecutor!(request);
    await gated.nativeNodeExecutor!({ node: { ...pressNode("other"), parameterValues: { selector: ".other", element: { text: "Other" } } }, inputs: {} });
    expect(record.acts()[0]?.state).toBe("may_have_landed");
  });

  it("a record that cannot be written sends nothing: the step fails as a thing that certainly did not happen", async () => {
    const pressed: string[] = [];
    const record = new AutomationStudioAttemptActRecord({ persist: async () => { throw new Error("disk full"); } });
    const gated = settling({
      inputs: {},
      nativeNodeExecutor: async () => {
        pressed.push("press");
        return { result: { status: "success", route: "success", outputs: {} } };
      }
    }, record);
    const execution = await gated.nativeNodeExecutor!(request);
    expect(pressed).toEqual([]);
    expect(execution?.result).toMatchObject({ status: "failed", failure: { code: "answer_first.act_not_recorded", effect: "unacted", retryable: true } });
    expect(execution?.result.message).toMatch(/Nothing was sent/u);
    expect(record.acts()).toEqual([]);
  });

  it("a read adds no write", async () => {
    const { record, written } = writing();
    await runAutomationStudioGraph(eachRow(), settling(counted([]).options, record));
    await record.flushed();
    expect(written).toEqual([]);
  });
});

describe("a step the engine judged after its answer", () => {
  it("is may have landed once its failure is named, and open to a retry after a look", async () => {
    const { options, presses } = counted();
    const { record } = writing();
    const signed = pressNode("press", { ...declared, routeSignatures: { effect: { shows: "a loan" } } });
    const host = { capabilities: [], observeRouteState: () => ({ page: "p" }), routeEffectSeen: () => "not_seen" as const };
    const flow = { ...oneStep(signed), ownerKind: "project", projectId: "p", ownerId: "p" } as unknown as ReturnType<typeof oneStep>;
    const trace = await runAutomationStudioGraph(flow, settling({ ...options, hostRuntime: host as unknown as NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]> }, record));
    const judged = trace.attempts.find((entry) => entry.nodeId === "press")!;
    expect(presses).toHaveLength(1);
    expect(judged.failure).toMatchObject({ code: "core.step.effect_not_seen", stage: "verification" });
    expect(record.acts()[0]?.state).toBe("landed");
    if (judged.failure?.stage === "verification") record.doubted(`node:${judged.nodeId}`);
    expect(record.acts()[0]?.state).toBe("may_have_landed");
    expect(record.admit(SAME_PRESS).kind).toBe("look_first");
    record.looked();
    expect(record.admit(SAME_PRESS).kind).toBe("run");
  });
});

describe("a step that declared nothing", () => {
  const quiet = pressNode("press", {});
  const output = { type: "policy.output.dispatch", payload: { outputId: "library.press.output", parameters: {} } };

  it("is held by the target's own word that it acted, at the node's door", async () => {
    const { options } = counted([], () => failedAs("ambiguous"));
    const { record } = writing();
    await runAutomationStudioGraph(oneStep(quiet), settling(options, record));
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed", classes: [] })]);
    expect(record.admit({ ...SAME_PRESS, consequences: [] }).kind).toBe("look_first");
    record.looked();
    expect(record.admit({ ...SAME_PRESS, consequences: [] }).kind).toBe("run");
  });

  it("is held by it at the output door a web step uses too", async () => {
    const { options } = counted([], () => ({ status: "success", route: "success", outputs: {}, effects: [output] }));
    const { record } = writing();
    const sent: unknown[] = [];
    const answered = await runAutomationStudioGraph(oneStep(quiet), settling({ ...options, effectDispatcher: async (effect) => {
      sent.push(effect);
      return failedAs("ambiguous");
    } }, record));
    expect(sent).toHaveLength(1);
    expect(answered.status).toBe("failed");
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("is nothing on the record where its failure says nothing of an act, or says none was made, and when it worked", async () => {
    for (const answer of [failedAs(undefined), failedAs("unacted"), { status: "success", route: "success", outputs: {} } as Result]) {
      const { options } = counted([], () => answer);
      const { record } = writing();
      await runAutomationStudioGraph(oneStep(quiet), settling(options, record));
      expect(record.acts()).toEqual([]);
    }
  });
});
