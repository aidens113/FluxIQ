import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { automationStudioRunGraphOptions } from "../../../service/runtime-session/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import type { AutomationStudioStepLoopContext } from "../../step-loop/index.ts";
import { automationStudioRunState } from "../../run-state.ts";
import type { AutomationStudioUnboundTargetReacquireRequest } from "../request.ts";
import type { AutomationStudioUnboundTargetReacquireAnswer } from "../answer.ts";

export const stale = { category: "target_not_found" as const, code: "example.target.stale", retryable: true, stage: "target_resolution" as const, effect: "unacted" as const };
export const found: AutomationStudioUnboundTargetReacquireAnswer = { outcome: "found", patches: [{ operation: "set", parameterId: "selector", value: "fresh" }, { operation: "set", parameterId: "element", value: { identity: "specimen-17", address: "fresh" } }] };
export const refresh = { container: "node" as const, definitionId: "example.activate", definitionVersion: "1.0.0", parameterIds: ["selector", "element"], removableParameterIds: ["selector"] };

export function definition(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id: "example.activate", version: "1.0.0", label: "Activate", description: "Activate an identified specimen control.", category: "custom",
    source: { kind: "importer", domainId: "specimens", packageId: "example.specimens", implementationKey: "activate" }, availability: { kind: "domain", domainId: "specimens" }, capabilities: { executable: true, codeBacked: true },
    inputs: [], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }],
    parameters: [{ id: "selector", label: "Address", valueType: "string", targetRefresh: true }, { id: "element", label: "Identity", valueType: "object", required: true, targetRefresh: true }, { id: "note", label: "Note", valueType: "string" }],
    outputAction: { fixedOutputId: "example.activate" }, actionEffect: { effectClass: "observe" }
  };
}

export function graph(node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.identity", ownerKind: "routine", ownerId: "specimens", name: "Specimen identity", createdAt: 1, updatedAt: 1, nodes: [node], edges: [] };
}

export function setup(kind: "native" | "output" = "native", answer: (request: AutomationStudioUnboundTargetReacquireRequest) => AutomationStudioUnboundTargetReacquireAnswer | Promise<AutomationStudioUnboundTargetReacquireAnswer> = () => found) {
  const seen: Array<Record<string, JsonValue>> = [];
  const captures: Array<{ point: string; node: AutomationStudioFlowNode; attemptId: string; ref: string }> = [];
  const requests: AutomationStudioUnboundTargetReacquireRequest[] = [];
  const perform = (parameters: Record<string, JsonValue>): AutomationNodeExecutionResult => {
    seen.push(structuredClone(parameters));
    return parameters.selector === "fresh" ? { status: "success", route: "success", outputs: {} } : { status: "failed", route: "failed", outputs: {}, failure: { ...stale } };
  };
  const declared = definition();
  const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.specimens", packageVersion: "1.0.0", domainId: "specimens", nodes: [declared] }, { packageId: "example.specimens", packageVersion: "1.0.0", implementations: { activate: ({ parameters }) => perform({ ...parameters }) } });
  const parameters = { selector: "old", element: { identity: "specimen-17", address: "old" }, note: "unchanged" };
  const node: AutomationStudioFlowNode = { id: "act", definitionId: kind === "native" ? declared.id : "builtin.policy.action", parameterValues: kind === "native" ? parameters : { outputId: "example.activate", parameters, requiresApproval: true }, metadata: { effect: "observe", declaredConsequences: [] } };
  const flow = graph(node);
  const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: [], nativeNodeRuntime: native, hostRuntime: {
    capabilities: ["state-snapshot"],
    captureStateSnapshot: ({ point, node: captured, attemptId }) => {
      const ref = `capture-${captures.length + 1}`;
      captures.push({ point, node: structuredClone(captured), attemptId, ref });
      return { stateSnapshotId: ref, stateRef: ref, capturedAt: 1 };
    },
    reacquireUnboundTarget: async (request) => {
      requests.push(request);
      return await answer(request);
    }
  } });
  options.delay = async () => undefined;
  if (kind === "output") options.effectDispatcher = (effect) => perform((effect.payload as { parameters: Record<string, JsonValue> }).parameters);
  return { flow, node, options, native, declared, seen, captures, requests };
}

export function context(options: Partial<AutomationStudioGraphExecutionOptions> = {}) {
  const node: AutomationStudioFlowNode = { id: "act", definitionId: "example.activate", parameterValues: { selector: "old", element: { identity: "specimen-17" } } };
  const previous: AutomationStudioNodeAttemptTrace = { attemptId: "act.attempt.3", nodeId: "act", definitionId: node.definitionId, startedAt: 1, finishedAt: 1, status: "failed", inputs: {}, outputs: {}, effects: [], failure: { ...stale } };
  const configured: AutomationStudioGraphExecutionOptions = { resolveTargetRefresh: () => ({ kind: "declared", refresh }), hostRuntime: { capabilities: [], reacquireUnboundTarget: () => found }, ...options };
  const ctx = { flow: graph(node), options: configured, now: () => 5, attempts: [previous], values: {}, nodesById: new Map([[node.id, node]]), runState: automationStudioRunState(configured), lifecycle: {}, arrival: { nodeId: node.id, attempts: 4, ordinal: 1, consumed: new Set() }, pendingRetry: { previousAttemptId: previous.attemptId }, nextAttemptNumber: () => 4 } as unknown as AutomationStudioStepLoopContext;
  return { ctx, node, previous };
}
