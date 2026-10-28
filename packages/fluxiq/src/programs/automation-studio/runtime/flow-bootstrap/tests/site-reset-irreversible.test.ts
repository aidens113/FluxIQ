// Lane D round 9's shape (`run-mv5q4j2n-25784472`, t471) with every Core part
// composed as `service.ts` composes them: the real ledger, permission wrapper
// and candidate authoring loop. Only the domain, the model and the trial runner
// are stand-ins. The stand-in site has two pages: the start, which shows
// nothing of the requests, and a list of requests whose Confirm button becomes
// the words "Request accepted", which no control takes back. Its `startState`
// answers as the web domain does: opaque state, worded differences, the lines
// themselves and where it read.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
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
const START = "https://site.test/", REQUESTS = "https://site.test/requests";
const runNode: AutomationStudioLlmEvidenceTool = {
  toolId: "core.run_node", description: "Run a node.", effect: "mutate", perCallEffect: true,
  inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array" } } },
  initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] }, arrival: { node: "demo.go", parameters: { to: START }, consequences: [] } }
};

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
type Decision = Awaited<ReturnType<Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0]["loop"]["decide"]>>;
type Verdict = { permitted: boolean; missing?: readonly string[]; requestId?: string | null };
const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const receipt = (evidence: readonly Entry[]) => {
  const value = latestOf("core.submit_candidate", evidence)!;
  return { revision: value.revision as number, digest: value.digest as string };
};
const call = (callId: string, node: string, parameters: JsonObject, consequences: AutomationStudioActionConsequence[], extra: JsonObject = {}): Step => () => ({ kind: "tool_call", toolId: "core.run_node", callId, input: { node, parameters, consequences, ...extra } });
const go = (callId: string, to: string) => call(callId, "demo.go", { to }, []);
const confirm = (callId: string, row: number) => call(callId, "demo.confirm", { row }, ["modify_existing"]);
const clickWords = (callId: string, row: number, undoes: string) => call(callId, "demo.words", { row }, [], { undoes });
const submit = (callId: string): Step => () => ({ kind: "tool_call", toolId: "core.submit_candidate", callId, input: plan });
const test = (callId: string): Step => (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId, input: receipt(evidence) });

/** The two-page site, behind the real ledger and permission wrapper. */
function build() {
  const site = { at: START, accepted: [false, false, false] };
  const lines = (): string[] => site.at === START ? ["h1 \"Home\"", "link \"Requests\""] : site.accepted.map((done, row) => done ? `"Request accepted" row ${row + 1}` : `button "Confirm" row ${row + 1}`);
  const ledger = new AutomationStudioSiteResetLedger();
  const wrapper = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [], instructionIds: ["instruction.one"], authoringMode: "candidate", siteReset: ledger,
    newRequestId: () => "permission-request:1", deriveInstructed: async () => [],
    executeTool: async (run) => {
      const name = String(run.value.node);
      const consequences = (run.value.consequences ?? []) as AutomationStudioActionConsequence[];
      const verdict = await run.permission!({ consequences, control: { name: name === "demo.confirm" ? "Confirm" : name, kind: "button" }, verb: "press", effect: name === "demo.look" ? "observe" : "mutate" }) as Verdict;
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, code: "permission_required" } };
      const parameters = (run.value.parameters ?? {}) as JsonObject;
      if (name === "demo.go") site.at = String(parameters.to);
      if (name === "demo.confirm") site.accepted[Number(parameters.row) - 1] = true;
      // Clicking the words that replaced a button changes nothing, though it ran.
      return { kind: "llm_evidence_tool_execution", effectApplied: name !== "demo.look", evidence: { ok: true, at: site.at } };
    }
  });
  const binding = {
    runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go", "demo.look", "demo.confirm", "demo.words"] },
    startState: async (input: { start?: JsonObject }) => {
      const now = { at: site.at, lines: lines() };
      if (!input.start) return { state: now, differs: [], location: site.at, lines: { gone: [], added: [] } };
      const was = input.start.lines as string[];
      const gone = was.filter((line) => !now.lines.includes(line)), added = now.lines.filter((line) => !was.includes(line));
      return { state: now, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: site.at, lines: { gone, added } };
    }
  };
  return { site, ledger, wrapper, binding };
}

async function run(steps: Step[]) {
  const made = build();
  const asked: AutomationStudioCandidateTrialRequest[] = [];
  const seen: Entry[][] = [];
  let index = 0;
  await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: made.binding },
    trial: { candidateId: "candidate.reset", port: async (request): Promise<AutomationStudioCandidateTrialResult> => {
      asked.push(request);
      return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { said: "unsure" }, trialRunId: `trial.${asked.length}` };
    } },
    siteReset: made.ledger,
    siteResetSettleMs: 0,
    loop: {
      tools: [runNode], maxIterations: steps.length, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: made.wrapper.executeTool,
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence) as unknown as Decision;
      }
    }
  }).catch((error: unknown) => ({ error }));
  return { ...made, seen, asked };
}

/** A test naming `acts` under cannotUndo: the model's word that no control of the site undoes them. */
const cannotUndo = (callId: string, acts: string[]): Step => (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId, input: { ...receipt(evidence), cannotUndo: acts } });

describe("a candidate build whose acts the site cannot undo", () => {
  // t775: the trial runs with the acts in place and the judge is told; the model's cannotUndo moves them from `acts` to `cannotUndo`.
  it("runs at once with the confirms still on their own page though the start page is clean, naming them under startedWith.acts, and under cannotUndo once the model says so", async () => {
    const { seen, asked } = await run([
      go("call.go", REQUESTS), confirm("call.c1", 1), confirm("call.c2", 2), confirm("call.c3", 3), submit("call.submit"),
      test("call.test.1"), clickWords("call.words", 1, "act-1"), test("call.test.2"), cannotUndo("call.test.3", ["act-1", "act-2", "act-3"]), submit("call.again")
    ]);
    const first = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)!;
    expect(first).toMatchObject({ verdict: "unsure", trialRunId: "trial.1", startedWith: { acts: [
      { act: "act-1", call: "call.c1", stillThere: ["\"Request accepted\" row 1", "button \"Confirm\" row 1"] },
      { act: "act-2", call: "call.c2" }, { act: "act-3", call: "call.c3" }
    ] } });
    expect(first.code).toBeUndefined();
    expect(String((first.startedWith as JsonObject).instruction)).toContain("nothing was undone first");
    // The click on the words undoes nothing, so the next trial still starts with all three in place.
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[8]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.2", startedWith: { acts: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[9]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", trialRunId: "trial.3", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] } });
    expect(String((ran.startedWith as JsonObject).instruction)).toContain("already done");
    expect(asked).toHaveLength(3);
    // One line per act, each by its id: the gate withholds a control name the model was never shown.
    expect(asked[2]!.startedWith).toEqual(["already done by this build (act-1): press button", "already done by this build (act-2): press button", "already done by this build (act-3): press button"]);
  });

  it("runs at once with the acts in place, and lists them under cannotUndo once the model says no control undoes them", async () => {
    const { seen, asked } = await run([go("call.go", REQUESTS), confirm("call.c1", 1), confirm("call.c2", 2), submit("call.submit"), test("call.test.1"), cannotUndo("call.test.2", ["act-1", "act-2"]), submit("call.again")]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ verdict: "unsure", startedWith: { acts: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)).toMatchObject({ verdict: "unsure", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(asked).toHaveLength(2);
  });

  it("never counts the click on the words as an undo: the act stays in place, and a repeated undo of a kept act is refused", async () => {
    const { seen, ledger } = await run([
      go("call.go", REQUESTS), confirm("call.c1", 1), submit("call.submit"), test("call.test.1"), clickWords("call.words", 1, "act-1"), test("call.test.2"),
      cannotUndo("call.test.3", ["act-1"]), clickWords("call.words.again", 1, "act-1"), submit("call.again")
    ]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)).toMatchObject({ verdict: "unsure", startedWith: { acts: [{ act: "act-1" }] } });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[7]!)).toMatchObject({ verdict: "unsure", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(latestOf("core.run_node", seen[8]!)).toMatchObject({ ok: false, code: "candidate.undo_act_kept", act: "act-1" });
    expect(ledger.inPlace()).toEqual([]);
  });
});
