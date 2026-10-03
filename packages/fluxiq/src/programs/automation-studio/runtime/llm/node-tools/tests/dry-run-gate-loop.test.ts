// The gate over a test that ran a repeat as a loop (design t252 D6).
//
// A written step never ran in the build, so the test is the only thing that
// shows it works. A written step inside a repeat whose list had no rows in the
// test ran zero times: the gate refuses the completion
// `llm_evidence_loop.full_run_required`, naming it `not_reached`, rather than
// pass a Flow nothing ever ran that step of. A recorded step in the same span
// ran live while exploring, and zero rows is a Flow that has nothing to do.
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { automationStudioFlowDraftDryRunGate, type AutomationStudioFlowDraftTestReport, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayNode } from "../replay-span.ts";

const REPLAYED = "core.replay.replayed";

const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: {}, consequences: [] },
  ranWith: { node, parameters: { target: `#s${position}` }, consequences: [] },
  effect: node === "node.list" ? "observe" : "mutate",
  effectApplied: node === "node.list",
  disposition: "kept",
  proposes: true,
  replay: { from: { location: "https://site.test/" } },
  ...over
});

function harness(steps: AutomationStudioFlowDraftStep[], rows: JsonValue[], options: { nodeOf?: false; pressCode?: string } = {}) {
  const shown: { callId: string; toolId: string; value: JsonValue }[] = [];
  const reports: AutomationStudioFlowDraftTestReport[] = [];
  let moved = 0;
  const executeTool = async ({ value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => ({
    kind: "llm_evidence_tool_execution",
    evidence: { ok: true },
    effectApplied: value.replay === "reset",
    resultCode: value.node === "node.press" ? options.pressCode ?? REPLAYED : REPLAYED,
    ...(value.node === "node.list" ? { outputs: { records: rows } } : {})
  });
  const gate = automationStudioFlowDraftDryRunGate({
    enabled: true,
    requireRunnable: true,
    steps,
    executeTool,
    ...(options.nodeOf === false ? {} : { nodeOf: (id: string) => NODES[id] }),
    accountEvidence: () => 0,
    showEvidence: (entry) => { shown.push(entry); },
    targetMoved: () => { moved += 1; },
    observed: (report) => { reports.push(report); }
  });
  return { gate, shown, reports, moved: () => moved };
}

const loop = (written: boolean) => [
  step(1, "node.list"),
  step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d2" }, ...(written ? { written: true as const, effectApplied: false } : {}) })
];

describe("a written step a repeat never reached in the test", () => {
  it("is refused full_run_required, named not_reached, and the test is not reported as passed", async () => {
    const run = harness(loop(true), []);
    expect(await run.gate()).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    expect(run.shown.at(-1)!.value).toMatchObject({ code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE, steps: [{ step: 2, replayed: "not_reached" }] });
    expect(run.reports).toEqual([]);
    // The test ran, so the target moved, and the step carries what it answered.
    expect(run.moved()).toBe(1);
    expect(loop(true)[1]!.replayed).toBeUndefined();
  });

  it("passes once the list has rows and the written step replays on each", async () => {
    const steps = loop(true);
    const run = harness(steps, [{ name: "Ada" }, { name: "Ben" }]);
    expect(await run.gate()).toBeUndefined();
    expect(steps[1]!.replayed).toMatchObject({ status: "replayed", passes: [{ pass: 1 }, { pass: 2 }] });
    expect(run.reports[0]!.observations.filter((each) => each.step === 2).map((each) => [each.pass, each.of])).toEqual([[1, 2], [2, 2]]);
  });

  it("does not refuse a recorded step the empty list never reached", async () => {
    const run = harness(loop(false), []);
    expect(await run.gate()).toBeUndefined();
    expect(run.reports).toHaveLength(1);
  });
});

// t252-w9: a repeat the test cannot walk row by row (no node lookup, a list step
// that did not replay clean, no rows given back) is sent once on the explored
// row and excused as conditional. A written member that did not pass there
// never ran anywhere, so it is not reached either.
describe("a written step of a repeat the test could not walk", () => {
  it("is refused not_reached when it did not pass on the explored row", async () => {
    const steps = loop(true);
    const run = harness(steps, [{ name: "Ada" }], { nodeOf: false, pressCode: "core.replay.failed" });
    expect(await run.gate()).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    expect(run.shown.at(-1)!.value).toMatchObject({ code: AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE, steps: [{ step: 2, replayed: "not_reached" }] });
    expect(steps[1]!.replayed).toMatchObject({ status: "failed" });
    expect(steps[1]!.replayed?.passes).toBeUndefined();
    expect(run.reports).toEqual([]);
  });

  it("is refused not_reached when the list step answered no rows to walk", async () => {
    const steps = loop(true);
    // The list answers rows that are not records, so the span is not planned.
    const run = harness(steps, ["Ada"], { pressCode: "core.replay.unreproducible" });
    expect(await run.gate()).toEqual({ issueCodes: [AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE] });
    expect(run.shown.at(-1)!.value).toMatchObject({ steps: [{ step: 2, replayed: "not_reached" }] });
  });

  it("passes when it passed on the explored row", async () => {
    const run = harness(loop(true), [], { nodeOf: false });
    expect(await run.gate()).toBeUndefined();
    expect(run.reports).toHaveLength(1);
  });

  it("does not refuse a recorded step that did not pass on the explored row", async () => {
    const run = harness(loop(false), [], { nodeOf: false, pressCode: "core.replay.failed" });
    expect(await run.gate()).toBeUndefined();
    expect(run.reports).toHaveLength(1);
  });

  it("does not refuse a written step outside any repeat for this rule", async () => {
    const steps = [step(1, "node.list"), step(2, "node.press", { routing: { kind: "optional" }, written: true, effectApplied: false })];
    const run = harness(steps, [], { nodeOf: false, pressCode: "core.replay.failed" });
    expect(await run.gate()).toBeUndefined();
  });
});

// t252 merged with lane B: when the same Flow is refused again unchanged, the
// `unchanged` line names what to change. A repeated step whose per-row pass
// failed with no withheld act blocks, so it is named; a straight optional step
// that failed is passed over, so it is not.
describe("the unchanged line over a repeat the test walked", () => {
  // The presses ran in the build (`effectApplied`), so the test proposes them.
  const draft = () => [
    step(1, "node.list"),
    step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d2" }, effectApplied: true }),
    step(3, "node.press", { routing: { kind: "optional" }, effectApplied: true })
  ];
  const unchangedOf = (shown: { value: JsonValue }[]): string[] => shown
    .map((entry) => entry.value)
    .filter((value): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.unchanged === "string")
    .map((value) => value.unchanged as string);

  it("names the repeated step whose per-row pass failed, and not the optional straight step", async () => {
    const steps = draft();
    const run = harness(steps, [{ name: "Ada" }, { name: "Ben" }], { pressCode: "core.replay.failed" });
    const first = await run.gate();
    expect(first).toMatchObject({ issueCodes: expect.any(Array) });
    expect(steps[1]!.replayed).toMatchObject({ status: "failed", passes: [{ pass: 1, status: "failed" }, { pass: 2, status: "failed" }] });
    expect(steps[1]!.replayed).not.toHaveProperty("withheldBy");
    expect(steps[2]!.replayed).toMatchObject({ status: "failed", excused: "optional" });
    expect(unchangedOf(run.shown)).toEqual([]);
    await run.gate();
    const lines = unchangedOf(run.shown);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Change step 2 (failed) before you say the Flow is ready");
    expect(lines[0]).not.toContain("step 3");
  });
});
