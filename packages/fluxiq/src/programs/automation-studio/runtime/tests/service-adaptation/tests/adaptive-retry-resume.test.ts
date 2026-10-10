// What the run does after a repair it applied mid-flight: where it carries on
// from, and whether it carries on at all.
//
// Both tests run one Flow with a node that costs something -- `charge` -- ahead
// of the node that fails. `calls.charge` is therefore the measurement that
// matters: a run that restarts its Flow charges twice for one order.
//
// An adapting run holds in place at its failing step, has the step fixed and
// tries it again there (state-aware recovery plan, C6 step 8), so these run on
// that path. The detached resume, which stays only for a run that cannot hold
// in place, cannot be reached through the service with a fix to resume on: a
// run is held by a pause only at a checkpoint, never at a failing step, and an
// uncertain stop is never patched (`../../in-run-repair/tests/service-proofs.test.ts`).
// Its resume point and its refusals are covered where it is decided,
// `../../../service/adaptations/tests/adaptive-retry.test.ts`.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { installPrimaryRouter, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

// Heavy service test: under full-suite load it ran past the 15 s default (t289).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

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
  const adaptation = detail?.adaptationIds[0] ? await service.getFlowAdaptation(project.id, flow.flowId, detail.adaptationIds[0]) : null;
  return { run, detail, calls, adaptation };
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

  it("carries on at the failing step with the fix held instead of re-running the Flow from its start", async () => {
    const { run, detail, calls } = await runChargingFlow({
      flowId: "flow.resume-from-trial",
      driftParameterValues: { expectedOutputs: { done: true } }
    });

    expect(run.status).toBe("succeeded");
    expect(detail?.metadata).not.toHaveProperty("adaptiveRetry");
    // The one measurement that separates carrying on from restarting. `charge`
    // ran once; the run held at `drift`, tried it again there with the fix, and
    // went on to `end`. A Flow re-run from its start node charges again.
    expect(calls.charge).toBe(1);
    expect(run.trace?.attempts.map((attempt) => [attempt.nodeId, attempt.status])).toEqual([["start", "succeeded"], ["charge", "succeeded"], ["drift", "failed"], ["drift", "succeeded"], ["end", "succeeded"]]);
    expect(run.trace?.attempts[2]?.repair).toMatchObject({ outcome: "held", unit: { kind: "node", nodeId: "drift" } });
    expect(detail?.metadata?.inRunRepairs).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      outcome: "overlaid",
      repairId: run.trace?.repairs?.[0],
      unit: { kind: "node", nodeId: "drift" }
    })]);
  });

  it("keeps a held fix whose step's expected state no host evaluated unsaved until a judged run vouches for it", async () => {
    // The changed node declares an expected state and no host is bound to
    // evaluate it. The detached path's verdict read that as an unevaluated
    // check and refused to carry on (`check_unknown`). In the run, the
    // re-attempt is an ordinary attempt of the step, and the executor reads an
    // unevaluated expected state from the attempt's own route, as it does for
    // every step (`executor/transition-comparison.ts`); so the run carries on,
    // still charging once. A route is not evidence the state holds (C6 step 8:
    // the fix holds when "the node's expected state ... is `true`"), so the
    // fix's trial proved nothing and it stays `testing`, unverifiable, though
    // the step's declared output was observed. What vouches for the fix is the
    // judged end, which never came: the fix is not saved, and its record says
    // why.
    const { run, detail, calls, adaptation } = await runChargingFlow({
      flowId: "flow.refuse-unvouched",
      driftParameterValues: { expectedOutputs: { done: true }, expectedState: { settled: true } }
    });

    expect(run.status).toBe("succeeded");
    expect(calls.charge).toBe(1);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: false });
    expect(detail?.metadata?.inRunRepairs).toEqual([expect.objectContaining({
      kind: "temporary_wait_retry",
      approvalDecision: expect.objectContaining({ autoApply: true, applyAt: "judged_whole_run", applied: false, notAppliedReason: "not_judged" })
    })]);
    expect(adaptation?.status).toBe("testing");
    expect(adaptation?.validationResults ?? []).toEqual([]);
    expect(adaptation?.metadata?.verification).toMatchObject({ status: "unverifiable", reason: "in_run_trial", awaitsJudgedRun: true });
  });
});
