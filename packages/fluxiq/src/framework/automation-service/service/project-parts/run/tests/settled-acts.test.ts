// @fluxiq-test-group real-sql
// A task's attempt ran a lasting part; the Flow it saved then runs for real, from the top, through a
// pinned call. The real act record, the real run gate, the real store, the real executor and frames.
// Asserted: what reached the domain.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowSubflow } from "../../../../../../flows/authoring/model/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioKnownParts } from "../../../../../../runtime/project-parts/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, type AutomationStudioHarnessOptionLoopBinding, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../../composite-executor.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace } from "../../../../executor/index.ts";
import { AutomationStudioAnswerFirstRunActStore, automationStudioAnswerFirstRunActGate } from "../../../answer-first/run-acts/index.ts";
import { automationStudioRunGraphOptions, automationStudioSubflowGraphSource } from "../../../runtime-session/index.ts";
import { automationStudioAnswerFirstKnownParts } from "../../known-parts.ts";
import type { AutomationStudioProjectPartRunRefusal, ProjectPartSettled } from "../index.ts";
import { actionGraph, openRowsHarness, PROJECT, rowGraph, siteGraph, type RowsHarness } from "./part-rows-harness.ts";

const FLOW = "flow.saved";

type AttemptOffered = Parameters<typeof automationStudioAnswerFirstKnownParts>[0];

/** The Flow the attempt saved: its one graph pins the part. */
function flowGraphPinning(partId: string): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: "graph.saved", projectId: PROJECT, name: "Saved", now: 1, metadata: { parentFlowId: FLOW, parentSubflowId: "subflow.main", subflowGraph: true } });
  return {
    ...blank,
    nodes: [
      { id: "main.start", definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" },
      { id: "main.call", definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Do it", parameterValues: { part: { partId, version: 1 }, inputs: {} } }
    ],
    edges: [{ id: "main.1", sourceNodeId: "main.start", sourcePortId: "success", targetNodeId: "main.call", targetPortId: "in" }]
  };
}

describe("the acts of a part an attempt ran", () => {
  let harness: RowsHarness;
  beforeEach(async () => {
    harness = await openRowsHarness();
  });
  afterEach(async () => {
    await harness.close();
  });

  const told = (record: AutomationStudioAttemptActRecord): ProjectPartSettled => (call, outcome) => { record.settled({ ...call, stage: "exploration" }, { ...outcome, words: { what: "", where: "" } }); };
  const ranInAttempt = async (partId: string, record: AutomationStudioAttemptActRecord) => {
    const ran = await harness.parts.runAs({ projectId: PROJECT, partId, inputs: {}, caller: "build", permittedConsequences: ["create_new"], permission: async () => ({ permitted: true, missing: [], requestId: null }), settled: told(record) });
    if ("ok" in ran) throw new Error((ran as AutomationStudioProjectPartRunRefusal).code);
    return ran;
  };
  /** A real run of the saved Flow, as the service makes one: the run gate only when it is given a record. */
  const realRun = async (partId: string, seed: AutomationStudioAttemptActRecord | undefined): Promise<AutomationStudioGraphExecutionTrace> => {
    const executor = harness.executor();
    const base = automationStudioRunGraphOptions({ inputs: {}, signal: new AbortController().signal, authorizedDomainIds: [], ...executor } as Parameters<typeof automationStudioRunGraphOptions>[0]);
    const options: AutomationStudioGraphExecutionOptions = {
      ...base, hostRuntime: executor.hostRuntime!, currentSubflowId: "subflow.main",
      subflowGraphs: automationStudioSubflowGraphSource({ subflows: [] as AutomationStudioFlowSubflow[], parentFlowId: FLOW, loadGraph: async () => undefined, representationOf: () => "subflow_graph", library: harness.parts.graphs(PROJECT, FLOW) })
    };
    return await runCanonicalAutomationStudioFlow(flowGraphPinning(partId), [], seed ? automationStudioAnswerFirstRunActGate(options, { record: seed }) : options);
  };

  const siteWithRowsAcrossACall = async () => await harness.save([actionGraph("act"), siteGraph("site", { subflowId: "subflow.act" })]);

  it("each landed act reaches the record as the node ran it, with its row, and says what it was by its class", async () => {
    const record = new AutomationStudioAttemptActRecord();
    await ranInAttempt(await siteWithRowsAcrossACall(), record);
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
    const acts = record.acts();
    expect(acts.map((act) => act.state)).toEqual(["landed", "landed", "landed"]);
    expect(new Set(acts.map((act) => act.rowIdentity)).size, "one act per row").toBe(3);
    expect(acts[0]!.classes).toEqual(["create_new"]);
    expect(acts[0]!.what).not.toMatch(/Press it/u);
    expect(record.carried({ actionId: "custom.press", parameters: { target: { selector: "#press" } }, row: { key: "a", words: "first" } }), "by the node's own action, parameters and row").toBeDefined();
    expect(record.carried({ actionId: "custom.press", parameters: { target: { selector: "#press" } }, row: { key: "z", words: "another" } }), "another row is another act").toBeUndefined();
  });

  it("the first real run after an attempt that ran a lasting part does not press again; without the record it would", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const partId = await siteWithRowsAcrossACall();
    await ranInAttempt(partId, record);
    harness.domain.pressed.length = 0;
    const first = await realRun(partId, new AutomationStudioAttemptActRecord({ seed: record.data() }));
    expect(first.status, JSON.stringify(first.failure ?? first.message ?? null)).toBe("succeeded");
    expect(harness.domain.pressed, "nothing pressed: each row was already done").toEqual([]);
    const control = await realRun(partId, undefined);
    expect(control.status).toBe("succeeded");
    expect(harness.domain.pressed, "the same run with no record presses each row: the check above is not empty").toEqual(["a", "b", "c"]);
  });

  it("goes through the real store: a first run takes the acts once, and a second, deliberate run acts", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const partId = await siteWithRowsAcrossACall();
    await ranInAttempt(partId, record);
    const paths = { root: "" } as ConstructorParameters<typeof AutomationStudioAnswerFirstRunActStore>[0];
    const store = new AutomationStudioAnswerFirstRunActStore(paths, { flowDirectory: () => "" }, { ensureProjectStructure: async () => undefined } as unknown as ConstructorParameters<typeof AutomationStudioAnswerFirstRunActStore>[2]);
    await store.save(PROJECT, FLOW, record.data());
    harness.domain.pressed.length = 0;
    const seed = await store.forRun(PROJECT, FLOW, "run.first");
    expect(seed?.acts).toHaveLength(3);
    await realRun(partId, new AutomationStudioAttemptActRecord({ seed: seed! }));
    expect(harness.domain.pressed).toEqual([]);
    expect(await store.forRun(PROJECT, FLOW, "run.second"), "a second run finds nothing to carry").toBeUndefined();
  });

  it("an act that may have landed is carried too: a first real run does not press it, and a press that surely did nothing is not an act", async () => {
    harness.page.pressAnswer = (key) => (key === "b" ? "uncertain" : "landed");
    const record = new AutomationStudioAttemptActRecord();
    const partId = await siteWithRowsAcrossACall();
    await ranInAttempt(partId, record);
    expect(record.acts().map((act) => act.state)).toEqual(["landed", "may_have_landed"]);
    harness.page.pressAnswer = () => "landed";
    harness.domain.pressed.length = 0;
    await realRun(partId, new AutomationStudioAttemptActRecord({ seed: record.data() }));
    expect(harness.domain.pressed, "only the row the attempt never reached").toEqual(["c"]);

    const none = new AutomationStudioAttemptActRecord();
    harness.page.pressAnswer = (key, tries) => (key === "a" && tries === 1 ? "unacted" : "landed");
    const again = await harness.save([rowGraph("loop")]);
    await ranInAttempt(again, none);
    expect(none.acts().map((act) => act.state), "the first try surely did nothing and counts for nothing; the second landed").toEqual(["landed", "landed", "landed"]);
  });

  it("a part a run reached through a plain repeat of its own is carried the same way", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const partId = await harness.save([rowGraph("loop")]);
    await ranInAttempt(partId, record);
    harness.domain.pressed.length = 0;
    await realRun(partId, new AutomationStudioAttemptActRecord({ seed: record.data() }));
    expect(harness.domain.pressed).toEqual([]);
  });

  it("through the attempt's own offer: the tool's run tells the record the attempt hands it", async () => {
    const partId = await siteWithRowsAcrossACall();
    const base = (): AutomationStudioHarnessOptionLoopBinding => ({ tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false, targetsUnchanged: true }) });
    const known = { note: "n", parts: [{ partId, version: 1 }] } as unknown as AutomationStudioKnownParts;
    const offered: AttemptOffered = await automationStudioAnswerFirstKnownParts<AttemptOffered>({
      projectId: PROJECT, flowId: FLOW, instructionText: "do what a person asked", startLocation: undefined,
      resolution: { scope: { kind: "global" } },
      parts: { shortlist: async () => known, runAs: (input) => harness.parts.runAs(input) },
      permissionGround: { permittedConsequences: ["create_new"] },
      harnessOptions: base(), continuingOptions: base
    });
    const record = new AutomationStudioAttemptActRecord();
    offered.partActs!.use(record);
    const answer = await offered.harnessOptions.executeTool({ callId: "c1", toolId: AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, value: { partId } as JsonObject }) as AutomationStudioLlmEvidenceToolExecutionResult;
    expect(answer.evidence, JSON.stringify(answer.evidence)).toMatchObject({ ok: true, status: "succeeded", acts: ["create_new"] });
    expect(answer.draft?.ranWith, "and it leaves its one pinned step").toEqual({ part: { partId, version: 1 }, inputs: {} });
    expect(record.acts()).toHaveLength(3);
    expect(harness.domain.pressed).toEqual(["a", "b", "c"]);
  });
});
