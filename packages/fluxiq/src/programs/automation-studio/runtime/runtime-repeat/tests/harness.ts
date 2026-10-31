import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationNodeExecutionResult, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";
import { automationStudioRunGraphOptions } from "../../service/runtime-session/index.ts";
import type { AutomationStudioHostStateSnapshotRef } from "../../host-runtime.ts";
import type { AutomationStudioRuntimeRepeatObservation } from "../observation.ts";
import type { AutomationStudioRuntimeRepeatObservationInput } from "../observation-input.ts";

/** Real importer registration/execution, with isolated provider-free capture observations. */
export function runtimeRepeatHarness() {
  const controller = new AbortController();
  const calls: Array<{ parameters: Record<string, JsonValue>; inputs: Record<string, JsonValue> }> = [];
  const captures: AutomationStudioHostStateSnapshotRef[] = [];
  const observations: AutomationStudioRuntimeRepeatObservationInput[] = [];
  const state: {
    view: string; resource: string; target: string;
    perform: ((count: number, parameters: Readonly<Record<string, JsonValue>>, inputs: Readonly<Record<string, JsonValue>>) => AutomationNodeExecutionResult) | undefined;
    observe: ((request: AutomationStudioRuntimeRepeatObservationInput, observed: AutomationStudioRuntimeRepeatObservation) => unknown | Promise<unknown>) | undefined;
  } = { view: "view.unchanged", resource: "resource.document.1", target: "subject.1", perform: undefined, observe: undefined };
  const definition: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "example.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one isolated subject.", category: "custom",
    source: { kind: "importer", domainId: "specimens", packageId: "example.specimens", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "specimens" }, capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "item", label: "Item", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any", role: "success" }, { id: "commandId", label: "Command", valueType: "string", role: "data" }, { id: "value", label: "Value", valueType: "any", role: "data" }],
    parameters: [{ id: "subject", label: "Subject", valueType: "string", targetRefresh: true }, { id: "note", label: "Note", valueType: "any" }], actionEffect: { effectClass: "observe" }
  };
  const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.specimens", packageVersion: "1.0.0", domainId: "specimens", nodes: [definition] }, { packageId: "example.specimens", packageVersion: "1.0.0", implementations: { inspect: ({ parameters, inputs }) => {
    calls.push({ parameters: structuredClone(parameters), inputs: structuredClone(inputs) });
    return state.perform?.(calls.length, parameters, inputs) ?? { status: "success", route: "success", outputs: { commandId: `command.${calls.length}` } };
  } } });
  const accepted = new WeakMap<AutomationStudioHostStateSnapshotRef, AutomationStudioRuntimeRepeatObservation>();
  const options = automationStudioRunGraphOptions({ signal: controller.signal, authorizedDomainIds: ["specimens"], nativeNodeRuntime: native, maxSteps: 35, hostRuntime: {
    capabilities: ["state-snapshot"],
    captureStateSnapshot: ({ node }) => {
      if (node.definitionId !== definition.id) throw new Error("This Core node has no external capture.");
      const ref = { stateSnapshotId: `snapshot.${captures.length + 1}`, stateRef: `capture.${captures.length + 1}`, capturedAt: captures.length + 1 };
      captures.push(ref);
      accepted.set(ref, { kind: "observed", coverage: "complete", resource: state.resource, target: { kind: "identified", key: typeof node.parameterValues?.subject === "string" ? node.parameterValues.subject : state.target }, viewDigest: state.view });
      return ref;
    },
    observeRuntimeRepeat: async request => {
      observations.push(request);
      const observed: AutomationStudioRuntimeRepeatObservation = accepted.get(request.stateRef) ?? { kind: "unavailable", reason: "missing" };
      return (state.observe ? await state.observe(request, observed) : observed) as AutomationStudioRuntimeRepeatObservation;
    }
  } });
  options.delay = async () => undefined;
  const flow: AutomationStudioFlowDocument = {
    schemaVersion: "0.1", flowId: "flow.observed-repeat", ownerKind: "routine", ownerId: "isolated", name: "Observed repeat", createdAt: 1, updatedAt: 1,
    nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "act", definitionId: definition.id, parameterValues: { subject: "subject.1" } }, { id: "flag", definitionId: "builtin.data.constant", parameterValues: { value: true } }, { id: "check", definitionId: "builtin.control.branch" }, { id: "done", definitionId: "builtin.control.end" }],
    edges: [
      { id: "entry", sourceNodeId: "start", sourcePortId: "next", targetNodeId: "act", targetPortId: "in" },
      { id: "act-flag", sourceNodeId: "act", sourcePortId: "success", targetNodeId: "flag", targetPortId: "in" },
      { id: "flag-check", sourceNodeId: "flag", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
      { id: "condition", sourceNodeId: "flag", sourcePortId: "value", targetNodeId: "check", targetPortId: "condition" },
      { id: "again", sourceNodeId: "check", sourcePortId: "true", targetNodeId: "act", targetPortId: "in" },
      { id: "end", sourceNodeId: "check", sourcePortId: "false", targetNodeId: "done", targetPortId: "in" }
    ]
  };
  return { flow, options, native, state, calls, captures, observations, controller };
}
