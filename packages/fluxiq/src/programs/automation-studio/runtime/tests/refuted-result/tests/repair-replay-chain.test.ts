// The whole wrong-answer chain, provider-free, through the real service: a Flow
// runs, returns the wrong dataset, the judge refutes it with a directive, the
// re-author is handed that directive and edits the Flow, the edit is persisted,
// the repaired Flow is re-run and judged right, and the persisted Flow then
// replays the right dataset again and again with no provider call at all.
//
// The provider reaches the service the way the host's does: on the caller's
// own key, released per call to their session. A model call needs no grant.
//
// Every link of this chain has a unit test in the directory that owns it. None
// of them had been seen to hold *together*, and the live runs that reached the
// repair (`run-mulxk0ro-36bf090d`, `run-mum06sfc-f1d9403f`) each broke at a
// seam between two units that were individually green. So the provider here is
// scripted, but it answers from what it is actually sent: the judge refutes
// any dataset that holds a row the instruction excludes, and the re-author reads
// the judge's advice out of its own brief before it edits anything. A link that
// stops carrying what the next one needs fails this file.
//
// The Flow is shaped like the live ones: a step that holds a resolved locator
// under a key the domain denies (`selector`), before the step that reads the
// items. A re-author seeded from that Flow once refused its own first request.
//
// **A repair is accepted only after the whole repaired Flow ran from its start
// and was judged (t244, user 2026-10-02).** The re-author is an extend build:
// each step it carries from the Flow must run again in the build before it can
// finish, so it reruns the consent click unchanged and the read with the judge's
// fix, in the Flow's order, one rerun per decision; its test then runs both from
// the start, and only a yes about that Flow is approved and applied. The
// stand-in domain says how to run its steps again through
// `automationStudioReplayingBinding` (`../../replaying-binding.ts`).

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { decideAutomationStudioChangeConfidence } from "../../../flow-change/index.ts";
import { createAutomationStudioSessionKeyProviderResolver } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

const ACTOR = { actorUserId: "user-t176", actorSessionId: "session-t176" };
const KEY_ID = "secret:key";
const DOMAIN = "t176";
const CLICK_ID = "t176.action.click";
const EXTRACT_ID = "t176.output.extract-list";
const SELECTOR = "#consent > button.accept";

/** Everything the page lists. The instruction asks for the red ones. */
const CATALOG = [
  { name: "Alpha", colour: "red" },
  { name: "Beta", colour: "blue" },
  { name: "Gamma", colour: "red" }
];
const RIGHT_ANSWER = [{ name: "Alpha" }, { name: "Gamma" }];
/** What the judge says to change, and what the re-author must be seen to have read. */
const ADVICE = "Keep only the red products: set where to red on the step that reads the list.";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
};

function actionNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"], extraOutputs: AutomationStudioNodeDefinition["outputs"] = []): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id,
    version: "1.0.0",
    label,
    description: `${label} on the fixture page.`,
    category: "action",
    source: { kind: "importer", domainId: DOMAIN, packageId: "t176.package", implementationKey: id },
    availability: { kind: "domain", domainId: DOMAIN },
    capabilities: { executable: true },
    outputAction: { fixedOutputId: id },
    inputs: [{ id: "in", label: "In", valueType: "any" }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }, { id: "failed", label: "Failed", valueType: "any" }, ...extraOutputs],
    parameters
  };
}

const CLICK = actionNode(CLICK_ID, "Click", [{ id: "selector", label: "Selector", valueType: "string", required: false }]);
const EXTRACT = actionNode(EXTRACT_ID, "Extract list", [
  { id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } },
  { id: "where", label: "Only items whose colour is", valueType: "string", required: false }
], [{ id: "records", label: "Records", valueType: "array", role: "data" }]);

function nativeRuntime(): AutomationStudioNativeNodeRuntime {
  return new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "t176.package", packageVersion: "1.0.0", domainId: DOMAIN, nodes: [CLICK, EXTRACT] },
    {
      packageId: "t176.package",
      packageVersion: "1.0.0",
      implementations: {
        [CLICK_ID]: () => ({ status: "success", outputs: { success: true } }),
        [EXTRACT_ID]: ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [{
            type: "policy.output.dispatch",
            payload: {
              outputId: EXTRACT_ID,
              parameters: typeof parameters.where === "string" ? { where: parameters.where } : {},
              recordOutput: parameters.recordOutput ?? null
            }
          }]
        })
      }
    }
  );
}

function providerResponse(content: JsonObject): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 14, completion_tokens: 7, total_tokens: 21 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => { tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t176-")); });
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function createHarness() {
  const io = new IoRegistry();
  io.registerOutput(DOMAIN, { definition: { id: CLICK_ID, title: "Click" }, mode: "request", dispatch: async (request) => ({ ok: true, domainId: DOMAIN, outputId: request.outputId, payload: {} }) });
  io.registerOutput(DOMAIN, {
    definition: { id: EXTRACT_ID, title: "Extract list" },
    mode: "request",
    // The page: every item, or the ones whose colour the step names.
    dispatch: async (request) => {
      const where = (request.payload as JsonObject | undefined)?.where;
      const items = CATALOG.filter((item) => typeof where !== "string" || item.colour === where).map((item) => ({ name: item.name }));
      return { ok: true, domainId: DOMAIN, outputId: request.outputId, payload: { result: { extracted: items } } };
    }
  });

  /** Every provider request, in order, by task kind, with what it was sent. */
  const calls: Array<{ taskKind: string; sent: string }> = [];
  let service: AutomationStudioService | undefined;
  let revealCount = 0;
  let decisions = 0;
  const key = { id: KEY_ID, name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "global", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-flash" } };

  const resolveProvider = createAutomationStudioSessionKeyProviderResolver({
    ports: {
      snapshot: async () => ({ keys: [{ ...key }] }),
      createSessionRevealAuthorization: async () => ({ authorizationId: `reveal-t176-${++revealCount}`, keyId: key.id, keyUpdatedAtMs: key.updatedAtMs }),
      revealKeyWithAuthorization: async () => ({ value: "test-provider-secret" }),
      revokeRevealAuthorization: () => undefined
    },
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role?: string; content?: string }> };
      const sent = body.messages?.find((message) => message.role === "user")?.content ?? "{}";
      const taskKind = String((JSON.parse(sent) as { taskKind?: string }).taskKind);
      calls.push({ taskKind, sent });

      if (taskKind === "loop_verification") {
        // The judge reads the rows it was shown. A blue item is not an answer.
        const wrong = sent.includes("Beta");
        return providerResponse({
          kind: "diagnosis",
          summary: wrong ? "The records include items that are not red." : "Every record is a red product.",
          diagnosis: wrong ? { answersRequest: "no", changed: ADVICE } : { answersRequest: "yes" }
        });
      }

      if (taskKind === "evidence_tool_decision") {
        decisions += 1;
        // The carried consent click first, as it stands; then the read, corrected from the brief; then finish.
        const decision = decisions === 1 ? rerunConsentClick() : decisions === 2 ? repairDecision(sent) : { kind: "complete", result: { summary: "Read only the red products." } };
        return providerResponse({ kind: "evidence_tool_decision", summary: "Narrow the extraction to red products.", decision });
      }

      throw new Error(`Unexpected provider task kind: ${taskKind}`);
    }) as typeof fetch
  });

  // The test of the whole Flow runs its steps again through this stand-in: the replay calls it answers are listed here.
  const runtime = automationStudioReplayingBinding({
    domainId: DOMAIN,
    // The web domain's rule, which a seeded click step used to trip.
    deniedEvidenceKeys: ["selector"],
    tools: [{ toolId: "t176.inspect", description: "Inspect the fixture page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { runnable: [CLICK_ID, EXTRACT_ID] },
    executeTool: async ({ toolId, value }: { toolId: string; value: JsonObject }) => toolId === "core.run_node"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { controls: [{ label: "Products" }] }
  });
  service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: async (input) => resolveProvider(input),
    llmEvidenceRuntime: runtime
  }).bindIoRuntime(io, DOMAIN).bindNativeNodeRuntime(nativeRuntime());
  services.add(service);

  const project = await service.createProject({ name: "t176 project", domainId: DOMAIN });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.t176-chain", name: "Red products" });
  const training = adaptiveTrainingMetadata();
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...flow,
      metadata: {
        ...(flow.metadata ?? {}),
        ...training,
        trainingModeSettings: { ...(training.trainingModeSettings as JsonObject), resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 } } }
      }
    }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(project.id, subflow.graphFlowId!);
  // The Flow as a build left it: it accepts the consent wall, then reads every item.
  await service.saveFlow({
    projectId: project.id,
    flow: {
      ...graph,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "accept", definitionId: CLICK_ID, parameterValues: { selector: SELECTOR } },
        { id: "extract", definitionId: EXTRACT_ID, parameterValues: { recordOutput: RECORD_OUTPUT } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.accept", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "accept", targetPortId: "in" },
        { id: "accept.extract", sourceNodeId: "accept", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.t176",
    title: "Red products",
    body: "Return the name of every red product the page lists, and nothing else.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });

  return { service, projectId: project.id, flowId: flow.flowId, graphFlowId: subflow.graphFlowId!, calls, replays: runtime.replays };
}

/**
 * The carried consent click, run again as it stands: it never ran in this
 * build, so the repaired Flow could not be tested whole without it. It changes
 * nothing lasting, so its consequences are none.
 */
function rerunConsentClick(): JsonObject {
  return { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { consequences: [] } }] };
}

/**
 * The re-author's repair, made only from what it was handed: the repair brief
 * must carry the judge's advice, and the step that reads the list must be in
 * the Flow the draft it was shown holds, under the number it is shown with
 * there (the click's rerun before it took the click's place, so the original
 * click stays listed as the step it replaced and the read is no longer step 2).
 * Anything missing is an answer that does nothing, so the chain stops short and
 * the file says where.
 */
function repairDecision(sent: string): JsonObject {
  const request = JSON.parse(sent) as {
    context?: {
      instructions?: { instructions?: Array<{ instructionId: string; body: string }> };
      evidenceLoop?: { evidence?: Array<{ toolId?: string; value?: { steps?: Array<{ step?: number; actionId?: string; inResult?: boolean }> } }> };
    };
  };
  const brief = request.context?.instructions?.instructions?.find((instruction) => instruction.instructionId === "core.result_repair.brief");
  if (!brief?.body.includes("red")) return { kind: "complete", result: { summary: "Nothing to change." } };
  const draft = request.context?.evidenceLoop?.evidence?.find((entry) => entry.toolId === "core.flow_draft")?.value;
  const read = draft?.steps?.find((step) => step.actionId === EXTRACT_ID && step.inResult === true);
  if (read?.step === undefined) return { kind: "complete", result: { summary: "No step reads the list." } };
  return {
    kind: "amend_draft",
    amendments: [{ step: read.step, change: "rerun", input: { node: EXTRACT_ID, parameters: { recordOutput: RECORD_OUTPUT, where: "red" }, consequences: [] } }]
  };
}

async function runRows(harness: Harness, runId: string) {
  return (await harness.service.runDatasets.getRunDatasetPage({ projectId: harness.projectId, runId, datasetId: "products" }))?.rows;
}

describe("a wrong answer, end to end, with a scripted provider", () => {
  it("is refuted, repaired from the judge's directive, persisted, judged right, and then replays with no provider call", { timeout: 120_000 }, async () => {
    const harness = await createHarness();

    const run = await harness.service.runRuntimeSession({
      projectId: harness.projectId,
      flowId: harness.flowId,
      llmExecution: { ...ACTOR, intent: "build_and_adapt" }
    });
    const detail = await harness.service.getFlowRunDetail(harness.projectId, run.runId);

    // Refuted (asked twice, as a refutation always is), re-authored in three
    // decisions -- the carried click rerun, the read rerun with the fix, the
    // completion -- the re-author's own test of the whole Flow judged (it is a
    // build: lane D F43, t244), and the repaired run judged once.
    expect(harness.calls.map((call) => call.taskKind)).toEqual(["loop_verification", "loop_verification", "evidence_tool_decision", "evidence_tool_decision", "evidence_tool_decision", "loop_verification", "loop_verification"]);
    // The build's judge read the re-author's own test, not a run.
    expect(harness.calls[5]!.sent).toContain("buildTest");
    // That test ran the whole repaired Flow from its start: put back, then both steps run again in order.
    expect(harness.replays.filter((call) => call.value.replay === "step").map((call) => call.value.node)).toEqual([CLICK_ID, EXTRACT_ID]);
    // The judge was shown the wrong rows first and the right rows last.
    expect(harness.calls[0]!.sent).toContain("Beta");
    expect(harness.calls[6]!.sent).not.toContain("Beta");
    expect(harness.calls[6]!.sent).toContain("Gamma");
    // The re-author was never shown the denied locator, and the Flow never lost it.
    for (const call of harness.calls) expect(call.sent).not.toContain(SELECTOR);

    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
    expect(JSON.stringify(detail?.metadata?.resultReauthor)).not.toContain("unexpected_error");
    expect(detail?.metadata?.resultRepair).toMatchObject({ attempted: true, attempts: 1, phase: "settled", outcome: "answered" });
    expect(run.status).toBe("succeeded");
    expect(await runRows(harness, run.runId)).toEqual(RIGHT_ANSWER);

    // The edit is durable: the adaptation is applied and the Flow on disk reads only red items.
    const reauthor = detail?.metadata?.resultReauthor as { adaptationId?: string };
    await expect(harness.service.getFlowBootstrapAdaptation(harness.projectId, harness.flowId, reauthor.adaptationId!)).resolves.toMatchObject({ mode: "extend", status: "applied" });
    const persisted = await harness.service.getFlow(harness.projectId, harness.graphFlowId);
    const byDefinition = (id: string) => persisted.nodes.filter((node) => node.definitionId === id);
    expect(byDefinition(EXTRACT_ID).map((node) => node.parameterValues?.where)).toEqual(["red"]);
    expect(byDefinition(CLICK_ID).map((node) => node.parameterValues?.selector)).toEqual([SELECTOR]);

    // Deterministic replay: the persisted Flow, run again with no model taking part, twice,
    // returns the right dataset and asks no provider anything -- and says so,
    // with a zero accounting a reader can certify. Each replay is recorded on the
    // repair that wrote the Flow, which the second one makes `established`.
    const callsBeforeReplay = harness.calls.length;
    const tiers: string[] = [];
    for (let replay = 0; replay < 2; replay += 1) {
      const replayed = await harness.service.runRuntimeSession({ projectId: harness.projectId, flowId: harness.flowId });
      expect(replayed.status).toBe("succeeded");
      expect(await runRows(harness, replayed.runId)).toEqual(RIGHT_ANSWER);
      const replayedDetail = await harness.service.getFlowRunDetail(harness.projectId, replayed.runId);
      expect(replayedDetail?.metadata?.resultReauthor).toBeUndefined();
      expect(replayedDetail?.interventions).toEqual([]);
      expect(replayedDetail?.metadata?.llmGate).toEqual({ invoked: false, ok: true, costAccounting: { calls: 0, explorationCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, budgetBreaches: 0, pendingCalls: 0 }, providerCalls: [], providerCallsOmitted: 0 });
      const repair = await harness.service.getFlowBootstrapAdaptation(harness.projectId, harness.flowId, reauthor.adaptationId!);
      expect(repair?.validationResults?.at(-1)).toMatchObject({ runId: replayed.runId, kind: "replay", status: "succeeded" });
      tiers.push(decideAutomationStudioChangeConfidence({ validationResults: repair?.validationResults ?? [], riskLevel: repair!.riskLevel }).tier);
    }
    expect(harness.calls.length).toBe(callsBeforeReplay);
    expect(tiers).toEqual(["provisional", "established"]);
    // The run that asked a model is neither a replay nor zero-cost.
    const repair = await harness.service.getFlowBootstrapAdaptation(harness.projectId, harness.flowId, reauthor.adaptationId!);
    expect(repair?.validationResults?.map((result) => result.runId)).not.toContain(run.runId);
    expect((detail?.metadata?.llmGate as { costAccounting?: { calls?: number } } | undefined)?.costAccounting?.calls).not.toBe(0);
  });

});
