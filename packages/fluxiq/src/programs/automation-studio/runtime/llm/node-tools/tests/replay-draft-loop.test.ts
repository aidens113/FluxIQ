// The build's test runs a repeat as a loop (design t252 D6, `../replay-span.ts`).
//
// Before t252 a repeat span was sent once, on the row the build explored, and
// excused as a step the Flow does not always run: live run
// `run-murwcaj0-40e56557` pressed one row's Confirm while exploring, the test
// resent that one press, and nothing ever ran the loop the stored Flow holds.
// Now a span whose list step returned its rows in this test runs once per row,
// in order, each member sent with that row when its node takes one and with its
// bound values resolved for it; a span over a check runs while the check
// replays. Without rows (an older host, a list step that was only checked, a
// node the caller cannot describe) it runs once and is excused, as before.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { replayAutomationStudioFlowDraft, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE, AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE, type AutomationStudioFlowDraftReplayNode } from "../replay-span.ts";

const REPLAYED = "core.replay.replayed";

/** The nodes this library holds: a list read, a press that takes the row, a type that does not, a check. */
const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }, { id: "count", type: "number" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] },
  "node.type": { inputs: [], outputs: [] },
  "node.check": { inputs: [], outputs: [{ id: "found", type: "boolean" }] }
};
const nodeOf = (id: string) => NODES[id];

const ROWS: JsonObject[] = [{ name: "Ada", mutual: 3 }, { name: "Ben", mutual: 5 }];

const state = (path: string, fallback?: JsonValue): JsonObject => ({ $state: { path, ...(fallback === undefined ? {} : { fallback }) } });

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}, parameters: JsonObject = { target: `#s${position}` }, consequences: string[] = []): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters, consequences },
  ranWith: { node, parameters, consequences },
  effect: node === "node.list" || node === "node.check" ? "observe" : "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: `https://site.test/${position}` }, produced: { at: position } },
  ...over
});

/** list, press (repeat over the list through the type), type with a bound input, then a press after the loop. */
const loopDraft = (pressParameters: JsonObject = { target: "#confirm" }, pressConsequences: string[] = []) => [
  step(1, "node.list", {}, { where: "mutual > 2" }),
  step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d3" } }, pressParameters, pressConsequences),
  step(3, "node.type", {}, { text: state("note", "hello"), to: state("item.name") }),
  step(4, "node.press", {}, { target: "#done" })
];

type Call = { callId: string; value: JsonObject };

/** A host: the list returns `rows` (no `outputs` when undefined); `answers` overrides a call's code by its call id. */
function host(options: { rows?: JsonValue; answers?: Record<string, string>; checks?: number } = {}) {
  const calls: Call[] = [];
  let checks = options.checks ?? 0;
  const executeTool = async ({ callId, value }: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED };
    if (value.node === "node.check") {
      const holds = checks > 0;
      checks -= 1;
      return { kind: "llm_evidence_tool_execution", evidence: { holds }, effectApplied: false, resultCode: holds ? REPLAYED : "core.replay.failed" };
    }
    const code = options.answers?.[callId] ?? (value.replay === "verify" ? "core.replay.verified" : REPLAYED);
    return {
      kind: "llm_evidence_tool_execution",
      evidence: { call: callId },
      effectApplied: code === REPLAYED,
      resultCode: code,
      ...(value.node === "node.list" && options.rows !== undefined ? { outputs: { records: options.rows, count: 2 } } : {})
    };
  };
  return { calls, executeTool };
}

const test = (steps: AutomationStudioFlowDraftStep[], executor: ReturnType<typeof host>, withNodes = true, lastingActs?: ReadonlySet<string>) =>
  replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool: executor.executeTool, ...(withNodes ? { nodeOf } : {}), ...(lastingActs ? { lastingActs } : {}) });

describe("a repeat over a list, in the build's test", () => {
  it("runs every member once per row the list returned in this test, in order", async () => {
    const executor = host({ rows: ROWS });
    const replayed = await test(loopDraft(), executor);
    expect(executor.calls.map((call) => call.callId)).toEqual([
      "dryrun.1.reset", "dryrun.1.1",
      "dryrun.1.2.pass.1", "dryrun.1.3.pass.1",
      "dryrun.1.2.pass.2", "dryrun.1.3.pass.2",
      "dryrun.1.4"
    ]);
    expect(replayed.verdict.ok).toBe(true);
    const press = replayed.verdict.outcomes.find((outcome) => outcome.step === 2)!;
    expect(press).toMatchObject({ status: "replayed", passes: [{ pass: 1, status: "replayed", resultCode: REPLAYED }, { pass: 2, status: "replayed", resultCode: REPLAYED }] });
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 4)!.passes).toBeUndefined();
    expect(replayed.observations.filter((each) => each.step === 3).map((each) => [each.pass, each.of])).toEqual([[1, 2], [2, 2]]);
    expect(replayed.observations.find((each) => each.step === 1)!.pass).toBeUndefined();
  });

  it("sends the row only to a member whose node takes it, resolves every member's bindings for the row, and sends no produced with a row", async () => {
    const executor = host({ rows: ROWS });
    await test(loopDraft(), executor);
    const press = executor.calls.find((call) => call.callId === "dryrun.1.2.pass.2")!.value;
    expect(press).toMatchObject({ node: "node.press", item: ROWS[1], parameters: { target: "#confirm" }, replay: "step" });
    expect(press.produced).toBeUndefined();
    const type = executor.calls.find((call) => call.callId === "dryrun.1.3.pass.2")!.value;
    expect(type.item).toBeUndefined();
    // An input takes its test value; a row field is the pass's row.
    expect(type.parameters).toEqual({ text: "hello", to: "Ben" });
    expect(type.produced).toEqual({ at: 3 });
  });

  it("refuses on a pass that did not replay, with that pass's code and page", async () => {
    const executor = host({ rows: ROWS, answers: { "dryrun.1.2.pass.2": "core.replay.unreproducible" } });
    const replayed = await test(loopDraft(), executor);
    expect(replayed.verdict.ok).toBe(false);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 2)).toMatchObject({
      status: "unreproducible", resultCode: "core.replay.unreproducible",
      passes: [{ pass: 1, status: "replayed" }, { pass: 2, status: "unreproducible" }]
    });
    expect(replayed.evidence).toEqual({ callId: "dryrun.1.2.pass.2", toolId: "core.run_node", value: { call: "dryrun.1.2.pass.2" } });
  });

  it("passes a pass the site remembers: the row the build already did", async () => {
    const executor = host({ rows: ROWS, answers: { "dryrun.1.2.pass.1": "core.replay.remembered" } });
    const replayed = await test(loopDraft(), executor);
    expect(replayed.verdict.ok).toBe(true);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 2)!.passes!.map((each) => each.status)).toEqual(["replayed", "replayed"]);
  });

  it("checks a lasting act once per row, never presses it", async () => {
    const executor = host({ rows: ROWS });
    const replayed = await test(loopDraft({ target: "#confirm" }, ["modify_existing"]), executor);
    const presses = executor.calls.filter((call) => call.value.node === "node.press" && call.callId.includes(".pass."));
    expect(presses.map((call) => [call.value.replay, call.value.item])).toEqual([["verify", ROWS[0]], ["verify", ROWS[1]]]);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 2)).toMatchObject({ mode: "verify", status: "replayed", resultCode: "core.replay.verified" });
  });

  it("runs no member for a list with no rows in the test", async () => {
    const executor = host({ rows: [] });
    const replayed = await test(loopDraft(), executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["dryrun.1.reset", "dryrun.1.1", "dryrun.1.4"]);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 2)).toMatchObject({ status: "replayed", passes: [] });
    expect(replayed.verdict.ok).toBe(true);
  });

  it("fails every member, sending none, when the list has more rows than a For Each takes", async () => {
    const executor = host({ rows: Array.from({ length: 101 }, (_, index) => ({ name: `r${index}` })) });
    const replayed = await test(loopDraft(), executor);
    expect(executor.calls.some((call) => call.callId.includes(".pass."))).toBe(false);
    expect(replayed.verdict.ok).toBe(false);
    expect(replayed.verdict.outcomes.filter((outcome) => outcome.step === 2 || outcome.step === 3).map((outcome) => [outcome.status, outcome.resultCode])).toEqual([
      ["failed", AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE],
      ["failed", AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE]
    ]);
  });
});

describe("a repeat the test knows no rows for runs once, excused, as before t252", () => {
  const cases: [string, { rows?: JsonValue }, boolean][] = [
    ["the host sends no outputs", {}, true],
    ["the caller cannot describe the nodes", { rows: ROWS }, false],
    ["the rows are not records", { rows: ["Ada", "Ben"] }, true]
  ];
  for (const [name, options, withNodes] of cases) {
    it(`when ${name}`, async () => {
      const executor = host({ ...options, answers: { "dryrun.1.2": "core.replay.unreproducible" } });
      const replayed = await test(loopDraft(), executor, withNodes);
      expect(executor.calls.map((call) => call.callId)).toEqual(["dryrun.1.reset", "dryrun.1.1", "dryrun.1.2", "dryrun.1.4"]);
      expect(executor.calls[2]!.value.item).toBeUndefined();
      expect(executor.calls[2]!.value.produced).toEqual({ at: 2 });
      expect(replayed.verdict.outcomes.every((outcome) => outcome.passes === undefined)).toBe(true);
      // Step 3's row binding has no row to take, so nothing is sent for it, and the span is excused.
      expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 3)).toMatchObject({ status: "failed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });
      expect(replayed.verdict.ok).toBe(true);
    });
  }

  it("when the list step was only checked", async () => {
    const steps = loopDraft();
    steps[0] = step(1, "node.list", { effect: "mutate" }, { where: "mutual > 2" }, ["modify_existing"]);
    const executor = host({ rows: ROWS });
    const replayed = await test(steps, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["dryrun.1.reset", "dryrun.1.1", "dryrun.1.2", "dryrun.1.4"]);
    expect(replayed.verdict.outcomes.every((outcome) => outcome.passes === undefined)).toBe(true);
  });
});

describe("bindings on a step outside a repeat", () => {
  it("sends an input's test value, and an unchanged call when the step holds no binding", async () => {
    const steps = [step(1, "node.type", {}, { text: state("note", "hello") }), step(2, "node.press")];
    const executor = host();
    const replayed = await test(steps, executor);
    expect(executor.calls[1]!.value).toMatchObject({ parameters: { text: "hello" }, produced: { at: 1 } });
    expect(executor.calls[2]!.value).toEqual({ node: "node.press", parameters: { target: "#s2" }, consequences: [], replay: "step", from: { location: "https://site.test/2" }, produced: { at: 2 } });
    expect(replayed.verdict.ok).toBe(true);
  });

  it("fails a step whose binding has nothing to take it from, sending nothing for it", async () => {
    const steps = [step(1, "node.type", {}, { to: state("item.name") }), step(2, "node.press")];
    const executor = host();
    const replayed = await test(steps, executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["dryrun.1.reset", "dryrun.1.2"]);
    expect(replayed.verdict.outcomes[0]).toMatchObject({ step: 1, status: "failed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });
    expect(replayed.verdict.ok).toBe(false);
  });
});

describe("a repeat over a check", () => {
  const whileDraft = () => [
    step(1, "node.press", {}, { target: "#open" }),
    step(2, "node.check", {}, { target: "#next" }),
    step(3, "node.press", { routing: { kind: "repeat", over: "d2", through: "d3" } }, { target: "#next" }),
    step(4, "node.press", {}, { target: "#done" })
  ];

  it("runs the body while the check replays, asking the check again after each pass", async () => {
    const executor = host({ checks: 3 });
    const replayed = await test(whileDraft(), executor);
    expect(executor.calls.map((call) => call.callId)).toEqual([
      "dryrun.1.reset", "dryrun.1.1", "dryrun.1.2",
      "dryrun.1.3.pass.1", "dryrun.1.2.pass.2",
      "dryrun.1.3.pass.2", "dryrun.1.2.pass.3",
      "dryrun.1.3.pass.3", "dryrun.1.2.pass.4",
      "dryrun.1.4"
    ]);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 3)!.passes).toHaveLength(3);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 2)).toMatchObject({ status: "replayed" });
    expect(replayed.verdict.ok).toBe(true);
  });

  it("fails the body past the For Each bound", async () => {
    const executor = host({ checks: 1000 });
    const replayed = await test(whileDraft(), executor);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 3)).toMatchObject({ status: "failed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_LOOP_BOUND_CODE });
    expect(executor.calls.filter((call) => call.callId.startsWith("dryrun.1.3.pass.")).length).toBe(100);
    expect(replayed.verdict.ok).toBe(false);
  });
});

// t252 merged with lane B (t193 1002-M, C6 and C10): which reason excuses a
// step, on its outcome and on its call. A pass of a repeat the test ran per row
// is excused only by a withheld effect, never as "repeat"; a straight optional
// step that failed is still excused "optional", as lane B made it.
describe("why the test passes over a step, merged with the per-row repeat", () => {
  /** The host above, also keeping the `excusable` each call reached executeTool with. */
  const recording = (options: Parameters<typeof host>[0]) => {
    const inner = host(options);
    const excusable = new Map<string, unknown>();
    return {
      calls: inner.calls,
      excusable,
      executeTool: async (input: Call & { excusable?: string }) => {
        excusable.set(input.callId, input.excusable);
        return inner.executeTool(input);
      }
    };
  };

  it("excuses a span member that fails after a checked lasting act as withheld, on its outcome and on each pass's call", async () => {
    const steps = [
      step(1, "node.press", {}, { target: "#save" }, ["modify_existing"]),
      step(2, "node.list", {}, { where: "mutual > 2" }),
      step(3, "node.press", { routing: { kind: "repeat", over: "d2", through: "d3" } }, { target: "#confirm" })
    ];
    const executor = recording({ rows: ROWS, answers: { "dryrun.1.3.pass.1": "core.replay.failed" } });
    const replayed = await test(steps, executor);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 1)).toMatchObject({ mode: "verify", status: "replayed", resultCode: "core.replay.verified" });
    const member = replayed.verdict.outcomes.find((outcome) => outcome.step === 3)!;
    expect(member).toMatchObject({ status: "failed", withheldBy: 1, excused: "withheld", passes: [{ pass: 1, status: "failed" }, { pass: 2, status: "replayed" }] });
    expect(executor.excusable.get("dryrun.1.3.pass.1")).toBe("withheld");
    expect(executor.excusable.get("dryrun.1.3.pass.2")).toBe("withheld");
  });

  it("gives a span member that fails with no withheld act no excuse, and its calls no excusable: never \"repeat\"", async () => {
    const executor = recording({ rows: ROWS, answers: { "dryrun.1.2.pass.2": "core.replay.failed" } });
    const replayed = await test(loopDraft(), executor);
    const member = replayed.verdict.outcomes.find((outcome) => outcome.step === 2)!;
    expect(member).toMatchObject({ status: "failed", passes: [{ pass: 1, status: "replayed" }, { pass: 2, status: "failed" }] });
    expect(member).not.toHaveProperty("excused");
    expect(member).not.toHaveProperty("withheldBy");
    const passCalls = [...executor.excusable.keys()].filter((callId) => callId.includes(".pass."));
    expect(passCalls).toEqual(["dryrun.1.2.pass.1", "dryrun.1.3.pass.1", "dryrun.1.2.pass.2", "dryrun.1.3.pass.2"]);
    for (const callId of passCalls) expect(executor.excusable.get(callId)).toBeUndefined();
    expect([...executor.excusable.values()]).not.toContain("repeat");
    expect(replayed.verdict.ok).toBe(false);
  });

  it("still excuses a straight optional step that fails as optional, on its outcome and its call (lane B)", async () => {
    const steps = [step(1, "node.press", { routing: { kind: "optional" } }, { target: "#banner" }), step(2, "node.press")];
    const executor = recording({ answers: { "dryrun.1.1": "core.replay.failed" } });
    const replayed = await test(steps, executor);
    expect(replayed.verdict.outcomes[0]).toMatchObject({ step: 1, status: "failed", excused: "optional" });
    expect(replayed.verdict.outcomes[0]!.passes).toBeUndefined();
    expect(executor.excusable.get("dryrun.1.1")).toBe("optional");
    expect(executor.excusable.get("dryrun.1.2")).toBeUndefined();
    expect(replayed.verdict.ok).toBe(true);
  });
});
