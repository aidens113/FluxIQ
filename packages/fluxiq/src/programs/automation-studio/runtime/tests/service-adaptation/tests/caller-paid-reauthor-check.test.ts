// A re-authored Flow's re-run is judged as a repair, and so with the caller's key.
//
// The paired extension's Automations Run pays only for the result checks that
// judge a repair (`resultCheckCallerPays: "repair_checks"`, MVP item 23). Its
// routine check is the Flow's standing authorization's to pay for, and here
// that check refutes the answer, so the run is re-authored and its corrected
// Flow re-run from the start (`rerunRepairedFlow`). That re-run's check judges
// the repair, which is what the caller pays for -- but until the re-run port
// re-decided the check, the re-run kept the routine decision taken when the run
// started, so the standing authorization was asked again and the caller's key
// never judged the repair it had paid to build.
//
// The harness is `refuted-result/tests/reauthor-service.test.ts`'s, cut down:
// one extraction step, a re-author build of two decisions (re-run the carried
// step, then finish), and two providers told apart -- the standing judge, which
// refutes, and the caller's, which builds and answers yes.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_RESULT_CHECK_CODES } from "../../../result-check-schedule/index.ts";
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
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-caller-paid-reauthor-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

it("judges a re-authored Flow's re-run with the caller's key, after the standing authorization refuted the routine check", { timeout: 120_000 }, async () => {
  const callerCalls: string[] = [];
  const standingCalls: string[] = [];
  let decisions = 0;
  const io = new IoRegistry();
  io.registerOutput("example", {
    definition: { id: "extract-list", title: "Extract list" },
    mode: "request",
    dispatch: async (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: { result: { extracted: [{ name: "Alpha" }, { name: "Beta" }] } } })
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
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    // The caller's key: the re-author's build, and every check that judges a repair.
    llmProviderResolver: () => ({ provider: {
      metadata: { provider: "mock", model: "caller" },
      runTask: async (request) => {
        callerCalls.push(request.taskKind);
        if (request.taskKind === "evidence_tool_decision") {
          decisions += 1;
          return {
            response: {
              kind: "evidence_tool_decision",
              summary: "The current topology is sufficient.",
              decision: decisions === 1 ? { kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { consequences: [] } }] } : { kind: "complete", result: { summary: "Preserve the extraction topology." } }
            },
            usage: USAGE
          };
        }
        return { response: { kind: "diagnosis", summary: "The repaired Flow answers the instruction.", diagnosis: { answersRequest: "yes" } }, usage: USAGE };
      }
    } }),
    // The Flow's standing authorization: routine sampling, which refutes.
    resultCheckProviderResolver: (request) => ({
      provider: {
        metadata: { provider: "mock", model: "standing-judge" },
        runTask: async (task) => {
          standingCalls.push(task.taskKind);
          return { response: { kind: "diagnosis", summary: "The returned records do not answer the instruction.", diagnosis: { answersRequest: "no" } }, usage: USAGE };
        }
      },
      maxEstimatedCostUsd: request.maxEstimatedCostUsd
    }),
    llmEvidenceRuntime: runtime
  }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
  services.add(service);

  const project = await service.createProject({ name: "Caller-paid re-author check", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.caller-paid-reauthor", name: "Caller-paid re-author Flow" });
  const training = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 24 * 60 * 60 * 1000 };
  await service.saveFlow({
    projectId: project.id,
    flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...training, trainingModeSettings: { ...(training.trainingModeSettings as JsonObject), resultCheck: { schedule: { enabled: true, shape: "every_run", initialRunCount: 3, interval: 5, decay: 5 }, authorization } } } }
  });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const graph = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({
    projectId: project.id,
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
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  const now = Date.now();
  await service.saveFlowInstruction(project.id, {
    schemaVersion: "0.1", instructionId: "instruction.caller-paid", title: "Return fixture records", body: "Return three records from the fixture.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", tags: ["generation"], createdAt: now, updatedAt: now
  });

  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, llmExecution: { actorUserId: "user.aiden", actorSessionId: "session.live", intent: "explore_and_adapt" }, resultCheckCallerPays: "repair_checks" });
  const detail = await service.getFlowRunDetail(project.id, run.runId);

  // The routine check was the standing authorization's, and refuted: two agreeing refusals.
  expect(standingCalls).toEqual(["loop_verification", "loop_verification"]);
  // The caller paid for the re-author's build (two decisions, its own judged
  // test confirmed by a second call), then for the check that judged the re-run.
  expect(callerCalls).toEqual(["evidence_tool_decision", "evidence_tool_decision", "loop_verification", "loop_verification", "loop_verification"]);
  expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
  expect(run.status).toBe("succeeded");
  expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
  // What the record says of the check is the decision taken when the run
  // started: the re-run's verification is handed the run's original check
  // (`result-verification/run-outcome.ts` re-enters with `...input`), so only
  // whose key paid changes, not the code recorded.
  expect(detail?.summary.metadata?.resultCheck).toMatchObject({ checked: true, code: AUTOMATION_STUDIO_RESULT_CHECK_CODES.initialWindow });
});
