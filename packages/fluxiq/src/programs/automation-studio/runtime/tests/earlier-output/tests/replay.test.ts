// The build's test resolves an earlier step's output from what that step
// really produced in this same test (P5, t270).
//
// A written step may read an output of a step before it
// (`{"$state":{"path":"$step.<id>.<output>"}}`, `../../../flow-draft/binding-forms.ts`).
// The test sends it with the value the earlier step's own call answered in
// this walk -- never the build's exploration, never a stored `produced`, never
// a value from an earlier pass of a repeat. A step that was only checked, or
// did not run, produced nothing; a step that has not run yet in this walk has
// produced nothing either. Then the reading step fails
// `core.replay.unresolved_binding` and nothing is sent for it.
// The llm barrel first, as `../../../llm/decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it } from "vitest";
import { replayAutomationStudioFlowDraft, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

const REPLAYED = "core.replay.replayed";
/** A step whose binding nothing answered (`../../../llm/node-tools/replay-span.ts`). */
const AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE = "core.replay.unresolved_binding";
/** What the test reads of a node: its ports (`AutomationStudioFlowDraftReplayNode`). */
type AutomationStudioFlowDraftReplayNode = { inputs: { id: string }[]; outputs: { id: string; type: string }[] };

const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }, { id: "first", type: "object" }] },
  "node.read": { inputs: [{ id: "item" }], outputs: [{ id: "value", type: "string" }] },
  "node.type": { inputs: [], outputs: [] }
};
const nodeOf = (id: string) => NODES[id];

const earlier = (id: string, output: string, path?: string): JsonObject => ({ $state: { path: `$step.${id}.${output}${path ? `.${path}` : ""}` } });

const step = (position: number, id: string, node: string, parameters: JsonObject, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters, consequences: [] },
  ranWith: { node, parameters, consequences: [] },
  effect: node === "node.type" ? "mutate" : "observe",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  // What the step produced while the build explored: never what the test sends.
  replay: { from: { location: `https://site.test/${position}` }, produced: { first: { label: "Explored" } } },
  ...over
});

type Call = { callId: string; value: JsonObject };

/** A host answering each call by its id: `outputs` per call id, `codes` overriding the result code. */
function host(outputs: Record<string, JsonObject>, codes: Record<string, string> = {}) {
  const calls: Call[] = [];
  const executeTool = async ({ callId, value }: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED };
    const code = codes[callId] ?? (value.replay === "verify" ? "core.replay.verified" : REPLAYED);
    return { kind: "llm_evidence_tool_execution", evidence: { call: callId }, effectApplied: code === REPLAYED, resultCode: code, ...(outputs[callId] ? { outputs: outputs[callId] } : {}) };
  };
  return { calls, executeTool };
}

const test = (steps: AutomationStudioFlowDraftStep[], executor: ReturnType<typeof host>) => replayAutomationStudioFlowDraft({ steps, attempt: 1, executeTool: executor.executeTool, nodeOf });
const sent = (executor: ReturnType<typeof host>, callId: string) => executor.calls.find((call) => call.callId === callId)?.value;
const outcome = (replayed: Awaited<ReturnType<typeof test>>, position: number) => replayed.verdict.outcomes.find((each) => each.step === position);

describe("an earlier step's output, in the build's test", () => {
  it("is the value that step answered in this test, at its output and field", async () => {
    const executor = host({ "dryrun.1.1": { records: [{ name: "Ada" }], first: { label: "Fresh" } } });
    const replayed = await test([
      step(1, "d4", "node.list", { list: ".rows" }),
      step(2, "d9", "node.type", { selector: "#name", text: earlier("d4", "first", "label"), all: earlier("d4", "records") })
    ], executor);
    expect(replayed.verdict.ok).toBe(true);
    expect(sent(executor, "dryrun.1.2")!.parameters).toEqual({ selector: "#name", text: "Fresh", all: [{ name: "Ada" }] });
  });

  it("fails the reading step, sending nothing, when the earlier step answered no such output", async () => {
    const executor = host({ "dryrun.1.1": { records: [] } });
    const replayed = await test([step(1, "d4", "node.list", {}), step(2, "d9", "node.type", { text: earlier("d4", "first", "label") })], executor);
    expect(sent(executor, "dryrun.1.2")).toBeUndefined();
    expect(outcome(replayed, 2)).toMatchObject({ status: "failed", resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });
    expect(replayed.verdict.ok).toBe(false);
  });

  it("fails the reading step when the earlier step did not run again: a step that failed or was only checked produced nothing", async () => {
    const failed = host({ "dryrun.1.1": { first: { label: "Stale" } } }, { "dryrun.1.1": "core.replay.changed" });
    const afterFailure = await test([step(1, "d4", "node.list", {}), step(2, "d9", "node.type", { text: earlier("d4", "first", "label") })], failed);
    expect(sent(failed, "dryrun.1.2")).toBeUndefined();
    expect(outcome(afterFailure, 2)).toMatchObject({ resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });

    // A lasting act is checked, not run: whatever its check answers is not an output.
    const checked = host({ "dryrun.1.1": { value: "Checked" } });
    const lasting = step(1, "d4", "node.read", {}, { effect: "mutate", input: { node: "node.read", parameters: {}, consequences: ["modify_existing"] }, ranWith: { node: "node.read", parameters: {}, consequences: ["modify_existing"] } });
    const afterCheck = await test([lasting, step(2, "d9", "node.type", { text: earlier("d4", "value") })], checked);
    expect(sent(checked, "dryrun.1.1")!.replay).toBe("verify");
    expect(sent(checked, "dryrun.1.2")).toBeUndefined();
    expect(outcome(afterCheck, 2)).toMatchObject({ resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });
  });

  it("fails a step that reads a step the draft now runs after it: nothing it reads exists yet", async () => {
    const executor = host({ "dryrun.1.2": { first: { label: "Late" } } });
    const replayed = await test([step(1, "d9", "node.type", { text: earlier("d4", "first", "label") }), step(2, "d4", "node.list", {})], executor);
    expect(sent(executor, "dryrun.1.1")).toBeUndefined();
    expect(outcome(replayed, 1)).toMatchObject({ resultCode: AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE });
  });

  it("reads, on each pass of a repeat, what the earlier member answered on that pass and never a pass before", async () => {
    const rows = [{ name: "Ada" }, { name: "Ben" }];
    const executor = host(
      { "dryrun.1.1": { records: rows }, "dryrun.1.2.pass.1": { value: "first pass" }, "dryrun.1.2.pass.2": { value: "second pass" } },
      { "dryrun.1.2.pass.2": "core.replay.changed" }
    );
    const replayed = await test([
      step(1, "d1", "node.list", {}),
      step(2, "d2", "node.read", {}, { routing: { kind: "repeat", over: "d1", through: "d3" } }),
      step(3, "d3", "node.type", { text: earlier("d2", "value") })
    ], executor);
    expect(sent(executor, "dryrun.1.3.pass.1")!.parameters).toEqual({ text: "first pass" });
    // Pass 2's read did not run again, so the type has nothing of pass 2 to read -- and pass 1's value is not it.
    expect(sent(executor, "dryrun.1.3.pass.2")).toBeUndefined();
    expect(outcome(replayed, 3)!.passes!.map((pass) => [pass.status, pass.resultCode])).toEqual([["replayed", REPLAYED], ["failed", AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE]]);
  });

  it("reads a step before a repeat on every pass of it", async () => {
    const rows = [{ name: "Ada" }, { name: "Ben" }];
    const executor = host({ "dryrun.1.1": { first: { label: "Shared" } }, "dryrun.1.2": { records: rows } });
    await test([
      step(1, "d1", "node.list", {}),
      step(2, "d2", "node.list", {}),
      step(3, "d3", "node.type", { text: earlier("d1", "first", "label") }, { routing: { kind: "repeat", over: "d2", through: "d3" } })
    ], executor);
    expect([sent(executor, "dryrun.1.3.pass.1")!.parameters, sent(executor, "dryrun.1.3.pass.2")!.parameters]).toEqual([{ text: "Shared" }, { text: "Shared" }]);
  });
});
