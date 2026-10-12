import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AutomationStudioSiteResetLedger } from "../../site-reset/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, AutomationStudioFlowCandidateTrialGate, runAutomationStudioFlowCandidateAuthoringLoop, type AutomationStudioFlowCandidate, type AutomationStudioCandidateTrialRequest, type AutomationStudioCandidateTrialResult } from "../index.ts";

// The site reset before each trial (t462), in the real authoring loop. A fake
// domain keeps a count of lines the build added and plays the build's
// permission wrapper: it hands each call's `undoes` to the ledger and tells
// the ledger what each call did. Every answer is read where the model reads
// it, in the evidence of the next decision.

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const plan: JsonObject = { summary: "Inspect", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
  { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "value" } }
], edges: [] }] } };
const arrival: JsonObject = { node: "demo.go", parameters: { to: "start" }, consequences: [] };
const runNode: AutomationStudioLlmEvidenceTool = {
  toolId: "core.run_node", description: "Run a node.", effect: "mutate", perCallEffect: true,
  inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array" } } },
  initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] }, arrival }
};

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const receipt = (evidence: readonly Entry[]) => {
  const value = latestOf("core.submit_candidate", evidence)!;
  return { revision: value.revision as number, digest: value.digest as string };
};
type Decision = Awaited<ReturnType<Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0]["loop"]["decide"]>>;
type TrialActs = NonNullable<AutomationStudioCandidateTrialResult["acts"]>;
let calls = 0;
const act = (extra: JsonObject = {}): Step => () => ({ kind: "tool_call", toolId: "core.run_node", callId: `act.${++calls}`, input: { node: "demo.add", parameters: { n: calls }, consequences: ["create_new"], ...extra } });
const submit: Step = () => ({ kind: "tool_call", toolId: "core.submit_candidate", callId: `submit.${++calls}`, input: plan });
const test: Step = (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: `test.${++calls}`, input: receipt(evidence) });

/** A domain whose site holds `lines` added by the build; its start state says how many there are. */
function site() {
  const state = { lines: 0, executed: [] as string[], starts: [] as Array<JsonObject | undefined> };
  const ledger = new AutomationStudioSiteResetLedger();
  const binding = {
    startState: async (input: { start?: JsonObject }) => {
      state.starts.push(input.start);
      const lines = state.lines;
      return { state: { lines }, differs: input.start && input.start.lines !== lines ? [`${lines} lines where the start had ${String(input.start.lines)}`] : [] };
    }
  };
  const executeTool = async (call: { callId: string; toolId: string; value: JsonObject }) => {
    state.executed.push(call.callId);
    const { undoes, ...value } = call.value;
    const claim = undoes === undefined ? { kind: "none" as const } : ledger.claim(undoes);
    if (claim.kind === "refused") return { kind: "llm_evidence_tool_execution", evidence: claim.evidence, effectApplied: false, targetsUnchanged: true };
    const adds = value.node === "demo.add";
    if (adds) state.lines += 1;
    if (claim.kind === "undo") state.lines -= 1;
    ledger.explored({ callId: call.callId, toolId: call.toolId, landed: true, ...(claim.kind === "undo" ? { undoes: claim.undo.act } : {}),
      ...(adds ? { declared: { permitted: true, effect: "mutate" as const, consequences: ["create_new" as const], control: { name: "Add", kind: "button" }, verb: "press" } } : {}) });
    return { kind: "llm_evidence_tool_execution", evidence: { ok: true, lines: state.lines }, effectApplied: true };
  };
  return { state, ledger, binding, executeTool };
}

async function run(steps: Step[], port: (request: AutomationStudioCandidateTrialRequest) => Promise<AutomationStudioCandidateTrialResult>, options: { reset?: boolean } = {}) {
  const fake = site();
  const seen: Entry[][] = [];
  const offered: AutomationStudioLlmEvidenceTool[][] = [];
  let index = 0;
  const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: fake.binding },
    trial: { candidateId: "candidate.reset", port },
    ...(options.reset === false ? {} : { siteReset: fake.ledger }),
    loop: {
      tools: [runNode], maxIterations: steps.length, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: fake.executeTool,
      decide: async ({ evidence, tools }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        offered.push(tools.map((tool) => ({ ...tool })));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence) as unknown as Decision;
      }
    }
  }).catch((error: unknown) => ({ error }));
  return { outcome, seen, offered, fake };
}

const portOf = (asked: AutomationStudioCandidateTrialRequest[], acts: unknown[] = []) => async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
  asked.push(request);
  return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { said: "unsure" }, trialRunId: `trial.${asked.length}`, acts: acts as TrialActs };
};

describe("candidate trial gate: the site is put back first", () => {
  it("reads the start right after the opening arrival, with no start given", async () => {
    const { fake } = await run([submit], portOf([]));
    expect(fake.state.executed[0]).toBe("initial.core.run_node");
    expect(fake.state.starts).toEqual([undefined]);
  });

  it("refuses a trial while the build's act is in place, then runs it once the act is undone, listing what the trial left", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const trialActs = [{ step: 1, definitionId: definition.id, label: "Inspect", consequences: ["create_new"] }, { step: 2, definitionId: "x", consequences: ["not_a_class"] }, { bad: true }];
    const { seen, fake } = await run([act(), submit, test, act({ node: "demo.remove", consequences: ["delete"], undoes: "act-1" }), test, submit], portOf(asked, trialActs));
    const refused = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)!;
    expect(refused).toMatchObject({ ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1", did: "press \"Add\" button" }], differs: ["1 lines where the start had 0"] });
    // The refusal took the target back to the start through the arrival; it was not a trial.
    expect(fake.state.executed).toContain("site-reset.1.arrival");
    // Two tests, one trial: the refused one was never asked of the port nor counted against the revision.
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", retestsLeft: 2, trialRunId: "trial.1" });
    expect(asked).toHaveLength(1);
    expect(fake.state.executed.filter((callId) => callId.endsWith(".arrival"))).toEqual(["site-reset.1.arrival", "site-reset.2.arrival"]);
    expect(ran.startedWith).toBeUndefined();
    // Only the well-formed trial act is kept, as act-2.
    expect(ran.leftOnSite).toEqual([{ act: "act-2", did: "trial step 1 \"Inspect\"" }]);
  });

  it("admits the trial without progress, saying under startedWith what was still in place", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { seen } = await run([act(), submit, test, test, submit], portOf(asked));
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ code: "candidate.trial_reset_required" });
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", startedWith: { acts: [{ act: "act-1" }], differs: ["1 lines where the start had 0"] }, leftOnSite: [{ act: "act-1" }] });
    expect(asked).toHaveLength(1);
  });

  it("refuses an undo naming an act the build never made", async () => {
    const { seen } = await run([act({ undoes: "act-7" }), submit], portOf([]));
    expect(latestOf("core.run_node", seen[1]!)).toMatchObject({ ok: false, code: "candidate.undo_unknown_act" });
  });

  it("offers undoes on the library tool only with a ledger, and the test tool says to reset first", async () => {
    const withLedger = await run([submit], portOf([]));
    const library = withLedger.offered[0]!.find((tool) => tool.toolId === "core.run_node")!;
    expect((library.inputSchema.properties as JsonObject).undoes).toMatchObject({ type: "string", pattern: "^act-[1-9][0-9]{0,3}$" });
    expect(withLedger.offered[0]!.find((tool) => tool.toolId === AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID)!.description).toContain("put the site back the way this build found it");
    const without = await run([submit], portOf([]), { reset: false });
    expect((without.offered[0]!.find((tool) => tool.toolId === "core.run_node")!.inputSchema.properties as JsonObject).undoes).toBeUndefined();
    expect(without.fake.state.starts).toEqual([]);
  });

  it("runs every trial as before without a ledger", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const { seen } = await run([act(), submit, test, submit], portOf(asked), { reset: false });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ verdict: "unsure" });
    expect(asked).toHaveLength(1);
  });

  it("answers a refusal as a retryable call that reports the arrival's movement, and copies only well-formed trial acts", async () => {
    const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
    const told: unknown[][] = [];
    let refuse = true;
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "c", port: portOf([], [{ step: 4, definitionId: "n", control: "Keep", consequences: ["modify_existing", "modify_existing"] }, { step: 1.5, definitionId: "n", consequences: ["delete"] }]) },
      reset: {
        beforeTrial: async () => refuse ? { kind: "refuse", moved: true, evidence: { ok: false, code: "candidate.trial_reset_required", instruction: "put it back", actsToUndo: [] } } : { kind: "admit", startedWith: { differs: ["d"] } },
        trialRan: (acts, trialRunId) => {
          told.push([acts, trialRunId]);
          return [{ act: "act-3", did: "trial step 4" }];
        }
      } });
    expect(await gate.test({ revision: 1, digest: "d1" })).toEqual({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "candidate.trial_reset_required", instruction: "put it back", actsToUndo: [] }, effectApplied: true, targetsUnchanged: false, resultCode: "candidate.trial_reset_required", resultReason: "retry_allowed" });
    refuse = false;
    const ran = await gate.test({ revision: 1, digest: "d1" });
    expect(ran.evidence).toMatchObject({ verdict: "unsure", retestsLeft: 2, startedWith: { differs: ["d"] }, leftOnSite: [{ act: "act-3", did: "trial step 4" }] });
    expect(told).toEqual([[[{ step: 4, definitionId: "n", control: "Keep", consequences: ["modify_existing"] }], "trial.1"]]);
    expect(gate.standing(latest)?.acts).toEqual([{ step: 4, definitionId: "n", control: "Keep", consequences: ["modify_existing"] }]);
  });
});
