// A forward run's row whose own control cannot be found (t869, `../../replay/forward.ts`), and the page its answer shows.
//
// A pass presses its row's own control or says it could not. Saying so ends that pass and no other: nothing later
// in it is sent, the row is named in the answer, and the next row runs. The answer then holds the page as it stands,
// since no pass's answer carries one.
// The llm barrel first, as `../../../decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { runAutomationStudioFlowDraftPart, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_ROW_CONTROL_NOT_FOUND_REASON as ROW_MISSING, type AutomationStudioFlowDraftReplayNode } from "../../replay/index.ts";

const REPLAYED = "core.replay.replayed";
const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};
const ROWS: JsonObject[] = [{ name: "Ada" }, { name: "Ben" }, { name: "Cyd" }];

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}, consequences: string[] = []): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId: node, toolId: "core.run_node",
  input: { node, parameters: {}, consequences }, ranWith: { node, parameters: { target: `#s${position}` }, consequences },
  effect: node === "node.list" ? "observe" : "mutate", effectApplied: true, disposition: "kept", proposes: true,
  replay: { from: { location: `https://site.test/${position}` } }, ...over
});

/** A list, then a row's three steps repeated over it: open the row, press its lasting control, come back. */
const draft = () => [
  step(1, "node.list"),
  step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d4" } }),
  step(3, "node.press", {}, ["modify_existing"]),
  step(4, "node.press")
];

type Call = { callId: string; toolId: string; value: JsonObject };
type Answer = Partial<AutomationStudioLlmEvidenceToolExecutionResult>;

function host(answers: Record<string, Answer> = {}, labels = true) {
  const calls: Call[] = [];
  const executeTool = async (call: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push(call);
    return {
      kind: "llm_evidence_tool_execution", evidence: { call: call.callId, ...(labels && call.value.node === "node.list" ? { readRows: { rows: ROWS } } : {}) }, effectApplied: true, resultCode: REPLAYED,
      ...(call.value.node === "node.list" ? { outputs: { records: ROWS } } : {}),
      ...answers[call.callId]
    };
  };
  return { calls, executeTool };
}

const forward = { rowDone: () => false, stepDone: () => false };
const run = (executor: ReturnType<typeof host>, over: { look?: { toolId: string; input: JsonObject; observedStateKeys: readonly string[] } } = {}, withForward = true) =>
  runAutomationStudioFlowDraftPart({ steps: draft(), value: { from: 1 }, callId: "fw", executeTool: executor.executeTool, nodeOf: (id) => NODES[id], ...(withForward ? { forward } : {}), ...over });
const notFound: Answer = { effectApplied: false, resultCode: "core.replay.unreproducible", resultReason: ROW_MISSING };

describe("a row whose own control cannot be found", () => {
  it("at the pass's first step: nothing later in the pass is sent, the next row goes on, and the row is named", async () => {
    const executor = host({ "fw.2.pass.2": notFound });
    const result = await run(executor);
    expect(executor.calls.map((call) => call.callId)).toEqual(["fw.1", "fw.2.pass.1", "fw.3.pass.1", "fw.4.pass.1", "fw.2.pass.2", "fw.2.pass.3", "fw.3.pass.3", "fw.4.pass.3"]);
    expect(result.resultCode).toBe("core.run_flow.ran");
    expect(result.evidence).toMatchObject({ ok: true, passed: false, rows: { done: 2, skipped: 0, failed: 1 }, rowsNotDone: ["Ben"] });
    expect((result.evidence as JsonObject).stoppedAt).toBeUndefined();
    const instruction = String((result.evidence as JsonObject).instruction);
    expect(instruction).toContain('"Ben"');
    expect(instruction).toMatch(/nothing was done to them/u);
    expect(instruction).not.toMatch(/row_control|core\.|reason/u);
  });

  it("later in the pass: its steps that declare nothing still run, so it comes back for the next row, and no lasting one does, and nothing resets", async () => {
    const steps = draft();
    steps.splice(3, 0, step(4, "node.press", { id: "d3b" }, ["delete"]));
    steps[1]!.routing = { kind: "repeat", over: "d1", through: "d5" };
    steps[4] = step(5, "node.press", { id: "d5" });
    const executor = host({ "fw.3.pass.2": notFound });
    const result = await runAutomationStudioFlowDraftPart({ steps, value: { from: 1 }, callId: "fw", executeTool: executor.executeTool, nodeOf: (id) => NODES[id], forward });
    const secondPass = executor.calls.filter((call) => call.callId.endsWith(".pass.2")).map((call) => call.callId);
    expect(secondPass).toEqual(["fw.2.pass.2", "fw.3.pass.2", "fw.5.pass.2"]);
    expect((executor.calls.find((call) => call.callId === "fw.5.pass.2")!.value.item as JsonObject).name).toBe("Ben");
    expect(executor.calls.filter((call) => call.callId.endsWith(".pass.3")).map((call) => call.callId)).toEqual(["fw.2.pass.3", "fw.3.pass.3", "fw.4.pass.3", "fw.5.pass.3"]);
    expect(result.evidence).toMatchObject({ rows: { done: 2, failed: 1 }, rowsNotDone: ["Ben"] });
    expect(executor.calls.some((call) => call.value.replay === "reset")).toBe(false);
  });

  it("is not done even where the host read the miss as a site remembering the step", async () => {
    const executor = host({ "fw.2.pass.2": { effectApplied: false, resultCode: "core.replay.remembered", resultReason: ROW_MISSING } });
    const result = await run(executor);
    expect(result.evidence).toMatchObject({ passed: false, rows: { done: 2, failed: 1 }, rowsNotDone: ["Ben"] });
    expect(executor.calls.some((call) => call.callId === "fw.3.pass.2")).toBe(false);
  });

  it("is named by its place in the list where the read named no rows", async () => {
    const executor = host({ "fw.2.pass.2": notFound }, false);
    expect((await run(executor)).evidence).toMatchObject({ rowsNotDone: ["row 2"] });
  });

  it("every other failure of a pass still stops the run there", async () => {
    const executor = host({ "fw.2.pass.2": { effectApplied: false, resultCode: "core.replay.failed", resultReason: "target_ambiguous" } });
    const result = await run(executor);
    expect(result.resultCode).toBe("core.run_flow.stopped");
    expect(result.evidence).toMatchObject({ passed: false, stoppedAt: expect.any(Number), rows: { done: 1, failed: 1 } });
    expect(executor.calls.some((call) => call.callId === "fw.2.pass.3")).toBe(false);
    expect((result.evidence as JsonObject).rowsNotDone).toBeUndefined();
  });

  it("leaves a run that is no forward run as it was: the code decides, and a remembered pass passes", async () => {
    const executor = host({ "fw.2.pass.2": { effectApplied: false, resultCode: "core.replay.remembered", resultReason: ROW_MISSING } });
    const result = await run(executor, {}, false);
    expect(result.evidence).toMatchObject({ passed: true });
    expect((result.evidence as JsonObject).rowsNotDone).toBeUndefined();
  });
});

describe("the page a forward run's answer holds", () => {
  const LOOK = { toolId: "look", input: { kind: "page" }, observedStateKeys: ["page", "read.extracted"] };
  const lookedAt = (evidence: JsonObject): Record<string, Answer> => ({ "fw.look": { evidence, effectApplied: false, resultCode: "web.inspect.succeeded", stateDigests: { before: "x", after: "after-look" } } });

  it("is one look taken when the run ends, under the keys the domain declares as its view and no others", async () => {
    const executor = host(lookedAt({ page: "PAGE as it stands", pageChanged: false, status: "succeeded", ok: true, read: { extracted: [] } }));
    const result = await run(executor, { look: LOOK });
    expect(executor.calls.at(-1)).toMatchObject({ callId: "fw.look", toolId: "look", value: { kind: "page" } });
    expect(executor.calls.filter((call) => call.callId === "fw.look")).toHaveLength(1);
    const evidence = result.evidence as JsonObject;
    expect(evidence.page).toBe("PAGE as it stands");
    expect(evidence).toMatchObject({ ok: true, passed: true });
    for (const key of ["pageChanged", "status", "read"]) expect(evidence[key]).toBeUndefined();
    expect(result.stateDigests?.after).toBe("after-look");
  });

  it("is taken after a run that stopped too, the page being where the step left it", async () => {
    const executor = host({ "fw.2.pass.2": { effectApplied: false, resultCode: "core.replay.failed" }, ...lookedAt({ page: "PAGE where it stopped" }) });
    const result = await run(executor, { look: LOOK });
    expect(result.evidence).toMatchObject({ stoppedAt: expect.any(Number), page: "PAGE where it stopped" });
  });

  it("a look that is refused leaves the answer without one, and says so", async () => {
    const executor = host(lookedAt({ ok: false, page: "PAGE of a refusal" }));
    const { evidence } = await run(executor, { look: LOOK });
    expect(evidence).not.toHaveProperty("page");
    expect(evidence).toMatchObject({ pageNotRead: true });
  });

  it("is not taken without a forward run", async () => {
    const executor = host(lookedAt({ page: "PAGE" }));
    await run(executor, { look: LOOK }, false);
    expect(executor.calls.some((call) => call.callId === "fw.look")).toBe(false);
  });
});
