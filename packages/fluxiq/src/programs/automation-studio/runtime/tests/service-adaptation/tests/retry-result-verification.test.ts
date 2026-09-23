// Which Flow a repaired run's result is judged against.
//
// A run that fails, is repaired and is re-run has its result verified -- that
// is what stops a repair which produced a second wrong answer being reported as
// a success. The verification is handed the Flow "that produced this", and it
// was handed the document the service had been holding since before the repair.
// The verdict is about the rows either way, so nothing failed; what was wrong
// was `resultSummary.flowShape`, which is the Flow's own shape, so a repaired
// run was described by the graph it no longer had -- to the model being asked
// to judge it, and to anyone reading the run afterwards.
//
// The witness is a node the repair added. The Flow has four steps; the patch
// call adds a fifth, as a structural repair would; the retry re-reads the
// document and runs it. The verification must then be handed five. Before the
// fix it was handed four.
//
// **Why the assertion is on the call and not on a provider request.** This
// service holds no standing result-check authorization and is given no host
// resolver, so its verification reaches `core.result.no_model_available` and no
// `resultSummary` goes to a provider. That is this test's own setup, not a limit
// of the runtime: `unattended-retry-verification.test.ts` runs the same repair
// with an authorization stored and watches the retried session's result be
// judged by a real call, with no grant anywhere. The Flow handed to the
// verification is what *this* test is about, so that is what it reads.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

/** The node ids of every Flow a finished run's result was judged against, in order. */
const judged = vi.hoisted(() => [] as string[][]);

vi.mock("../../../result-verification/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../result-verification/index.ts")>();
  return {
    ...actual,
    verifyAutomationStudioRuntimeSessionResult: async (input: Parameters<typeof actual.verifyAutomationStudioRuntimeSessionResult>[0]) => {
      judged.push((input.flow?.nodes ?? []).map((node) => node.id));
      return await actual.verifyAutomationStudioRuntimeSessionResult(input);
    }
  };
});

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

// The shape `adaptive-retry-resume.test.ts` proved takes a
// `temporary_wait_retry` through a trial and a resumed retry.
const DRIFT: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.drift-action",
  version: "1.0.0",
  label: "Drift Action",
  description: "Fails until a retry parameter is durably learned.",
  category: "custom",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "drift" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true, retryable: true, stateAware: true },
  requiredRuntimeCapabilities: ["example.host"],
  inputs: [],
  outputs: [{ id: "done", label: "Done", valueType: "boolean" }],
  parameters: []
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  judged.length = 0;
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-retry-verification-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a repaired run's result", () => {
  it("is judged against the Flow the retry ran, not the one held from before the repair", { timeout: 180_000 }, async () => {
    let addRepairedStep: (() => Promise<void>) | undefined;

    const io = new IoRegistry();
    io.registerOutput("example", {
      definition: { id: "extract-list", title: "Extract list" },
      mode: "request",
      dispatch: async (request) => ({
        ok: true,
        domainId: "example",
        outputId: request.outputId,
        payload: { result: { extracted: [{ name: "Lamp" }, { name: "Desk" }] } }
      })
    });
    const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
      { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [EXTRACT, DRIFT] },
      {
        packageId: "example.package",
        packageVersion: "1.0.0",
        implementations: {
          "extract-list": ({ parameters }) => ({
            status: "success",
            outputs: { success: true },
            effects: [{ type: "policy.output.dispatch", payload: { outputId: "extract-list", parameters: {}, recordOutput: parameters.recordOutput ?? null } }]
          }),
          drift: ({ parameters }) => parameters.retryCount === 2
            ? { status: "success", route: "success", outputs: { done: true } }
            : { status: "failed", route: "failed", outputs: { error: "Target drift was not recovered." } }
        }
      }
    );

    const service = new AutomationStudioService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "retry-verification" },
        runTask: async (request) => {
          if (request.taskKind === "runtime_patch") {
            // The repair changes the Flow. A structural patch is what this
            // stands for; what matters here is only that the stored document
            // now differs from the one the service read when the run started.
            await addRepairedStep?.();
            return {
              response: {
                kind: "runtime_patch",
                summary: "Retry the drift action once the state settles.",
                riskLevel: "low",
                patches: [{ kind: "temporary_wait_retry", targetNodeId: "drift", retryCount: 2, timeoutMs: 100, reason: "The action succeeds after a deterministic retry setting." }]
              },
              usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 }
            };
          }
          return { response: { kind: "diagnosis", summary: "The drift action needs a retry setting." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
        }
      })
    }).bindIoRuntime(io, "example").bindNativeNodeRuntime(native);
    services.add(service);

    const project = await service.createProject({ name: "Retry verification", domainId: "example" });
    const created = await service.createFlow({ projectId: project.id, flowId: "flow.retry-verification", name: "Retry verification Flow" });
    await service.saveFlow({ projectId: project.id, flow: { ...created, metadata: { ...(created.metadata ?? {}), ...adaptiveTrainingMetadata() } } });
    const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: created.flowId, name: "Primary", role: "primary" });
    const graphFlowId = subflow.graphFlowId!;
    const blank = await service.getFlow(project.id, graphFlowId);
    await service.saveFlow({
      projectId: project.id,
      flow: {
        ...blank,
        nodes: [
          { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
          { id: "extract", definitionId: EXTRACT.id, parameterValues: { recordOutput: RECORD_OUTPUT } },
          { id: "drift", definitionId: DRIFT.id, parameterValues: { expectedOutputs: { done: true } } },
          { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
        ],
        edges: [
          { id: "start.extract", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "extract", targetPortId: "in" },
          { id: "extract.drift", sourceNodeId: "extract", sourcePortId: "success", targetNodeId: "drift", targetPortId: "in" },
          { id: "drift.end", sourceNodeId: "drift", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
        ]
      }
    });
    await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });

    addRepairedStep = async () => {
      const current = await service.getFlow(project.id, graphFlowId);
      if (current.nodes.some((node) => node.id === "repaired")) return;
      await service.saveFlow({
        projectId: project.id,
        flow: { ...current, nodes: [...current.nodes, { id: "repaired", definitionId: "builtin.control.noop", parameterValues: {} }] }
      });
    };

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: created.flowId });

    // The retry happened, which is the precondition for the assertion below
    // meaning anything at all.
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(detail?.metadata).toMatchObject({ adaptiveRetry: { attempted: true, status: "succeeded" } });
    // The retried session is verified, rather than returned unjudged.
    expect(run.metadata?.resultVerification).toMatchObject({ performed: false, code: "core.result.no_model_available" });

    // One verification, of the retried session, against the Flow the retry read
    // back. `repaired` is in the stored document and in nothing the service was
    // holding from before the repair, so its presence here is the assertion.
    expect(judged).toHaveLength(1);
    expect(judged[0]).toContain("repaired");
    expect(judged[0]).toEqual(["start", "extract", "drift", "end", "repaired"]);
  });
});
