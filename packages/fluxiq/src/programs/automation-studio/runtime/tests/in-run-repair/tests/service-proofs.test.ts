// End-to-end proofs of in-run repair (state-aware recovery plan, C6 step 8 and
// "What counts as a true failure") through the real `AutomationStudioService`:
// the executor's hold in place, the run session's `repairIncident`, the
// judged end, and the run's counts, with a scripted model whose calls are
// counted and a fake host.
//
// The fake host is a native node package whose one step presses a named
// control, and a fact evaluator that says the page is clear. A control fails
// as the test sets it: a number of times, then works; or always. Every press
// is kept, so a test reads what the run did as well as what it reported.
//
// What is proved, each in one run:
// - retries, an authored failed edge, and an On Fail handler call no model;
// - a true failure consults the model once -- today's diagnosis, then one patch
//   request -- the run carries on and succeeds, the repair id is on the trace,
//   and the fix reaches the stored Flow only after the judged end;
// - a fix whose trial fails is dropped, and the run fails after that one
//   consultation;
// - an authored failed edge to a failed End is a deliberate stop: no model.
//
// E2b's fixture (`service/runtime-session/tests/in-run-repair-fixture.ts`)
// binds the session's ports directly, without the service; these proofs go
// through the service's own wiring, so they use its resolvers instead.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../host-runtime.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { adaptiveTrainingMetadata } from "../../service-fixtures.ts";

// Heavy service test, like the other service proofs.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const STEP: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1",
  id: "example.press",
  version: "1.0.0",
  label: "Press",
  description: "Presses one named control on the fake host.",
  category: "custom",
  source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "press" },
  availability: { kind: "domain", domainId: "example" },
  capabilities: { executable: true, retryable: true },
  requiredRuntimeCapabilities: ["example.host"],
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" },
    { id: "pressed", label: "Pressed", valueType: "string" }
  ],
  parameters: [{ id: "control", label: "Control", valueType: "string" }, { id: "element", label: "Element", valueType: "any" }]
};

/** The judge checks every run: a repaired one because it repaired itself, a clean one from the first. */
const SCHEDULE = { enabled: true, shape: "fixed_interval", initialRunCount: 0, interval: 1, decay: 1 };

/**
 * How a control behaves: fails `times` presses, then works; `always` never
 * works. `retryable` says whether a retry may help. `lostAnswer` makes each
 * failure a press that was made and whose answer was lost, so whether it took
 * effect is unknown.
 */
type Control = { times: number | "always"; retryable: boolean; lostAnswer?: true };

type World = {
  service: AutomationStudioService;
  /** Every request the repair model was given. */
  requests: AutomationStudioLlmTaskRequest[];
  /** The control each press pressed, in order. */
  presses: string[];
  /** What the stored `broken` node pressed each time the judge was asked. */
  storedAtJudgement: unknown[];
  /** What the stored `broken` node presses now, once the Flow is made. */
  readStoredBroken?: () => Promise<unknown>;
  /** Everything the stored `broken` node holds now. */
  readStoredBrokenNode?: () => Promise<unknown>;
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-in-run-repair-proofs-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** A service whose repair model answers `fix`, whose judge answers yes, and whose host behaves as `controls` say. */
function world(controls: Record<string, Control>, fix?: AutomationStudioRuntimePatch, evidence?: AutomationStudioLlmEvidenceRuntimeBinding): World {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const presses: string[] = [];
  const storedAtJudgement: unknown[] = [];
  const failed = new Map<string, number>();
  const native = new AutomationStudioNativeNodeRuntime({ runtimeCapabilities: ["example.host"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.package", packageVersion: "1.0.0", domainId: "example", nodes: [STEP] },
    {
      packageId: "example.package",
      packageVersion: "1.0.0",
      implementations: {
        press: ({ parameters }) => {
          const control = String(parameters.control);
          presses.push(control);
          const behaviour = controls[control];
          const count = failed.get(control) ?? 0;
          if (!behaviour || (behaviour.times !== "always" && count >= behaviour.times)) return { status: "success", route: "success", outputs: { pressed: control } };
          failed.set(control, count + 1);
          const failure = behaviour.lostAnswer
            ? { category: "ambiguous_or_unknown" as const, code: "example.press.answer_lost", retryable: behaviour.retryable, stage: "execution" as const, effect: "ambiguous" as const }
            : { category: "unexpected_state" as const, code: "example.press.refused", retryable: behaviour.retryable, stage: "execution" as const, effect: "unacted" as const };
          return { status: "failed", route: "failed", message: `${control} did not work.`, failure };
        }
      }
    }
  );
  const repairModel: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "repair" },
    runTask: async (request) => {
      requests.push(request);
      if (request.taskKind === "runtime_patch" && fix) return { response: { kind: "runtime_patch", summary: fix.reason, riskLevel: "low", patches: [fix] }, usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16, estimatedCostUsd: 0.002 } };
      return { response: { kind: "diagnosis", summary: "The step failed." }, usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6, estimatedCostUsd: 0.001 } };
    }
  };
  const state: World = { service: undefined as unknown as AutomationStudioService, requests, presses, storedAtJudgement };
  const judge: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "judge" },
    runTask: async () => {
      storedAtJudgement.push(await state.readStoredBroken?.());
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: "yes" } }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12, estimatedCostUsd: 0.0015 } };
    }
  };
  const service = new AutomationStudioService({
    dataDir: tempRoot,
    seedFixture: false,
    hostRuntime: clearPageHost(),
    llmProviderResolver: () => repairModel,
    resultCheckProviderResolver: (request) => ({ provider: judge, maxEstimatedCostUsd: request.maxEstimatedCostUsd })
  }).bindIoRuntime(new IoRegistry(), "example").bindNativeNodeRuntime(native);
  if (evidence) service.bindLlmEvidenceRuntime(evidence);
  services.add(service);
  state.service = service;
  return state;
}

/** The fake host's page: every fact a handler asks about holds. It dispatches actions, which a fix that writes steps requires. */
function clearPageHost(): AutomationStudioHostRuntimeBoundary {
  return {
    capabilities: ["fact-evaluation", "action-dispatch"],
    factEvaluator: (conditions) => conditions.map((condition) => ({ result: "true", evidence: { fact: condition.fact }, capturedAt: 1_000 }))
  };
}

/** An adapting, judged Flow whose primary Subflow is `nodes` and `edges`; answers the ids a test reads back. */
async function flow(found: World, nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]) {
  const { service } = found;
  const base = adaptiveTrainingMetadata();
  const authorization = { authorizedByUserId: "user.aiden", unlockSessionId: "session.unlock.1", keyId: "key.deepseek", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 86_400_000 };
  const project = await service.createProject({ name: "In-run repair proofs", domainId: "example" });
  const created = await service.createFlow({ projectId: project.id, flowId: "flow.in-run-repair-proofs", name: "In-run repair proofs" });
  const trainingModeSettings = { ...(base.trainingModeSettings as JsonObject), resultCheck: { schedule: SCHEDULE, authorization } };
  await service.saveFlow({ projectId: project.id, flow: { ...created, metadata: { ...(created.metadata ?? {}), ...base, trainingModeSettings } } });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: created.flowId, name: "Primary", role: "primary" });
  const graphFlowId = subflow.graphFlowId!;
  const blank = await service.getFlow(project.id, graphFlowId);
  await service.saveFlow({ projectId: project.id, flow: { ...blank, nodes, edges } });
  await service.setFlowMapFallback({ projectId: project.id, flowId: created.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: created.flowId, instruction: "Press each control in order and finish." });
  found.readStoredBroken = async () => (await service.getFlow(project.id, graphFlowId)).nodes.find((node) => node.id === "broken")?.parameterValues?.control;
  found.readStoredBrokenNode = async () => (await service.getFlow(project.id, graphFlowId)).nodes.find((node) => node.id === "broken")?.parameterValues;
  return { projectId: project.id, flowId: created.flowId, graphFlowId };
}

async function run(found: World, ids: { projectId: string; flowId: string }) {
  const session = await found.service.runRuntimeSession({ projectId: ids.projectId, flowId: ids.flowId });
  const detail = await found.service.getFlowRunDetail(ids.projectId, session.runId);
  return { session, detail };
}

function press(id: string, control = id): AutomationStudioFlowNode {
  return { id, definitionId: STEP.id, label: `Press ${control}`, parameterValues: { control } };
}

function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId: "in" };
}

const START: AutomationStudioFlowNode = { id: "start", definitionId: "builtin.control.start" };
const END: AutomationStudioFlowNode = { id: "end", definitionId: "builtin.control.end", parameterValues: { resultStatus: "success" } };

/** start -> open -> broken -> finish -> end, with `extra` beside it. */
function line(extra: { nodes?: AutomationStudioFlowNode[]; edges?: AutomationStudioFlowEdge[] } = {}) {
  return {
    nodes: [START, press("open"), press("broken"), press("finish"), END, ...(extra.nodes ?? [])],
    edges: [edge("start", "open"), edge("open", "broken"), edge("broken", "finish"), edge("finish", "end"), ...(extra.edges ?? [])]
  };
}

/** The fix: `broken` replaced by a press of `control`. */
function replaceBroken(control: string): AutomationStudioRuntimePatch {
  return { kind: "replace_unit", unit: { kind: "node", nodeId: "broken" }, steps: [{ definitionId: STEP.id, parameters: { control } }], consequences: [], reason: `Press ${control} where the broken control stood.` };
}

describe("in-run repair through the service: what calls no model", () => {
  it("retries a step that works on its third press, with no model call", async () => {
    const found = world({ broken: { times: 2, retryable: true } }, replaceBroken("fixed"));
    const { nodes, edges } = line();
    const { session, detail } = await run(found, await flow(found, nodes, edges));

    expect(session.status).toBe("succeeded");
    expect(found.requests).toEqual([]);
    expect(found.presses).toEqual(["open", "broken", "broken", "broken", "finish"]);
    expect(detail?.summary.failureCounts).toEqual({ retries: 2, plannedFails: 0, trueFailures: 0, repairedInRun: 0 });
  });

  it("takes an authored failed edge, a planned fail, with no model call", async () => {
    const found = world({ broken: { times: "always", retryable: false } }, replaceBroken("fixed"));
    const { nodes, edges } = line({ nodes: [press("fallback")], edges: [edge("broken", "fallback", "failed"), edge("fallback", "end")] });
    const { session, detail } = await run(found, await flow(found, nodes, edges));

    expect(session.status).toBe("succeeded");
    expect(found.requests).toEqual([]);
    expect(found.presses).toEqual(["open", "broken", "fallback"]);
    expect(session.trace?.attempts.find((attempt) => attempt.nodeId === "broken")?.repair).toBeUndefined();
    expect(detail?.summary.failureCounts).toMatchObject({ plannedFails: 1, trueFailures: 0, repairedInRun: 0 });
  });

  it("takes an On Fail handler that resolves, a planned fail, with no model call", async () => {
    const found = world({ broken: { times: "always", retryable: false } }, replaceBroken("fixed"));
    const handler = {
      nodes: [
        { id: "h.fail", definitionId: "builtin.control.handler", parameterValues: { event: "fail", scope: { kind: "nodes", nodeIds: ["broken"] }, when: [{ fact: "page.clear", op: "exists" }] } },
        press("h.fail.close", "dismiss"),
        { id: "h.fail.end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "resolve", outputs: {} } }
      ],
      edges: [edge("h.fail", "h.fail.close", "body"), edge("h.fail.close", "h.fail.end")]
    };
    const { nodes, edges } = line(handler);
    const { session, detail } = await run(found, await flow(found, nodes, edges));

    expect(session.status).toBe("succeeded");
    expect(found.requests).toEqual([]);
    expect(found.presses).toEqual(["open", "broken", "dismiss", "finish"]);
    expect(session.trace?.handlerExecutions?.map((record) => record.disposition.kind)).toEqual(["resolve"]);
    expect(detail?.summary.failureCounts).toMatchObject({ plannedFails: 1, trueFailures: 0, repairedInRun: 0 });
  });

  // The failed edge is a planned fail (C6), and the End it leads to fails with
  // its authored `resultStatus: failed`: a deliberate stop, which ends the run
  // with its own reason. It opens no incident of its own and asks no model, in
  // the run (`executor/step-loop/failed-attempt.ts`) or after it
  // (`recovery/annotation/early-refusal.ts`).
  it("takes an authored failed edge to a failed End, a deliberate stop, with no model call", async () => {
    const found = world({ broken: { times: "always", retryable: false } }, replaceBroken("fixed"));
    const stop: AutomationStudioFlowNode = { id: "stop", definitionId: "builtin.control.end", parameterValues: { resultStatus: "failed" } };
    const { nodes, edges } = line({ nodes: [stop], edges: [edge("broken", "stop", "failed")] });
    const { session, detail } = await run(found, await flow(found, nodes, edges));

    expect(session.status).toBe("failed");
    expect(found.presses).toEqual(["open", "broken"]);
    expect(found.requests).toEqual([]);
    expect(detail?.summary.failureCounts).toMatchObject({ plannedFails: 1, trueFailures: 0, repairedInRun: 0 });
    expect(session.trace?.incidents?.map((incident) => incident.ending)).toEqual(["planned_fail"]);
    expect(detail?.metadata?.llmGate).toMatchObject({ invoked: false, code: "llm.gate.deliberate_stop" });
  });
});

describe("in-run repair through the service: a true failure", () => {
  it("asks the model once, carries on past the fixed step, and keeps the fix pending until the judged end", async () => {
    const found = world({ broken: { times: "always", retryable: false } }, replaceBroken("fixed"));
    const { nodes, edges } = line();
    const ids = await flow(found, nodes, edges);
    const { session, detail } = await run(found, ids);

    expect(session.status).toBe("succeeded");
    expect(found.requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    // Held in place: the fix's trial is the next press, and the run goes on from there.
    expect(found.presses).toEqual(["open", "broken", "fixed", "finish"]);
    const failed = session.trace?.attempts.find((attempt) => attempt.nodeId === "broken" && attempt.status === "failed");
    const repairId = failed?.repair?.repairId;
    expect(failed?.repair).toMatchObject({ outcome: "held", unit: { kind: "node", nodeId: "broken" } });
    expect(repairId).toEqual(expect.any(String));
    expect(session.trace?.repairs).toEqual([repairId]);
    // Nothing ran again after the run: no detached retry, no second call.
    expect(detail?.metadata).not.toHaveProperty("adaptiveRetry");
    expect(detail?.metadata?.runtimePatchAttempts ?? []).toEqual([]);
    // Pending until the judged end: the judge saw the stored Flow unchanged, and only then was the fix saved.
    expect(session.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(found.storedAtJudgement).toEqual(["broken"]);
    expect(await found.readStoredBroken?.()).toBe("fixed");
    const receipt = (detail?.metadata?.inRunRepairs as JsonObject[] | undefined)?.[0];
    expect(receipt).toMatchObject({ repairId, outcome: "overlaid", kind: "replace_unit" });
    const adaptation = await found.service.getFlowAdaptation(ids.projectId, ids.flowId, String(receipt?.adaptationId));
    expect(adaptation).toMatchObject({ status: "applied", metadata: { approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: true, judgedRunId: session.runId } } });
    expect(detail?.summary.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 1 });
  });

  it("drops a fix whose trial fails, and the run fails after that one call", async () => {
    const found = world({ broken: { times: "always", retryable: false }, "still-broken": { times: "always", retryable: false } }, replaceBroken("still-broken"));
    const { nodes, edges } = line();
    const ids = await flow(found, nodes, edges);
    const { session, detail } = await run(found, ids);

    expect(session.status).toBe("failed");
    expect(found.requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]);
    expect(found.presses).toEqual(["open", "broken", "still-broken"]);
    expect(session.trace?.attempts.filter((attempt) => attempt.repair).map((attempt) => attempt.repair?.outcome)).toEqual(["held", "dropped"]);
    expect(session.trace?.repairs).toBeUndefined();
    expect(session.trace?.incidents?.map((incident) => incident.ending)).toEqual(["true_failure"]);
    // The detached path does not ask about it again after the run: the run's
    // record is the in-run recovery's own, both stages called.
    expect(detail?.metadata?.llmGate).toMatchObject({ invoked: true, providerConfigured: true });
    expect(detail?.interventions.flatMap((intervention) => (intervention.promptVersion ? [intervention.promptVersion] : []))).toEqual(["automation-studio.runtime-diagnosis.v1+stage.gather", "automation-studio.runtime-patch.v1+stage.implement+in_run_repair"]);
    expect(await found.readStoredBroken?.()).toBe("broken");
    const receipt = (detail?.metadata?.inRunRepairs as JsonObject[] | undefined)?.[0];
    const adaptation = await found.service.getFlowAdaptation(ids.projectId, ids.flowId, String(receipt?.adaptationId));
    expect(adaptation?.status).not.toBe("applied");
    expect(detail?.summary.failureCounts).toEqual({ retries: 0, plannedFails: 0, trueFailures: 1, repairedInRun: 0 });
  });
});

// The detached path (`service/adaptations/adaptive-retry.ts` and the recovery
// annotation after the run) is now reached only by a run that ended failed
// without the executor asking at its failing step. An uncertain lasting act is
// one: its effect check cannot say whether the press took effect, so the run
// stops "Outcome uncertain" and no repair may override that (C6 step 4). The
// after-run recovery still diagnoses it, once; the policy offers no patch for
// a failure only a diagnosis answers, so nothing is patched and nothing runs
// again.
describe("the detached path, after the run", () => {
  it("diagnoses an Outcome uncertain stop once, with no in-run ask, no patch and no rerun", async () => {
    const found = world({ placed: { times: "always", retryable: false, lostAnswer: true } }, replaceBroken("fixed"));
    const placing: AutomationStudioFlowNode = { ...press("broken", "placed"), metadata: { declaredConsequences: ["places the order"] } };
    const nodes = [START, press("open"), placing, press("finish"), END];
    const edges = [edge("start", "open"), edge("open", "broken"), edge("broken", "finish"), edge("finish", "end")];
    const { session, detail } = await run(found, await flow(found, nodes, edges));

    expect(session.status).toBe("failed");
    // Pressed once, never again, and never fixed in the run.
    expect(found.presses).toEqual(["open", "placed"]);
    expect(session.trace?.attempts.find((attempt) => attempt.nodeId === "broken")).toMatchObject({ status: "failed", effectCheck: { result: "unknown" } });
    expect(session.trace?.attempts.some((attempt) => attempt.repair)).toBe(false);
    expect(detail?.metadata?.inRunRepairs).toBeUndefined();
    // The detached path's one call: a diagnosis, and no patch request.
    expect(found.requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis"]);
    expect(detail?.metadata?.llmGate).toMatchObject({ invoked: true, patchSkippedCode: "llm.runtime_patch_policy_allows_no_kind" });
    expect(detail?.metadata?.runtimePatchAttempts ?? []).toEqual([]);
    expect(detail?.metadata).not.toHaveProperty("adaptiveRetry");
    expect(await found.readStoredBroken?.()).toBe("placed");
  });
});

// The fix's step names its control by the handle the failure packet printed,
// as every step the model writes does (t429). What the Flow keeps after the
// judged end is what the domain resolved that handle to -- its control and
// the full identity it is found by again -- never the handle, which means
// nothing on a later page. A handle the packet never gave refuses the fix.
describe("in-run repair through the service: a fix that names its control by handle", () => {
  /** The page at the failing step, and a domain that resolves `control` handles from it alone. */
  function handleDomain(asked: Array<{ parameters: JsonObject; handleEvidence?: JsonObject | undefined }>): AutomationStudioLlmEvidenceRuntimeBinding {
    const page: JsonObject = { schemaVersion: "example.page.v1", page: "t7 button Fixed" };
    const controls: Record<string, JsonObject> = { t7: { tagName: "button", accessibleName: "Fixed", testId: "fixed" } };
    return {
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [],
      executeTool: async () => { throw new Error("No tool runs while the run is held."); },
      captureSanitizedFailureEvidence: async () => page,
      resolvePlanNodeParameters: ({ parameters, handleEvidence }) => {
        asked.push({ parameters: structuredClone(parameters), ...(handleEvidence ? { handleEvidence } : {}) });
        const written = parameters.control as JsonObject | undefined;
        if (typeof written?.handle !== "string") return { status: "unchanged" };
        const identity = handleEvidence?.page === page.page ? controls[written.handle] : undefined;
        if (!identity) return { status: "refused", issueCodes: ["example.handle.unknown"] };
        return { status: "resolved", parameters: { control: String(identity.accessibleName).toLowerCase(), element: identity } };
      }
    };
  }

  const replaceByHandle = (handle: string): AutomationStudioRuntimePatch => ({
    kind: "replace_unit", unit: { kind: "node", nodeId: "broken" }, steps: [{ definitionId: STEP.id, parameters: { control: { handle } } }], consequences: [], reason: "Press the control the page shows where the broken one stood."
  });

  it("saves the control the handle named, with its full identity, and only after the judged end", async () => {
    const asked: Array<{ parameters: JsonObject; handleEvidence?: JsonObject | undefined }> = [];
    const found = world({ broken: { times: "always", retryable: false } }, replaceByHandle("t7"), handleDomain(asked));
    const { nodes, edges } = line();
    const ids = await flow(found, nodes, edges);
    const { session, detail } = await run(found, ids);

    expect(session.status).toBe("succeeded");
    // The domain was asked about the step with the packet the model was shown.
    expect(asked).toEqual([{ parameters: { control: { handle: "t7" } }, handleEvidence: expect.objectContaining({ page: "t7 button Fixed" }) }]);
    // The trial pressed what the handle named, and the run carried on.
    expect(found.presses).toEqual(["open", "broken", "fixed", "finish"]);
    expect(found.storedAtJudgement).toEqual(["broken"]);
    const stored = await found.readStoredBrokenNode?.();
    expect(stored).toEqual({ control: "fixed", element: { tagName: "button", accessibleName: "Fixed", testId: "fixed" } });
    expect(JSON.stringify(stored)).not.toMatch(/"handles?":/u);
    const receipt = (detail?.metadata?.inRunRepairs as JsonObject[] | undefined)?.[0];
    const adaptation = await found.service.getFlowAdaptation(ids.projectId, ids.flowId, String(receipt?.adaptationId));
    expect(adaptation?.status).toBe("applied");
    expect(JSON.stringify(adaptation?.patch)).not.toMatch(/"handles?":/u);
  });

  it("refuses a fix naming a handle the packet never gave: nothing runs it and nothing is saved", async () => {
    const found = world({ broken: { times: "always", retryable: false } }, replaceByHandle("t99"), handleDomain([]));
    const { nodes, edges } = line();
    const ids = await flow(found, nodes, edges);
    const { session, detail } = await run(found, ids);

    expect(session.status).toBe("failed");
    expect(found.presses).toEqual(["open", "broken"]);
    expect(await found.readStoredBrokenNode?.()).toEqual({ control: "broken" });
    const receipt = (detail?.metadata?.inRunRepairs as JsonObject[] | undefined)?.[0];
    expect(receipt).toMatchObject({ outcome: "none", code: "step_unresolved", issueCodes: ["example.handle.unknown"] });
    expect(String(receipt?.reason)).not.toMatch(/selector|fingerprint|address|score/iu);
  });
});
