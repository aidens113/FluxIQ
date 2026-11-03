import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { defineOutput, IoRegistry, type OutputDispatchResult } from "../../../../io/index.ts";
import { FileRuntimeStore, FLUXIQ_RUNTIME_WITHHELD_VALUE, RuntimeService, type FluxIQRuntimeCommandAttempt, type FluxIQRuntimeCommandResult } from "../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "../adaptive-orchestrator.ts";
import { runAutomationStudioGraph } from "../executor.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher, dispatchPolicyOutput } from "../io-policy.ts";
import { packAutomationStudioLlmContext } from "../llm/index.ts";
import { runtimeSessionToFlowRunDetail } from "../service/index.ts";
const effect = { type: "policy.output.dispatch", payload: { outputId: "activate-element", parameters: { elementId: "confirm" } } };
const action = { actionType: "activate-element", outputId: "activate-element", parameters: { elementId: "confirm" } };
describe("policy output dispatch failures", () => {
  it("names Core's own pre-dispatch rejections", async () => {
    expect((await dispatchPolicyOutput(ioWith(), "example", { actionType: "", parameters: {} })).failure).toMatchObject({ category: "graph_validation_or_unknown_node", code: "output_dispatch.missing_output_id" });
    expect((await dispatchPolicyOutput(ioWith(), "example", { ...action, outputId: "missing" })).failure).toMatchObject({ category: "blocked_by_capability_or_policy", code: "output_dispatch.output_not_registered" });

  });

});
describe("failure propagation from dispatch to diagnosis", () => {
  it("records the runtime observation on the actual attempt and public run record without using authored metadata", async () => {
    const actionability = { actionable: false, cause: "disabled" } as const;
    const flow = actionFlow({ elementId: "confirm" });
    flow.nodes[0]!.metadata = { actionability: { actionable: true } };
    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", actionability, failure: { category: "action_failed", code: "client.refused", retryable: false } })) });
    expect(trace.attempts[0]).toMatchObject({ status: "failed", actionability, failure: { code: "client.refused", retryable: false } });
    const detail = runtimeSessionToFlowRunDetail(session(flow, trace), "project.failure");
    expect(detail.actionAttempts?.[0]).toMatchObject({ status: "failed", actionability, failure: { code: "client.refused" } });
    const unobserved = await runAutomationStudioGraph(flow, { effectDispatcher: createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "succeeded" })) });
    expect(unobserved.attempts[0]).not.toHaveProperty("actionability");
  });
  it("carries a timed-out runtime action to classification, the run record, and the LLM context", async () => {
    const flow = actionFlow({ elementId: "confirm" });
    const trace = await runAutomationStudioGraph(flow, {
      effectDispatcher: createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "timed_out", message: "The client did not answer." }))
    });
    const attempt = trace.attempts[0]!;
    expect(attempt).toMatchObject({ status: "failed", message: "The client did not answer.", failure: { category: "timeout", code: "output_dispatch.timed_out" } });
    expect(attempt.transitionComparison?.status).toBe("timeout");
    expect(classifyAutomationStudioAdaptiveFailure({ projectId: "project.failure", flowId: flow.flowId, runId: "run.timeout", attempt })).toMatchObject({ failureClass: "timeout", candidateKind: "expectation_wait_retry" });
    const detail = runtimeSessionToFlowRunDetail(session(flow, trace), "project.failure");
    expect(detail.actionAttempts?.[0]).toMatchObject({
      comparisonStatus: "timeout",
      failure: { category: "timeout", code: "output_dispatch.timed_out" },
      metadata: { adaptiveFailure: { failureClass: "timeout" } }
    });
    const context = packAutomationStudioLlmContext({ taskKind: "runtime_diagnosis", projectId: "project.failure", flowId: flow.flowId, runId: "run.timeout", instructions: [], runDetail: detail });
    expect(context.recentActions?.[0]).toMatchObject({ comparisonStatus: "timeout", failureCategory: "timeout" });
  });


});
describe("a runtime-dispatched output's saved command attempt", () => {
  // Obviously synthetic: every assertion about it is where it must not appear.
  const SUPPLIED = "synthetic-policy-value-that-must-never-be-persisted";
  it("withholds a value the run resolved out of state, while the adapter executes the real one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-io-policy-withheld-"));
    try {
      const runtime = new RuntimeService({ store: new FileRuntimeStore({ rootDir: root }) });
      const executed: JsonObject[] = [];
      runtime.registerAdapter({
        adapterId: "example.runtime",
        label: "Example Runtime",
        transport: "direct",
        domainId: "example",
        capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
        execute: (command) => {
          executed.push(command.parameters ?? {});
          return { commandId: command.commandId ?? "command.runtime", status: "succeeded" };
        }
      });
      const trace = await runAutomationStudioGraph(actionFlow({ selector: "#field", text: { $state: { path: "run.supplied.text" } } }), {
        inputs: { "run.supplied.text": SUPPLIED },
        effectDispatcher: createRuntimePolicyEffectDispatcher(ioWith(), "example", runtime)
      });
      await runtime.ready();
      expect(trace.status).toBe("succeeded");
      expect(executed).toHaveLength(1);
      expect(executed[0]).toMatchObject({ selector: "#field", text: SUPPLIED });
      const [attempt] = runtime.commandAttemptsList();
      const saved = await readFile(path.join(root, "command-attempts", attempt!.attemptId, "attempt.json"), "utf8");
      // The bound value must remain absent from durable runtime attempts.
      // The actual web target-preparation duplicate is covered by the domain subject.
      expect(saved).not.toContain(SUPPLIED);
      expect((JSON.parse(saved) as {
        attempt: FluxIQRuntimeCommandAttempt;
      }).attempt.command.parameters).toMatchObject({ selector: "#field", text: FLUXIQ_RUNTIME_WITHHELD_VALUE });
    }
    finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
function ioWith(dispatch?: () => OutputDispatchResult, metadata?: JsonObject): IoRegistry {
  const io = new IoRegistry();
  io.registerOutput("example", defineOutput({
    definition: { id: "activate-element", title: "Activate element", ...(metadata ? { metadata } : {}) },
    mode: "request",
    dispatch: dispatch ?? ((request) => ({ ok: true, outputId: request.outputId }))
  }));
  return io;
}
function runtimeReturning(result: Omit<FluxIQRuntimeCommandResult, "commandId">): RuntimeService {
  const runtime = new RuntimeService();
  runtime.registerAdapter({
    adapterId: "example.runtime",
    label: "Example Runtime",
    transport: "direct",
    domainId: "example",
    capabilities: () => [{ id: "example.outputs", kind: "action", domainId: "example", outputIds: ["activate-element"] }],
    execute: (command) => ({ commandId: command.commandId ?? "command.runtime", ...result })
  });
  return runtime;
}
function actionFlow(parameters: JsonObject): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.failure-propagation",
    ownerKind: "task",
    ownerId: "task.failure-propagation",
    name: "Failure propagation",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters } }],
    edges: []
  };
}
function session(flow: AutomationStudioFlowDocument, trace: Awaited<ReturnType<typeof runAutomationStudioGraph>>): AutomationStudioRuntimeSession {
  return { schemaVersion: "0.1", runId: "run.failure", projectId: "project.failure", targetKind: "flow", targetId: flow.flowId, flowId: flow.flowId, status: "failed", queuedAt: 1, flow, trace };
}
