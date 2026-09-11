import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { defineDomainIo, defineInput, defineOutput, IoRegistry, type OutputDispatchResult } from "../../../../io/index.ts";
import { RuntimeService, type FluxIQRuntimeCommandResult } from "../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "../adaptive-orchestrator.ts";
import { runAutomationStudioGraph } from "../executor.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher, dispatchPolicyOutput } from "../io-policy.ts";
import { packAutomationStudioLlmContext } from "../llm/index.ts";
import { runtimeSessionToFlowRunDetail } from "../service/index.ts";

const effect = { type: "policy.output.dispatch", payload: { outputId: "activate-element", parameters: { elementId: "confirm" } } };
const action = { actionType: "activate-element", outputId: "activate-element", parameters: { elementId: "confirm" } };
// Every candidate scores below zero against this fingerprint, so the matcher returns none.
const unmatchedTarget = { kind: "element", fingerprint: { visibleText: "Save" }, candidates: [{ candidateId: "cancel", visibleText: "Cancel" }] };

describe("policy output dispatch failures", () => {
  it("names a timed-out runtime command a timeout without relying on its message", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "timed_out", message: "The client did not answer." }))(effect);

    expect(result).toMatchObject({
      status: "failed",
      route: "failed",
      message: "The client did not answer.",
      failure: { category: "timeout", code: "output_dispatch.timed_out", retryable: true },
      outputs: { ok: false, runtimeStatus: "timed_out" }
    });
  });

  it("names a rejected runtime command a capability or policy block", async () => {
    const result = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "rejected", message: "Unsupported page." }))(effect);

    expect(result?.failure).toEqual({ category: "blocked_by_capability_or_policy", code: "output_dispatch.rejected", retryable: false, stage: "dispatch" });
  });

  it("keeps a valid host-reported failure and drops a malformed one", async () => {
    const hostFailure = { category: "target_ambiguous", code: "web.target.multiple_matches", retryable: true, stage: "target_resolution", expected: "1 match", actual: "3 matches" } as const;
    const reported = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", message: "3 elements matched.", failure: hostFailure }))(effect);
    expect(reported?.failure).toEqual(hostFailure);

    const malformedTimeout = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "timed_out", failure: { ...hostFailure, stage: "execution" } }))(effect);
    expect(malformedTimeout?.failure).toMatchObject({ category: "timeout", code: "output_dispatch.timed_out" });

    const malformedFailure = await createRuntimePolicyEffectDispatcher(ioWith(), "example", runtimeReturning({ status: "failed", error: "boom", failure: { ...hostFailure, stage: "execution" } }))(effect);
    expect(malformedFailure).not.toHaveProperty("failure");
    expect(malformedFailure?.message).toBe("boom");
  });

  it("reads status and failure from IO output adapters", async () => {
    const timedOut = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", status: "timed_out", error: "No answer." })), "example", action);
    expect(timedOut).toMatchObject({ status: "failed", message: "No answer.", failure: { category: "timeout" } });

    const authFailure = { category: "auth_required", code: "web.auth.login_page", retryable: false } as const;
    const loginPage = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "Login page.", failure: authFailure })), "example", action);
    expect(loginPage.failure).toEqual(authFailure);

    const plain = await dispatchPolicyOutput(ioWith(() => ({ ok: false, outputId: "activate-element", error: "Nope." })), "example", action);
    expect(plain).toMatchObject({ status: "failed", message: "Nope." });
    expect(plain).not.toHaveProperty("failure");
  });

  it("names Core's own pre-dispatch rejections", async () => {
    expect((await dispatchPolicyOutput(ioWith(), "example", { actionType: "", parameters: {} })).failure).toMatchObject({ category: "graph_validation_or_unknown_node", code: "output_dispatch.missing_output_id" });
    expect((await dispatchPolicyOutput(ioWith(), "example", { ...action, outputId: "missing" })).failure).toMatchObject({ category: "blocked_by_capability_or_policy", code: "output_dispatch.output_not_registered" });
    expect((await dispatchPolicyOutput(ioWith(undefined, { elementTarget: true }), "example", { ...action, parameters: {} })).failure).toMatchObject({ category: "graph_validation_or_unknown_node", code: "element_target.missing_fingerprint", stage: "target_resolution" });
  });

  it("reports a dispatched output whose confirmation never arrived as not observed", async () => {
    const io = new IoRegistry();
    io.register(defineDomainIo({
      domainId: "example",
      inputs: [defineInput({
        definition: { id: "element-activated", title: "Element activated", role: "action", outputId: "activate-element" },
        mode: "stream",
        outputBinding: { outputId: "activate-element", toPayload: () => ({}) },
        subscribe: () => () => undefined
      })],
      outputs: [defineOutput({
        definition: { id: "activate-element", title: "Activate element" },
        mode: "request",
        dispatch: (request) => ({ ok: true, outputId: request.outputId })
      })]
    }));

    const result = await dispatchPolicyOutput(io, "example", { ...action, confirmationInputId: "element-activated", confirmationTimeoutMs: 5 });

    expect(result).toMatchObject({
      status: "failed",
      failure: { category: "output_not_observed", code: "output_confirmation.not_received", retryable: true, stage: "confirmation" },
      outputs: { confirmation: false }
    });
    expect(result.message).toContain("element-activated");
  });

  it("records a typed target resolution for no match, a weak match, and a confident match", async () => {
    const unmatched = await dispatchPolicyOutput(ioWith(undefined, { elementTarget: true }), "example", { ...action, parameters: { target: unmatchedTarget } });
    expect(unmatched).toMatchObject({
      status: "failed",
      failure: { category: "target_not_found", code: "element_target.no_match", retryable: true, stage: "target_resolution" },
      targetResolution: { status: "no_match", candidateCount: 1, minimumConfidence: 0.5 }
    });

    const weak = await dispatchPolicyOutput(ioWith(undefined, { elementTarget: true, elementTargetMinConfidence: 0.99 }), "example", {
      ...action,
      parameters: { target: { kind: "element", fingerprint: { visibleText: "Save", testId: "save" }, candidates: [{ candidateId: "save-text", visibleText: "Save" }] } }
    });
    expect(weak).toMatchObject({
      status: "failed",
      failure: { category: "target_not_found", code: "element_target.below_confidence", retryable: true, stage: "target_resolution" },
      targetResolution: { status: "below_confidence", candidateCount: 1, minimumConfidence: 0.99, candidateId: "save-text" }
    });
    expect(weak.failure?.expected).toContain("99%");
    expect(weak.failure?.actual).toMatch(/^best candidate confidence \d+%$/);

    const strong = await dispatchPolicyOutput(ioWith(undefined, { elementTarget: true }), "example", {
      ...action,
      parameters: { target: { kind: "element", fingerprint: { visibleText: "Save", testId: "save" }, candidates: [{ candidateId: "cancel", visibleText: "Cancel", testId: "cancel" }, { candidateId: "save", visibleText: "Save", testId: "save" }] } }
    });
    expect(strong).toMatchObject({ status: "success", targetResolution: { status: "matched", candidateId: "save", candidateCount: 2 } });
    expect(strong).not.toHaveProperty("failure");
  });
});

describe("failure propagation from dispatch to diagnosis", () => {
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

  it("carries an element target miss to the attempt trace and a target override candidate", async () => {
    const flow = actionFlow({ target: unmatchedTarget });
    const trace = await runAutomationStudioGraph(flow, { effectDispatcher: createIoPolicyEffectDispatcher(ioWith(undefined, { elementTarget: true }), "example") });
    const attempt = trace.attempts[0]!;

    expect(attempt).toMatchObject({ failure: { category: "target_not_found" }, targetResolution: { status: "no_match", candidateCount: 1 } });
    expect(attempt.transitionComparison?.status).toBe("target_not_found");
    expect(classifyAutomationStudioAdaptiveFailure({ projectId: "project.failure", flowId: flow.flowId, runId: "run.target", attempt })).toMatchObject({ failureClass: "target_not_found", candidateKind: "action_target_override" });

    const detail = runtimeSessionToFlowRunDetail(session(flow, trace), "project.failure");
    expect(detail.actionAttempts?.[0]?.metadata).toMatchObject({ targetResolution: { status: "no_match" } });
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
