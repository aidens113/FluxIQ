// Proof 1 of the read-list redesign (`read-list-collect-design.md` section 7):
// a provider-free build test of lane C's shape, end to end.
//
// Lane C (`everything-store-plus-earbuds-under-50`) reads a 5-page result list
// whose page N+1 opens with page N's last row. With the read reading one page,
// the Flow is: navigate, an optional Decline, type the query, read, Next page,
// with the read repeated through Next page while it succeeds. Here a fake host
// serves the 5 pages and Next page answers `ended` after page 5, and the test
// expects three things of the one Flow:
//   1. the build's test (`replayAutomationStudioFlowDraft`, then the summary)
//      says the Flow would store the 13 distinct rows, the 4 boundary repeats
//      counted as removed and none of them called stored twice;
//   2. the build-test judge's request carries that answer and its account;
//   3. the stored Flow, run by the executor with fake natives into the real
//      run-dataset store and processed as a run's end processes it, stores the
//      same 13 rows in the same order.
// The llm barrel first, as `../../../llm/decision-context/tests/recorded-runs.ts` says why.
import { replayAutomationStudioFlowDraft, type AutomationStudioLlmEvidenceToolExecutionResult, type AutomationStudioLlmProvider, type AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, AutomationStudioNodeRegistry, type AutomationNodeExecutionResult, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioProjectAdministration, AutomationStudioProjectDatabasePool, AutomationStudioProjectRunDatasetStore, AutomationStudioProjectRuntimeStreamStore } from "../../../../storage/project/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowDraftWrittenStep } from "../../../flow-bootstrap/authoring/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../index.ts";
import { automationStudioBuildTestJudge } from "../judge.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";

const SITE = "http://127.0.0.1:61777/scenarios/everything-store/";
const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"];
const INSTRUCTION = "Find wireless Plus earbuds under $50 rated 4 stars or more, not sponsored, from every page of results.";
const PROJECT = "project.paged-read";
const RUN = "run.paged-read";

// --- the store: 13 distinct qualifying rows over 5 pages, each page after the first opening with the last row of the page before ---
const row = (n: number): JsonObject => ({ name: `Earbuds ${n}`, price: `$${20 + n}.99`, rating: "4.5", url: `/item/${n}` });
const ROWS = Array.from({ length: 13 }, (_, index) => row(index + 1));
const PAGES: JsonObject[][] = [[1, 2, 3], [3, 4, 5, 6], [6, 7, 8], [8, 9, 10, 11], [11, 12, 13]].map((page) => page.map((n) => ROWS[n - 1]!));
const COLLECTED = PAGES.flat().length;
const LABELS = ROWS.map((each) => String(each.name));

// --- the library: the web fixture, plus Next page as the domain declares it (an `ended` branch) ---
const fixture = webDomainNodeDefinitionsFixture();
const READ = "web.output.dom-extract_list";
const NEXT = "web.output.dom-next_page";
const ENDED: AutomationNodePort = { id: "ended", label: "Ended", valueType: "any", role: "branch" };
const click = fixture.find((definition) => definition.id === "web.output.dom-click")!;
const nextPage: AutomationStudioNodeDefinition = {
  ...click, id: NEXT, label: "Next Page", description: "Show the next page of a detected list, or answer ended when there is none.",
  source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
  outputAction: { fixedOutputId: "web.dom.next_page" }, outputs: [...click.outputs, ENDED]
};
const definitions = [...fixture, nextPage];
const registry = new AutomationStudioNodeRegistry();
for (const definition of definitions) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

// --- the draft the build would propose ---
const OUTPUT_OF: Record<string, string> = {
  "web.output.browser-navigate": "web.browser.navigate", "web.output.dom-click": "web.dom.click", "web.output.dom-type": "web.dom.type",
  [READ]: "web.dom.extract_list", [NEXT]: "web.dom.next_page"
};

function step(position: number, node: string, parameters: JsonObject, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, callId: `call.${position}`, actionId: node, toolId: "core.run_node",
    input: { node, parameters, consequences: [] }, ranWith: { node, parameters, consequences: [] },
    effect: node === READ ? "observe" : "mutate", effectApplied: true, disposition: "kept", proposes: true,
    replay: { from: { location: SITE } }, ...over
  };
}

const LIST = { item: ".result-card", fields: { name: ".title", price: ".price", rating: ".rating", url: "a@href" } };
const DRAFT = [
  step(1, "web.output.browser-navigate", { url: SITE }),
  step(2, "web.output.dom-click", { selector: "#decline" }, { routing: { kind: "optional" } }),
  step(3, "web.output.dom-type", { selector: "input#q", text: "wireless earbuds" }),
  step(4, READ, { extractList: LIST }, { routing: { kind: "repeat", through: "d5", while: "d5" } }),
  step(5, NEXT, { selector: "a.next" })
];

function write(draftStep: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftWrittenStep | undefined {
  const node = OUTPUT_OF[draftStep.actionId];
  const parameters = (draftStep.input.parameters ?? {}) as JsonObject;
  if (!node) return undefined;
  return { description: draftStep.actionId === READ ? "read the results" : `step ${draftStep.position}`, node, entries: Object.entries(parameters).map(([key, value]) => ({ key, value: typeof value === "string" ? value : JSON.stringify(value) })) };
}

function assembled() {
  const plan = assembleAutomationStudioFlowDraftPlan({ steps: DRAFT, write, registry, resolution, summary: "Read every page of earbuds" });
  expect(plan.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return plan.plan!.subflows[0]!;
}

// --- 1. the build's test, against a fake host serving the 5 pages ---
type Call = { callId: string; value: JsonObject };

function host() {
  let reads = 0;
  let nexts = 0;
  const executeTool = async ({ value }: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    const result = (resultCode: string, evidence: JsonValue = { ok: true }, outputs?: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult =>
      ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: resultCode === "core.replay.replayed", resultCode, ...(outputs ? { outputs } : {}) });
    if (value.node === READ) {
      const page = PAGES[reads]!;
      reads += 1;
      return result("core.replay.replayed", { ok: true, said: `the step ran again: kept ${page.length} rows from 1 page`, readRows: { rows: page.map((each) => ({ name: each.name! })) } }, { records: page });
    }
    if (value.node === NEXT) {
      nexts += 1;
      return result(nexts === PAGES.length ? "core.replay.ended" : "core.replay.replayed");
    }
    return result("core.replay.replayed");
  };
  return { executeTool, reads: () => reads };
}

async function buildTest() {
  const nodes = assembled().nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) }));
  const fake = host();
  const replayed = await replayAutomationStudioFlowDraft({ steps: DRAFT, attempt: 1, executeTool: fake.executeTool });
  const summary = automationStudioBuildTestResultSummary({
    steps: DRAFT, report: { verdict: replayed.verdict, observations: replayed.observations, reused: false }, nodes,
    instructionText: INSTRUCTION, startLocation: SITE, deniedEvidenceKeys: DENIED
  });
  return { replayed, summary, reads: fake.reads() };
}

// --- 3. the stored Flow, run with fake natives into the real run-dataset store ---
let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;
afterEach(async () => {
  await pool?.closeAll();
  pool = undefined;
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = "";
});

async function openStore(): Promise<AutomationStudioProjectRunDatasetStore> {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-paged-read-proof-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: PROJECT });
  const lease = await pool.acquire(PROJECT);
  await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.paged-read', 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
  const runtime = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: PROJECT });
  await runtime.upsertRunSummary({ schemaVersion: "0.1", runId: RUN, flowId: "flow.paged-read", projectId: PROJECT, status: "succeeded", startedAt: 10, finishedAt: 100, updatedAt: 100, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 } as never);
  await runtime.close();
  await lease.release();
  await admin.close();
  return await AutomationStudioProjectRunDatasetStore.open({ pool, projectId: PROJECT });
}

type Implementation = (call: { inputs: Readonly<Record<string, JsonValue>>; parameters: Readonly<Record<string, JsonValue>> }) => AutomationNodeExecutionResult;

async function storedRun(store: AutomationStudioProjectRunDatasetStore) {
  const subflow = assembled();
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1", flowId: "flow.paged-read", ownerKind: "task", ownerId: "task.paged-read", name: "Paged read", createdAt: 1, updatedAt: 1,
    nodes: subflow.nodes.map((node) => ({ id: node.key, definitionId: node.definitionId, ...(node.parameters ? { parameterValues: node.parameters } : {}) })),
    edges: subflow.edges.map((edge, index) => ({ id: `e${index}`, sourceNodeId: edge.source.nodeKey, sourcePortId: edge.source.portId, targetNodeId: edge.target.nodeKey, targetPortId: edge.target.portId }))
  } as AutomationStudioFlowDocument;
  // Every web node emits its output for dispatch, as the domain's do. The read carries its assembled record output,
  // with the records path the domain's dispatch fills in (the definition's `metadata.recordsPath`), and the executor captures it.
  const recordsPath = (definitions.find((definition) => definition.id === READ)!.metadata as { recordsPath: string }).recordsPath;
  const dispatching = (outputId: string): Implementation => ({ parameters }) => ({
    status: "success", route: "success", outputs: {},
    effects: [{ type: "policy.output.dispatch", payload: { outputId, parameters: {}, ...(parameters.recordOutput ? { recordOutput: { ...(parameters.recordOutput as JsonObject), recordsPath } } : {}) } }]
  });
  const implementations = Object.fromEntries(Object.values(OUTPUT_OF).map((outputId) => [outputId, dispatching(outputId)]));
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions.filter((definition) => Object.values(OUTPUT_OF).includes(definition.outputAction?.fixedOutputId ?? "")) },
    { packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", implementations }
  );
  let reads = 0;
  let nexts = 0;
  const trace = await runAutomationStudioGraph(flow, {
    nativeNodeExecutor: ({ node, inputs, signal }) => runtime.execute(node, inputs, signal),
    effectDispatcher: (effect) => {
      const outputId = (effect.payload as { outputId?: string } | undefined)?.outputId;
      // The domain's payload is `outputs.result`, and the records path is read inside it (`../../../executor/record-capture.ts`).
      if (outputId === "web.dom.extract_list") return { status: "success", route: "success", outputs: { result: { result: { extracted: PAGES[reads++]! } } } };
      // The dispatch answers Next page's route, as `../../../io-policy.ts` lifts the action's `payload.route` (S2 C5).
      if (outputId === "web.dom.next_page") return { status: "success", route: ++nexts === PAGES.length ? "ended" : "success", outputs: {} };
      return { status: "success", route: "success", outputs: {} };
    },
    // As `service/datasets/run-datasets.ts` stores a batch; the store only compares a dataset's digests, so any stable SHA-256 of the schema serves.
    onRecordBatch: (batch) => store.appendBatch({
      runId: RUN, datasetId: batch.datasetId, label: batch.label, nodeId: batch.nodeId, attemptId: batch.attemptId, batchKey: batch.batchKey,
      schema: batch.schema, schemaDigest: `sha256:${createHash("sha256").update(JSON.stringify(batch.schema)).digest("hex")}`, writeMode: batch.writeMode, process: batch.process,
      rows: batch.rows, invalidCount: batch.invalidCount, truncated: batch.truncated
    })
  });
  // The run's end, as `service/datasets/run-datasets.ts` calls it.
  const processed = await store.processRunDatasets(RUN);
  return { trace, processed };
}

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: INSTRUCTION,
  scope: { kind: "flow", projectId: PROJECT, flowId: "flow.paged-read" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

describe("proof 1: lane C's paged read, provider-free, from the build's test to the stored Flow", () => {
  it("the build's test reads 5 pages, ends on Next page's ended, and stores the 13-row answer with the 4 boundary repeats removed", async () => {
    const { replayed, summary, reads } = await buildTest();
    expect(reads).toBe(5);
    expect(replayed.verdict.ok).toBe(true);
    expect(replayed.verdict.outcomes.find((outcome) => outcome.step === 5)?.passes?.at(-1)).toMatchObject({ pass: 5, resultCode: "core.replay.ended" });
    const stores = summary.buildTest?.stores ?? [];
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatchObject({ steps: [4], passes: 5, collected: COLLECTED, answer: { rows: 13, labels: LABELS }, removed: { duplicates: 4, filteredOut: 0, cut: 0 } });
    expect(stores[0]!.repeated).toBeUndefined();
    expect(stores[0]!.keptNone).toBeUndefined();
  });

  it("the build-test judge's request carries the answer and its account, and no page's row values beyond the labels", async () => {
    const { summary } = await buildTest();
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async (request: AutomationStudioLlmTaskRequest) => {
        seen.push(request);
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 } };
      }
    };
    const verdict = await automationStudioBuildTestJudge({ instructions: [instruction], deniedEvidenceKeys: DENIED, projectId: PROJECT, flowId: "flow.paged-read", provider })({ summary, budget: { maxCostUsd: 0.2 } });
    expect(verdict.verdict).toBe("yes");
    expect(seen.length).toBeGreaterThan(0);
    const sent = JSON.stringify(seen[0]!.context);
    const store = (seen[0]!.context as { resultSummary?: { buildTest?: { stores?: JsonObject[] } } }).resultSummary?.buildTest?.stores?.[0];
    expect(store).toMatchObject({ passes: 5, collected: COLLECTED, answer: { rows: 13, labels: LABELS }, removed: { duplicates: 4, filteredOut: 0, cut: 0 } });
    // The rows travel to the judge as labels only: no stored price or link reached the request.
    expect(sent).not.toContain("/item/13");
    expect(sent).not.toContain("$33.99");
  });

  it("the stored Flow, run with fake natives, stores the same answer: 5 passes collected, the same 13 rows in order", async () => {
    const store = await openStore();
    try {
      const { trace, processed } = await storedRun(store);
      expect(trace.status).toBe("succeeded");
      const of = (definitionId: string) => trace.attempts.filter((attempt) => attempt.definitionId === definitionId);
      expect(of(READ)).toHaveLength(5);
      expect(of(NEXT).map((attempt) => attempt.route)).toEqual(["success", "success", "success", "success", "ended"]);
      expect(processed).toHaveLength(1);
      expect(processed[0]!.processing).toMatchObject({ collected: COLLECTED, duplicates: 4, filteredOut: 0, cut: 0, kept: 13 });
      expect(processed[0]!.processing?.passes.map((pass) => [pass.rows, pass.newRows])).toEqual([[3, 3], [4, 3], [3, 2], [4, 3], [3, 2]]);
      const page = await store.getPage({ runId: RUN, datasetId: processed[0]!.datasetId, limit: 200 });
      expect(page?.rows.map((each) => each.name)).toEqual(LABELS);
      // The build test named the same dataset and the same answer.
      const { summary } = await buildTest();
      expect(summary.buildTest?.stores?.[0]).toMatchObject({ dataset: processed[0]!.datasetId, answer: { labels: page?.rows.map((each) => each.name) } });
    } finally {
      await store.close();
    }
  });
});
