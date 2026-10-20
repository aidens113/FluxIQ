import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AutomationStudioSiteResetLedger, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetTrialAct } from "../../site-reset/index.ts";
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
    // As the real wrapper does, every call the domain put to the gate is reported with what it declared.
    const consequences = Array.isArray(value.consequences) ? value.consequences as Array<"create_new" | "delete"> : undefined;
    ledger.explored({ callId: call.callId, toolId: call.toolId, landed: true, ...(claim.kind === "undo" ? { undoes: claim.undo.act } : {}),
      ...(consequences && value.node !== "demo.look" ? { declared: { permitted: true, effect: "mutate" as const, consequences, control: { name: adds ? "Add" : "Remove", kind: "button" }, verb: "press" } } : {}) });
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
    ...(options.reset === false ? {} : { siteReset: fake.ledger, siteResetSettleMs: 0 }),
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

  // F1 continuation (user, 2026-10-12): a test sent again without progress, or past the policy's refusals, once ran on
  // the leftovers. It is now refused every time while the act is still to undo; the trial runs only once the act is
  // named under cannotUndo, and then says under startedWith what was still in place.
  it("refuses a trial without progress however often it is asked, and runs it only once the act is named under cannotUndo, saying under startedWith what was still in place", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const cannot: Step = (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: `test.${++calls}`, input: { ...receipt(evidence), cannotUndo: ["act-1"] } });
    const { seen } = await run([act(), submit, test, test, test, test, cannot, submit], portOf(asked));
    for (const index of [3, 4, 5, 6]) {
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[index]!)).toMatchObject({ ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }], differs: ["1 lines where the start had 0"] });
    }
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[7]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", startedWith: { cannotUndo: [{ act: "act-1" }], differs: ["1 lines where the start had 0"] }, leftOnSite: [{ act: "act-1" }] });
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
  it("lets the model say an act listed for undoing cannot be undone: the trial runs with it, and the judge is told (t471)", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const cannot: Step = (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: `test.${++calls}`, input: { ...receipt(evidence), cannotUndo: ["act-1"] } });
    const { seen } = await run([act(), submit, test, cannot, submit], portOf(asked));
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ code: "candidate.trial_reset_required" });
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", startedWith: { cannotUndo: [{ act: "act-1", did: "press \"Add\" button" }] } });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.startedWith).toEqual(["already done by this build (act-1): press \"Add\" button", "not as the build found it: 1 lines where the start had 0"]);
  });

  // Lane D round 17 (`run-mv6lgt3s-c3aa6fac`): a start hook took back an exploration act, and nothing the trial answered
  // or the build kept said the act had existed. The trial is admitted exactly as before (t504).
  it("lists under absorbedByStartReset the exploration act a start hook took back, in the trial's evidence and in the result the build keeps (t504)", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    let hooked = 0;
    const prepareStart = async () => {
      hooked += 1;
      return "reset" as const;
    };
    const port = Object.assign(portOf(asked, [{ step: 1, definitionId: definition.id, label: "Inspect", consequences: ["create_new"] }]), { prepareStart });
    const { seen, outcome } = await run([act(), submit, test, test, submit], port);
    expect(hooked).toBe(2);
    const first = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)!;
    // Admitted, as before: the hook put the site back, and the model is asked for nothing.
    expect(first).toMatchObject({ verdict: "unsure", trialRunId: "trial.1", absorbedByStartReset: [{ act: "act-1", did: "press \"Add\" button", call: expect.stringMatching(/^act\./) }] });
    expect(first.startedWith).toBeUndefined();
    // The second hook took back only what the first trial left.
    const second = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)!;
    expect(second).toMatchObject({ verdict: "unsure", trialRunId: "trial.2", absorbedByStartReset: [{ act: "act-2", did: "trial step 1 \"Inspect\"" }] });
    expect(asked).toHaveLength(2);
    // The result the build keeps names every act a hook took back during the build, the exploration act first.
    const trial = (outcome as { trial?: AutomationStudioCandidateTrialResult }).trial;
    expect(trial?.absorbedByStartReset).toEqual([
      { act: "act-1", did: "press \"Add\" button", call: expect.stringMatching(/^act\./) },
      { act: "act-2", did: "trial step 1 \"Inspect\"" }
    ]);
  });

  it("says nothing of a start hook that took back nothing of the build", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const port = Object.assign(portOf(asked), { prepareStart: async () => "reset" as const });
    const { seen, outcome } = await run([submit, test, submit], port);
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[2]!)!;
    expect(ran).toMatchObject({ verdict: "unsure" });
    expect("absorbedByStartReset" in ran).toBe(false);
    expect((outcome as { trial?: AutomationStudioCandidateTrialResult }).trial).not.toHaveProperty("absorbedByStartReset");
  });

  it("tells the judge nothing when the trial started as the build found the site", async () => {
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    await run([submit, test, submit], portOf(asked));
    expect(asked).toHaveLength(1);
    expect(asked[0]!.startedWith).toBeUndefined();
  });

  // t609: the gate copied a trial's acts field by field and dropped `spot` and `created`, so in candidate mode an undo
  // of what a trial left was refused `candidate.undo_wrong_target` on a site with no start hook. A library's reading list.
  it("carries where a trial's act sat and what it made to the reset, which undoes it on its own item with no start hook (t609)", async () => {
    const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
    const ledger = new AutomationStudioSiteResetLedger();
    const back = async () => ({ moved: true, differs: [] });
    const asked: AutomationStudioCandidateTrialRequest[] = [];
    const port = portOf(asked, [
      { step: 2, definitionId: "domain.library.add", label: "Add the novel", consequences: ["create_new"], spot: { item: "i:card-novel", dialog: "not a token!" }, created: ["i:line-novel", "i:line-novel"] },
      // One malformed created entry drops the whole list, never the act or its spot.
      { step: 3, definitionId: "domain.library.add", label: "Add the atlas", consequences: ["create_new"], spot: { item: "i:card-atlas" }, created: ["i:line-atlas", "<b>atlas</b>"] }
    ]);
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "c", port }, reset: {
      beforeTrial: (_signal, cannotUndo, options) => ledger.beforeTrial(back, cannotUndo, options),
      trialRan: (acts, trialRunId) => ledger.trialRan(acts, trialRunId)
    } });
    const first = await gate.test({ revision: 1, digest: "d1" });
    expect(first.evidence).toMatchObject({ verdict: "unsure", leftOnSite: [{ act: "act-1", did: "trial step 2 \"Add the novel\"" }, { act: "act-2", did: "trial step 3 \"Add the atlas\"" }] });
    expect(gate.standing(latest)?.acts).toEqual([
      { step: 2, definitionId: "domain.library.add", label: "Add the novel", consequences: ["create_new"], spot: { item: "i:card-novel" }, created: ["i:line-novel"] },
      { step: 3, definitionId: "domain.library.add", label: "Add the atlas", consequences: ["create_new"], spot: { item: "i:card-atlas" } }
    ]);
    // No hook took them back: the next test is refused until both are undone.
    expect((await gate.test({ revision: 1, digest: "d1" })).evidence).toMatchObject({ code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }, { act: "act-2" }] });
    // The novel's line, which the trial's step made, is removed unasked; the atlas is put back on its own card.
    const aim = (consequences: Array<"delete" | "modify_existing">, item: string) => ({ effect: "mutate" as const, consequences, control: { item } });
    expect(ledger.claim("act-1")).toEqual({ kind: "undo", undo: { act: "act-1", allowed: [] } });
    expect(ledger.target("act-1", aim(["delete"], "i:line-novel"))).toEqual({ kind: "admit", on: "created", allowed: ["delete"] });
    ledger.explored({ callId: "undo.novel", toolId: "core.run_node", landed: true, undoes: "act-1", on: "created", declared: { permitted: true, effect: "mutate", consequences: ["delete"], control: { name: "Remove", kind: "button", item: "i:line-novel" }, verb: "press" } });
    ledger.undoSeen("act-1", true);
    expect(ledger.target("act-2", aim(["modify_existing"], "i:card-atlas"))).toEqual({ kind: "admit", on: "own", allowed: [] });
    ledger.explored({ callId: "undo.atlas", toolId: "core.run_node", landed: true, undoes: "act-2", on: "own", declared: { permitted: true, effect: "mutate", consequences: ["modify_existing"], control: { name: "Saved", kind: "button", item: "i:card-atlas" }, verb: "press" } });
    ledger.undoSeen("act-2", true);
    const again = await gate.test({ revision: 1, digest: "d1" });
    expect(again.evidence).toMatchObject({ verdict: "unsure", trialRunId: "trial.2" });
    expect((again.evidence as JsonObject).startedWith).toBeUndefined();
    expect(asked).toHaveLength(2);
  });

  it("refuses a test whose cannotUndo is not a list of act ids", async () => {
    const latest = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => latest, trial: { candidateId: "c", port: portOf([]) } });
    for (const cannotUndo of ["act-1", [1], new Array(51).fill("act-1")]) {
      expect((await gate.test({ revision: 1, digest: "d1", cannotUndo } as JsonObject)).evidence).toMatchObject({ ok: false, code: "candidate.trial_input_invalid" });
    }
    expect((gate.tool.inputSchema.properties as JsonObject).cannotUndo).toMatchObject({ type: "array", items: { pattern: "^act-[1-9][0-9]{0,3}$" } });
  });
});

// L1 reset settlement, on the candidate side: the reset before a trial may
// look at an open act's watched place itself (`lookAt`), and what it reads
// there reaches the ledger as any read does; a trial's act keeps every spot
// token, the step's `controls` and its `collections` on its way to the ledger.
const WATCHED = "https://site.test/watched";
const CONTROLS = { "p:slot": { "v:off": 1 } };
const drafted = { revision: 1, digest: "d1", baseDependencyDigest: "b", status: "draft", summary: "s", buildPlan: {}, changedPaths: [] } as unknown as AutomationStudioFlowCandidate;

describe("candidate trial reset settlement (L1)", () => {
  it("gives a beforeTrial check lookAt, which goes to the location, and its settled read reaches the ledger", async () => {
    let at = "";
    const went: string[] = [];
    const binding = {
      startState: async () => ({ state: { at }, differs: [], location: at, ...(at === WATCHED ? { controls: CONTROLS } : {}) }),
      runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go"] }
    };
    const executeTool = async (call: { callId: string; value: JsonObject }) => {
      const to = (call.value.parameters as JsonObject | undefined)?.to;
      if (call.value.node === "demo.go" && typeof to === "string") {
        at = to;
        went.push(`${call.callId} ${to}`);
      }
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true };
    };
    const ledger = new AutomationStudioSiteResetLedger();
    const observed: AutomationStudioSiteResetRead[] = [];
    const observe = ledger.observed.bind(ledger);
    ledger.observed = (...args: Parameters<AutomationStudioSiteResetLedger["observed"]>) => {
      observed.push(args[0]);
      return observe(...args);
    };
    const offered: boolean[] = [];
    const beforeTrial = ledger.beforeTrial.bind(ledger);
    ledger.beforeTrial = async (...args: Parameters<AutomationStudioSiteResetLedger["beforeTrial"]>) => {
      const checks = args[0];
      offered.push(typeof checks !== "function" && typeof checks.lookAt === "function");
      if (typeof checks !== "function") await checks.lookAt?.(WATCHED);
      return beforeTrial(...args);
    };
    let receipt: JsonObject = {};
    let trials = 0;
    await runAutomationStudioFlowCandidateAuthoringLoop({
      submission: { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding },
      trial: { candidateId: "candidate.look", port: async (request) => {
        trials += 1;
        return { revision: request.revision, digest: request.digest, verdict: "yes", feedback: {} };
      } },
      siteReset: ledger, siteResetSettleMs: 0,
      loop: {
        tools: [runNode], maxIterations: 3, maxToolCalls: 4,
        executeTool,
        decide: async ({ iteration, evidence }) => {
          if (iteration === 1) return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit", input: plan } as unknown as Decision;
          receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
          if (iteration === 2) return { kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId: "test", input: { revision: receipt.revision, digest: receipt.digest } } as unknown as Decision;
          return { kind: "complete", result: { revision: receipt.revision, digest: receipt.digest } } as unknown as Decision;
        }
      }
    });
    expect(offered).toEqual([true]);
    expect(trials).toBe(1);
    expect(went).toContain(`site-reset.look.1.arrival ${WATCHED}`);
    expect(observed.filter((read) => read.location === WATCHED)).toEqual([expect.objectContaining({ location: WATCHED, controls: CONTROLS })]);
  });

  it("carries every spot token, the step's controls and its collections to the ledger's trialRan, and drops malformed ones but keeps the act", async () => {
    // With the step page's location, as a read carries it beside its scope (L1 d7).
    const controls = { page: "p:page", location: "loc:page", before: { "v:off": 1 }, after: { "v:on": 1 } };
    const { location: _location, ...unplaced } = controls;
    const collections = {
      before: [{ scope: "c:from", group: "g:list", subjects: ["s:a", "s:b"], states: { "s:a": "v:in", "s:b": "v:in" } }],
      after: [{ scope: "c:from", group: "g:list", subjects: ["s:b"], states: { "s:b": "v:in" } }, { scope: "c:to", group: "g:list", subjects: ["s:a"], states: { "s:a": "v:in" } }]
    };
    // A side missing one subject's state is no complete inventory, so the act keeps no collections.
    const partial = { before: collections.before, after: [{ scope: "c:to", group: "g:list", subjects: ["s:a", "s:b"], states: { "s:a": "v:in" } }] };
    const acts = [
      { step: 1, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], spot: { item: "i:row", subject: "s:thing", page: "s:page", scope: "c:scope", resource: "r:one", place: "p:slot", state: "v:off", extra: "x:dropped" }, controls, collections },
      { step: 2, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], spot: { place: "a slot, in words" }, controls: { ...controls, before: { "v:off": 0 } }, collections: partial },
      // A location that is no single bounded line is dropped, and the counts kept.
      { step: 3, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: { ...controls, location: "loc:page\nmore" } },
      { step: 4, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: { ...controls, location: "x".repeat(2_049) } },
      { step: 5, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: { ...controls, location: 7 } }
    ];
    const told: AutomationStudioSiteResetTrialAct[][] = [];
    const gate = new AutomationStudioFlowCandidateTrialGate({ latest: () => drafted, trial: { candidateId: "c", port: async (request) => ({ revision: request.revision, digest: request.digest, verdict: "unsure", feedback: {}, trialRunId: "trial.1", acts: acts as unknown as NonNullable<AutomationStudioCandidateTrialResult["acts"]> }) },
      reset: {
        beforeTrial: async () => ({ kind: "admit" }),
        trialRan: (ran) => {
          told.push([...ran]);
          return [];
        }
      } });
    await gate.test({ revision: 1, digest: "d1" });
    expect(told).toEqual([[
      { step: 1, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], spot: { item: "i:row", subject: "s:thing", page: "s:page", scope: "c:scope", resource: "r:one", place: "p:slot", state: "v:off" }, controls, collections },
      { step: 2, definitionId: "domain.demo.toggle", consequences: ["modify_existing"] },
      { step: 3, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: unplaced },
      { step: 4, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: unplaced },
      { step: 5, definitionId: "domain.demo.toggle", consequences: ["modify_existing"], controls: unplaced }
    ]]);
  });
});
