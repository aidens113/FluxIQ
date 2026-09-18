// What the run does after a repair it applied mid-flight: where it carries on
// from, and whether it carries on at all.
//
// Both tests run one Flow with a node that costs something -- `charge` -- ahead
// of the node that fails. `calls.charge` is therefore the measurement that
// matters: a run that restarts its Flow charges twice for one order.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { installPrimaryRouter, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

const MANIFEST: AutomationStudioImporterSdkManifest = {
  schemaVersion: "0.1",
  sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
  packageId: "example.resume",
  packageVersion: "1.0.0",
  domainId: "example",
  nodes: [
    {
      schemaVersion: "0.1",
      id: "example.charge",
      version: "1.0.0",
      label: "Charge",
      description: "Stands for a side effect that must not happen twice.",
      category: "custom",
      source: { kind: "importer", domainId: "example", packageId: "example.resume", implementationKey: "charge" },
      availability: { kind: "domain", domainId: "example" },
      capabilities: { executable: true },
      requiredRuntimeCapabilities: ["example.host"],
      inputs: [],
      outputs: [{ id: "charged", label: "Charged", valueType: "boolean" }],
      parameters: []
    },
    {
      schemaVersion: "0.1",
      id: "example.drift-action",
      version: "1.0.0",
      label: "Drift Action",
      description: "Fails until a retry parameter is durably learned.",
      category: "custom",
      source: { kind: "importer", domainId: "example", packageId: "example.resume", implementationKey: "drift" },
      availability: { kind: "domain", domainId: "example" },
      capabilities: { executable: true, retryable: true, stateAware: true },
      requiredRuntimeCapabilities: ["example.host"],
      inputs: [],
      outputs: [{ id: "done", label: "Done", valueType: "boolean" }],
      parameters: []
    }
  ]
};

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

async function runChargingFlow(input: { flowId: string; driftParameterValues: Record<string, unknown> }) {
  const calls = { charge: 0, drift: 0 };
  const nativeRuntime = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(MANIFEST, {
    packageId: "example.resume",
    packageVersion: "1.0.0",
    implementations: {
      charge: () => {
        calls.charge += 1;
        return { status: "success", route: "success", outputs: { charged: true } };
      },
      drift: ({ parameters }) => {
        calls.drift += 1;
        return parameters.retryCount === 2
          ? { status: "success", route: "success", outputs: { done: true } }
          : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } };
      }
    }
  });
  const service = createService({
    dataDir: tempRoot,
    seedFixture: false,
    llmProviderResolver: () => ({
      metadata: { provider: "mock", model: "resume-retry" },
      runTask: async (request) => request.taskKind === "runtime_patch"
        ? {
          response: {
            kind: "runtime_patch",
            summary: "Retry the drift action once the state settles.",
            riskLevel: "low",
            patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }]
          },
          usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
        }
        : {
          response: { kind: "diagnosis", summary: "The drift action needs a retry setting." },
          usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 }
        }
    })
  }).bindNativeNodeRuntime(nativeRuntime);
  const project = await service.createProject({ name: "Resume retry", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: input.flowId, name: "Resume retry Flow" });
  await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: { ...(flow.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
  await installPrimaryRouter(service, project.id, flow.flowId, {
    nodes: [
      { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
      { id: "charge", definitionId: "example.charge", parameterValues: {} },
      { id: "drift", definitionId: "example.drift-action", parameterValues: input.driftParameterValues },
      { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
    ],
    edges: [
      { id: "start.charge", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "charge", targetPortId: "in" },
      { id: "charge.drift", sourceNodeId: "charge", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
      { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
    ]
  });
  const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
  const detail = await service.getFlowRunDetail(project.id, run.runId);
  return { run, detail, calls };
}

describe("adaptive retry resumption", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-resume-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("continues at the node the trial reached instead of re-running the Flow from its start", async () => {
    const { run, detail, calls } = await runChargingFlow({
      flowId: "flow.resume-from-trial",
      driftParameterValues: { expectedOutputs: { done: true } }
    });

    expect(run.status).toBe("succeeded");
    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded" } });
    // The one measurement that separates resuming from restarting. `charge` ran
    // once in the original run; the trial started at `drift`, and the retry
    // resumed after it. A Flow re-run from its start node charges again.
    expect(calls.charge).toBe(1);
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      resumable: true,
      resumeFrom: expect.objectContaining({ nodeId: "end", route: "success", subflowId: expect.any(String) })
    })]);
  });

  it("refuses to continue past a repair the verdict did not vouch for, and records why", async () => {
    // The changed node declares an expected state and no host is bound to
    // evaluate it. The trial still verifies the change by the outputs the node
    // declared, so the repair is applied -- but one of the checks it made came
    // back unevaluated, and an unevaluated check is never a pass to the
    // question "may the run carry on?".
    const { run, detail, calls } = await runChargingFlow({
      flowId: "flow.refuse-unvouched",
      driftParameterValues: { expectedOutputs: { done: true }, expectedState: { settled: true } }
    });

    expect(run.status).toBe("failed");
    // Not a bare stop: the run says which check left it unable to continue.
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: "check_unknown" });
    expect(calls.charge).toBe(1);
    expect(detail?.metadata?.runtimePatchAttempts).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      retryOriginalAction: true,
      resumable: false,
      notResumableCode: "check_unknown"
    })]);
  });
});
