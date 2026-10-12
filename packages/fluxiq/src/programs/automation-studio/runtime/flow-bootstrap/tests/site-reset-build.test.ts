// The candidate build's site reset (t462) with every Core part composed as
// `service.ts` composes them: the real ledger, the real permission wrapper with
// that ledger, and the real candidate authoring loop whose library calls go
// through the wrapper. Only the domain, the model and the trial runner are
// stand-ins. The domain behaves as a real one does: it knows nothing of
// `undoes`, refuses any input key it does not take, puts every lasting act to
// the permission check first, and acts only on a yes.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclarationRecord } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, runAutomationStudioFlowCandidateAuthoringLoop, type AutomationStudioCandidateTrialRequest, type AutomationStudioCandidateTrialResult } from "../candidate/index.ts";
import { AutomationStudioSiteResetLedger } from "../site-reset/index.ts";

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

/** The only keys the stand-in domain takes on a call, as a real domain's input schema would. */
const DOMAIN_KEYS = ["node", "parameters", "consequences"];
/** The control each node presses; every name is shown to the model by the opening look. */
const CONTROLS: Readonly<Record<string, string>> = { "demo.add": "Add", "demo.remove": "Remove", "demo.edit": "Edit" };

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
type Decision = Awaited<ReturnType<Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0]["loop"]["decide"]>>;
type Verdict = { permitted: boolean; missing?: readonly string[]; requestId?: string | null };

const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const receipt = (evidence: readonly Entry[]) => {
  const value = latestOf("core.submit_candidate", evidence)!;
  return { revision: value.revision as number, digest: value.digest as string };
};
const node = (callId: string, name: string, consequences: AutomationStudioActionConsequence[], extra: JsonObject = {}): Step => () => ({ kind: "tool_call", toolId: "core.run_node", callId, input: { node: name, parameters: {}, consequences, ...extra } });
const add = (callId: string) => node(callId, "demo.add", ["create_new"]);
const edit = (callId: string) => node(callId, "demo.edit", ["modify_existing"]);
const remove = (callId: string, undoes?: string) => node(callId, "demo.remove", ["delete"], undoes ? { undoes } : {});
const submit = (callId: string): Step => () => ({ kind: "tool_call", toolId: "core.submit_candidate", callId, input: plan });
const test = (callId: string): Step => (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId, input: receipt(evidence) });

/** A site whose lines added by the build are counted, behind the real ledger and permission wrapper. */
function build() {
  const state = { lines: 0, inputs: [] as JsonObject[], acted: [] as string[], starts: [] as Array<JsonObject | undefined>, compared: [] as string[][], said: [] as string[] };
  const ledger = new AutomationStudioSiteResetLedger();
  let requests = 0;
  const wrapper = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.one"],
    authoringMode: "candidate",
    siteReset: ledger,
    newRequestId: () => `permission-request:${++requests}`,
    deriveInstructed: async () => [],
    say: async (text) => { state.said.push(text); },
    executeTool: async (call) => {
      state.inputs.push(structuredClone(call.value));
      const unknown = Object.keys(call.value).filter((key) => !DOMAIN_KEYS.includes(key));
      if (unknown.length) return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, code: "input.unknown_keys", keys: unknown } };
      const name = String(call.value.node);
      const consequences = (call.value.consequences ?? []) as AutomationStudioActionConsequence[];
      if (consequences.length) {
        const verdict = await call.permission!({ consequences, control: { name: CONTROLS[name] ?? name, kind: "button" }, verb: "press" }) as Verdict;
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, code: "permission_required", missing: [...(verdict.missing ?? [])], requestId: verdict.requestId ?? null } };
      }
      state.acted.push(name);
      if (consequences.includes("create_new")) state.lines += 1;
      if (consequences.includes("delete")) state.lines -= 1;
      return { kind: "llm_evidence_tool_execution", effectApplied: name !== "demo.look", evidence: { ok: true, lines: state.lines, controls: Object.values(CONTROLS) } };
    }
  });
  const binding = {
    startState: async (input: { start?: JsonObject }) => {
      state.starts.push(input.start);
      const differs = input.start && input.start.lines !== state.lines ? [`${state.lines} lines where the start had ${String(input.start.lines)}`] : [];
      if (input.start) state.compared.push(differs);
      return { state: { lines: state.lines }, differs };
    }
  };
  return { state, ledger, wrapper, binding };
}

/** The trial runner: each trial adds one line through the Flow's own step, and reports that act. */
const portOf = (asked: AutomationStudioCandidateTrialRequest[], state: { lines: number }) => async (request: AutomationStudioCandidateTrialRequest): Promise<AutomationStudioCandidateTrialResult> => {
  asked.push(request);
  state.lines += 1;
  return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { said: "unsure" }, trialRunId: `trial.${asked.length}`, acts: [{ step: 1, definitionId: definition.id, label: "Inspect", consequences: ["create_new"] }] };
};

async function run(steps: Step[]) {
  const site = build();
  const asked: AutomationStudioCandidateTrialRequest[] = [];
  const seen: Entry[][] = [];
  let index = 0;
  const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: site.binding },
    trial: { candidateId: "candidate.reset", port: portOf(asked, site.state) },
    siteReset: site.ledger,
    loop: {
      tools: [runNode], maxIterations: steps.length, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: site.wrapper.executeTool,
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence) as unknown as Decision;
      }
    }
  }).catch((error: unknown) => ({ error }));
  return { ...site, outcome, seen, asked };
}

const undoRecords = (records: readonly AutomationStudioActionDeclarationRecord[]) => records.filter((record) => record.undoes !== undefined);

describe("a candidate build puts the site back before each trial, through the real ledger, wrapper and loop", () => {
  it("refuses the first test while the explored add is in place, and runs no trial", async () => {
    const { seen, asked, state } = await run([add("call.add"), submit("call.submit"), test("call.test"), submit("call.again")]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({
      ok: false, code: "candidate.trial_reset_required",
      actsToUndo: [{ act: "act-1", did: "press \"Add\" button", call: "call.add" }],
      differs: ["1 lines where the start had 0"]
    });
    expect(asked).toHaveLength(0);
    expect(state.lines).toBe(1);
  });

  it("removes the act by naming it: the domain never sees `undoes`, the delete is not asked about, and the trial then runs", async () => {
    const { seen, asked, state, wrapper } = await run([add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo", "act-1"), test("call.test.2"), submit("call.again")]);
    expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: true, lines: 0 });
    expect(state.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(state.acted).toContain("demo.remove");
    expect(wrapper.request()).toBeUndefined();
    expect(undoRecords(wrapper.declarations())).toEqual([expect.objectContaining({ consequences: ["delete"], permitted: true, undoes: "act-1", control: { name: "Remove", kind: "button" } })]);
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(ran.startedWith).toBeUndefined();
    expect(ran.leftOnSite).toEqual([{ act: "act-2", did: "trial step 1 \"Inspect\"" }]);
    expect(asked).toHaveLength(1);
    // Read once at the start, then compared before each test: still one line over, then back as it was.
    expect(state.starts).toEqual([undefined, { lines: 0 }, { lines: 0 }]);
    expect(state.compared).toEqual([["1 lines where the start had 0"], []]);
  });

  it("still asks about a delete on something the build did not create, and does not act", async () => {
    const { seen, state, wrapper } = await run([add("call.add"), submit("call.submit"), remove("call.remove"), submit("call.again")]);
    expect(latestOf("core.run_node", seen[3]!)).toMatchObject({ ok: false, code: "permission_required", missing: ["delete"], requestId: "permission-request:1" });
    expect(wrapper.request()).toMatchObject({ requestId: "permission-request:1", missing: ["delete"] });
    expect(state.acted).not.toContain("demo.remove");
    expect(state.lines).toBe(1);
    expect(undoRecords(wrapper.declarations())).toEqual([]);
  });

  it("still asks about a delete that names an act which only modified something", async () => {
    const { seen, state, wrapper } = await run([edit("call.edit"), remove("call.remove", "act-1"), submit("call.submit")]);
    expect(latestOf("core.run_node", seen[2]!)).toMatchObject({ ok: false, code: "permission_required", missing: ["delete"] });
    expect(state.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(wrapper.request()?.missing).toEqual(["delete"]);
    expect(state.acted).toContain("demo.edit");
    expect(state.acted).not.toContain("demo.remove");
    expect(undoRecords(wrapper.declarations())).toEqual([expect.objectContaining({ consequences: ["delete"], permitted: false, missing: ["delete"], undoes: "act-1" })]);
  });

  it("refuses the next test after a trial until the trial's own act is undone", async () => {
    const { seen, asked, state, wrapper } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo.1", "act-1"), test("call.test.2"),
      test("call.test.3"), remove("call.undo.2", "act-2"), test("call.test.4"), submit("call.again")
    ]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ trialRunId: "trial.1" });
    const refused = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)!;
    expect(refused).toMatchObject({ ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2", did: "trial step 1 \"Inspect\"" }], differs: ["1 lines where the start had 0"] });
    // A trial's act was made by no exploration call, so it names none.
    expect((refused.actsToUndo as JsonObject[])[0]!.call).toBeUndefined();
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[8]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.2", leftOnSite: [{ act: "act-3" }] });
    expect(asked).toHaveLength(2);
    expect(wrapper.request()).toBeUndefined();
    expect(undoRecords(wrapper.declarations()).map((record) => record.undoes)).toEqual(["act-1", "act-2"]);
    expect(state.lines).toBe(1);
  });

  it("raises no cross-check finding for the undo records", async () => {
    const { wrapper, state } = await run([add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo", "act-1"), test("call.test.2"), submit("call.again")]);
    const others = wrapper.declarations().filter((record) => record.undoes === undefined);
    expect(undoRecords(wrapper.declarations())).toHaveLength(1);
    const crossCheck = await wrapper.crossCheck();
    expect(crossCheck).toMatchObject({ declared: ["create_new"], undeclared: [], actions: others.length });
    expect(crossCheck?.verdict).not.toBe("undeclared");
    expect(crossCheck?.declared).not.toContain("delete");
    expect(state.said).toEqual([]);
  });
});
