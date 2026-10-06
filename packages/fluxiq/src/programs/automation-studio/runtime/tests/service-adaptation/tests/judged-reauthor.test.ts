// A re-authored Flow is kept only after a whole run that ran it is judged to
// answer (user, 2026-10-02; t267 blocker 5).
//
// Both re-author routes used to approve *and apply* their extend-mode edit
// inside the build, then re-run the stored Flow and judge it. A re-run that was
// refuted or failed therefore left an unjudged edit on the Flow, and an extend
// cannot be reverted. Now the edit is held -- approved, unapplied -- the re-run
// runs the held graph as an unapplied candidate, and the run's judged end
// applies it only when that run answered (`service/runtime-adaptation/judged-reauthor.ts`).
//
// The harness is `caller-paid-reauthor-check.test.ts`'s: one extraction step in
// the primary Subflow, a re-author build of two decisions (re-run the carried
// step, then finish), the Flow's standing judge refuting the first pass, and the
// caller's key judging the repair.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

const RECORD_OUTPUT: JsonObject = {
  datasetId: "products",
  label: "Products",
  recordsPath: "result.extracted",
  writeMode: "replace",
  schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] }
};

const EXTRACT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.output.extract-list",
  version: "1.0.0",
  label: "Extract list",
  description: "Reads every item of a list.",
  category: "action",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "extract-list" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true },
  outputAction: { fixedOutputId: "extract-list" },
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "records", label: "Records", valueType: "array", role: "data" }
  ],
  parameters: [{ id: "recordOutput", label: "Save records", valueType: "json", allowStateBinding: false, ui: { control: "record-output" } }]
};

const USAGE = { inputTokens: 14, outputTokens: 7, totalTokens: 21, estimatedCostUsd: 0.001 };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-judged-reauthor-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/**
 * One run, refuted on its first pass and re-authored. `repairVerdict` is what
 * the caller's key says of the re-run; `rerunFails` makes the re-run's extraction
 * fail. Each dispatch records which adaptation owned the stored graph at the time.
 */
async function reauthoredRun(options: { repairVerdict: "yes" | "no"; rerunFails?: boolean }) {
  let decisions = 0;
  let dispatches = 0;
  // The build's own judged test of its draft: two agreeing calls after it finishes, which answer yes.
  let buildTestCalls = 0;
  const storedGraphOwnerAtDispatch: Array<string | null> = [];
  let service!: AutomationStudioService;
  let projectId = "";
  let graphFlowId = "";
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => {
      dispatches += 1;
      const stored = await service.getFlow(projectId, graphFlowId);
      storedGraphOwnerAtDispatch.push(typeof stored.metadata?.bootstrapAdaptationId === "string" ? stored.metadata.bootstrapAdaptationId : null);
      if (options.rerunFails && dispatches > 1) return { ok: false, domainId: "example", outputId: request.outputId, error: { code: "example.list_gone", message: "The list is gone." } } as never;
      return { ok: true, domainId: "example", outputId: request.outputId, payload: { result: { extracted: [{ name: "Alpha" }, { name: "Beta" }] } } };
    }
  });
  const native = new AutomationStudioNativeNodeRuntime().register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        "extract-list": ({ parameters }) => ({
          status: "success",
          outputs: { success: true },
          effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }]
        })
      }
    }
  );
  const runtime = automationStudioReplayingBinding({
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.inspect", description: "Inspect the deterministic fixture.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: {},
    executeTool: async ({ toolId, value }: { toolId: string; value: JsonObject }) => toolId === "core.run_node"
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { ran: String(value.node) }, effectApplied: true, draft: { actionId: String(value.node), input: value, proposes: true } }
      : { controls: [{ label: "Fixture" }] }
  });
  service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The caller's key: every re-author build, its own judged test, and every check that judges a repair.
    llmProviderResolver: () => ({ provider: {
      metadata: { provider: "mock", model: "caller" },
      runTask: async (request) => {
        if (request.taskKind === "evidence_tool_decision") {
          decisions += 1;
          if (decisions % 2 === 0) buildTestCalls = 2;
          return {
            response: {
              kind: "evidence_tool_decision",
              summary: "The current topology is sufficient.",
              decision: decisions % 2 === 1 ? { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { consequences: [] } }] } : { kind: "complete", result: { summary: "Preserve the extraction topology." } }
            },
            usage: USAGE
          };
        }
        // The build's own judged test of its draft answers yes; the re-run's check says `repairVerdict`.
        const judgesBuild = buildTestCalls > 0;
        if (judgesBuild) buildTestCalls -= 1;
        const yes = judgesBuild || options.repairVerdict === "yes";
        return { response: { kind: "diagnosis", summary: yes ? "The Flow answers the instruction." : "The records still do not answer the instruction.", diagnosis: { answersRequest: yes ? "yes" : "no" } }, usage: USAGE };
      }
    } }),
    // The Flow's standing authorization: routine sampling, which refutes the first pass.
    resultCheckProviderResolver: (request) => ({
      provider: {
        metadata: { provider: "mock", model: "standing-judge" },
        runTask: async () => ({ response: { kind: "diagnosis", summary: "The returned records do not answer the instruction.", diagnosis: { answersRequest: "no" } }, usage: USAGE })
      },
      maxEstimatedCostUsd: request.maxEstimatedCostUsd
    }),
    llmEvidenceRuntime: runtime
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const project = await service.createProject({ name: "Judged re-author", domainId: "example" });
  projectId = project.id;
  const flow = await service.createFlow({ projectId, flowId: "flow.judged-reauthor", name: "Judged re-author Flow" });
  const training = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 24 * 60 * 60 * 1000 };
  await service.saveFlow({
    projectId,
    flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...training, trainingModeSettings: { ...(training.trainingModeSettings as JsonObject), resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 }, authorization } } } }
  });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  graphFlowId = subflow.graphFlowId!;
  const graph = await service.getFlow(projectId, graphFlowId);
  await service.saveFlow({
    projectId,
    flow: {
      ...graph,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "extract", definitionId: EXTRACT.id, parameterValues: { recordOutput: RECORD_OUTPUT } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
        { id: "extract.end", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    }
  });
  await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  const now = Date.now();
  await service.saveFlowInstruction(projectId, {
    schemaVersion: "0.1", instructionId: "instruction.judged-reauthor", title: "Return fixture records", body: "Return three records from the fixture.",
    scope: { kind: "flow", projectId, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });
  const before = await service.getFlow(projectId, graphFlowId);

  const run = await service.runRuntimeSession({ projectId, flowId: flow.flowId, llmExecution: { actorUserId: "user.aiden", actorSessionId: "session.live", intent: "explore_and_adapt" }, resultCheckCallerPays: "repair_checks" });
  const detail = await service.getFlowRunDetail(projectId, run.runId);
  const after = await service.getFlow(projectId, graphFlowId);
  const marker = (detail?.metadata?.resultReauthor ?? {}) as Record<string, any>;
  const attempts = (Array.isArray(marker.attempts) ? marker.attempts : []) as Array<Record<string, any>>;
  const heldIds = [...new Set(attempts.flatMap((attempt) => (typeof attempt.adaptationId === "string" ? [attempt.adaptationId] : [])))];
  const adaptations = await Promise.all(heldIds.map(async (adaptationId) => await service.getFlowBootstrapAdaptation(projectId, flow.flowId, adaptationId)));
  return { run, detail, marker, attempts, adaptations, before, after, storedGraphOwnerAtDispatch };
}

describe("a re-authored run's edit, held for its judged re-run", () => {
  it("is applied once the re-run that ran it unapplied is judged to answer", { timeout: 120_000 }, async () => {
    const { run, detail, marker, adaptations, after, storedGraphOwnerAtDispatch } = await reauthoredRun({ repairVerdict: "yes" });
    const adaptationId = marker.adaptationId as string;

    expect(run.status).toBe("succeeded");
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    // The re-run executed the held graph, unapplied: the stored graph was not yet the edit's when it ran.
    expect(storedGraphOwnerAtDispatch).toEqual([null, null]);
    expect(run.metadata?.heldReauthorAdaptationId).toBe(adaptationId);
    expect(detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded", heldReauthorAdaptationId: adaptationId });
    // Then the judged end applied it.
    expect(marker).toMatchObject({ routed: true, held: true, applied: true, judgedRunId: run.runId });
    expect(marker.appliedBeforeJudged).toBeUndefined();
    expect(adaptations.map((adaptation) => adaptation?.status)).toEqual(["applied"]);
    expect(after.metadata?.bootstrapAdaptationId).toBe(adaptationId);
  });

  it("leaves the stored Flow unchanged when the re-run is refuted, and says why on the marker", { timeout: 120_000 }, async () => {
    const { run, marker, attempts, adaptations, before, after, storedGraphOwnerAtDispatch } = await reauthoredRun({ repairVerdict: "no" });

    expect(run.status).toBe("failed");
    // Every pass ran on the stored graph as it was before the run: nothing was applied, ever.
    expect(storedGraphOwnerAtDispatch.every((owner) => owner === null)).toBe(true);
    expect(after.metadata?.bootstrapAdaptationId).toBeUndefined();
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
    // More than one attempt: the later one could build only because the earlier held edit was
    // rejected first (a pending adaptation refuses every new build), and the last is rejected at the
    // run's end, so the Flow's next build is not refused either.
    expect(adaptations.length).toBeGreaterThan(1);
    expect(adaptations.map((adaptation) => adaptation?.status)).toEqual(adaptations.map(() => "rejected"));
    // The latest held edit was refuted by the pass that ran it; each earlier one was superseded.
    expect(marker.applied).toBeUndefined();
    expect(marker.notAppliedReason).toBe("refuted");
    const held = attempts.filter((attempt) => typeof attempt.adaptationId === "string");
    expect(held.at(-1)?.notAppliedReason).toBe("refuted");
    expect(held.slice(0, -1).every((attempt) => attempt.notAppliedReason === "superseded")).toBe(true);
  });

  it("leaves the stored Flow unchanged when the re-run fails, and says why on the marker", { timeout: 120_000 }, async () => {
    const { run, marker, adaptations, before, after, storedGraphOwnerAtDispatch } = await reauthoredRun({ repairVerdict: "yes", rerunFails: true });

    expect(run.status).toBe("failed");
    expect(storedGraphOwnerAtDispatch.every((owner) => owner === null)).toBe(true);
    expect(run.metadata?.heldReauthorAdaptationId).toBe(marker.adaptationId);
    expect(after.metadata?.bootstrapAdaptationId).toBeUndefined();
    expect(after.nodes).toEqual(before.nodes);
    expect(adaptations.map((adaptation) => adaptation?.status)).toEqual(["rejected"]);
    expect(marker.applied).toBeUndefined();
    expect(marker.notAppliedReason).toBe("run_failed");
  });
});
