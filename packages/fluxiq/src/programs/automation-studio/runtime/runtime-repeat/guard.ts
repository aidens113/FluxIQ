import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../executor/contracts.ts";
import type { AutomationStudioRunState } from "../executor/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import type { AutomationStudioRuntimeRepeatObservationInput } from "./observation-input.ts";
import type { AutomationStudioRuntimeRepeatObservation } from "./observation.ts";
import type { AutomationStudioRuntimeRepeatSample } from "./sample.ts";
import type { AutomationStudioRuntimeRepeatEvidence } from "./evidence.ts";
import { automationStudioRuntimeRepeatCheckpoint } from "./checkpoint.ts";
import { automationStudioRuntimeRepeatComponent } from "./component.ts";
import { automationStudioRuntimeRepeatDigest } from "./digest.ts";
import { automationStudioReadRuntimeRepeatObservation } from "./read-observation.ts";

/** One frame's bounded, private evidence for two completed unchanged visits. */
export function automationStudioRuntimeRepeatGuard() {
  const candidates = new Map<string, { key: string; count: number }>();
  const components = new Map<string, readonly AutomationStudioFlowNode[] | undefined>();
  let graph: AutomationStudioFlowDocument | undefined;
  let checkpoint: string | undefined;
  let observedView: string | undefined;
  let epoch = 0;
  const barrier = () => {
    candidates.clear();
    checkpoint = undefined;
    observedView = undefined;
    epoch++;
  };
  const view = (resource: string, viewDigest: string) => {
    const current = automationStudioRuntimeRepeatDigest({ resource, viewDigest });
    if (current.kind === "unavailable") {
      barrier();
      return;
    }
    if (observedView !== undefined && observedView !== current.value) barrier();
    observedView = current.value;
  };
  const touch = (value: AutomationStudioRuntimeRepeatEvidence<string>) => {
    if (value.kind === "unavailable") {
      barrier();
      return;
    }
    if (checkpoint !== undefined && checkpoint !== value.value) barrier();
    checkpoint = value.value;
  };
  return {
    barrier,
    sample(flow: AutomationStudioFlowDocument, node: AutomationStudioFlowNode, values: Record<string, JsonValue>, state: AutomationStudioRunState, options: AutomationStudioGraphExecutionOptions): AutomationStudioRuntimeRepeatSample {
      if (graph !== flow) {
        barrier();
        components.clear();
        graph = flow;
      }
      if (!components.has(node.id) && components.size < 512) components.set(node.id, automationStudioRuntimeRepeatComponent(flow, node.id));
      const component = components.get(node.id);
      const readCheckpoint = (): AutomationStudioRuntimeRepeatEvidence<string> => component
        ? automationStudioRuntimeRepeatCheckpoint(flow, component, values, options, state)
        : { kind: "unavailable", reason: "unsupported" };
      let resolved: AutomationStudioFlowNode | undefined;
      let inputs: Readonly<Record<string, JsonValue>> = {};
      let beforeState: string | undefined;
      let beforeCheckpoint: string | undefined;
      let key: string | undefined;
      let sampledEpoch = epoch;
      let transparent = false;
      let completed = false;
      let stopped = false;
      let attemptId = "";
      const observe = async (point: "before_action" | "after_action", stateRef: AutomationStudioHostStateSnapshotRef | undefined): Promise<AutomationStudioRuntimeRepeatObservation> => {
        if (!stateRef || !resolved) return { kind: "unavailable", reason: "missing" };
        const host = options.hostRuntime;
        try {
          const method = observer(host);
          if (!method) return { kind: "unavailable", reason: "unsupported" };
          const request: AutomationStudioRuntimeRepeatObservationInput = { node: resolved, attemptId, inputs, stateRef, point, ...(options.signal ? { signal: options.signal } : {}) };
          return automationStudioReadRuntimeRepeatObservation(await method.call(host, request));
        } catch {
          return { kind: "unavailable", reason: "unreadable" };
        }
      };
      return {
        async before(executionNode, executionInputs, stateRef, kind, id) {
          resolved = executionNode;
          inputs = executionInputs;
          if (kind === "barrier" || !component || unsupportedHandlers(options)) {
            barrier();
            return true;
          }
          const baseline = readCheckpoint();
          touch(baseline);
          if (baseline.kind === "unavailable") return true;
          beforeCheckpoint = baseline.value;
          transparent = kind === "transparent";
          if (transparent) {
            sampledEpoch = epoch;
            return true;
          }
          attemptId = id;
          const observation = await observe("before_action", stateRef);
          if (options.signal?.aborted || observation.kind === "unavailable") {
            barrier();
            return true;
          }
          // Different subjects at A and B are ordinary; resource/view changes are progress.
          view(observation.resource, observation.viewDigest);
          const liveCheckpoint = readCheckpoint();
          if (liveCheckpoint.kind === "unavailable") {
            barrier();
            return true;
          }
          if (liveCheckpoint.value !== beforeCheckpoint) {
            barrier();
            beforeCheckpoint = liveCheckpoint.value;
          }
          const stateDigest = automationStudioRuntimeRepeatDigest(observation);
          const tupleDigest = automationStudioRuntimeRepeatDigest({ nodeId: node.id, definitionId: node.definitionId, parameters: executionNode.parameterValues ?? {}, inputs: executionInputs, observation });
          if (stateDigest.kind === "unavailable" || tupleDigest.kind === "unavailable") {
            barrier();
            return true;
          }
          beforeState = stateDigest.value;
          key = tupleDigest.value;
          sampledEpoch = epoch;
          const previous = candidates.get(node.id);
          return !(previous?.key === key && previous.count >= 2);
        },
        async after(attempt) {
          if (stopped) return;
          if (!resolved || attempt.status !== "succeeded" || attempt.skipped || attempt.childTrace || attempt.lifecycle || attempt.checkpointRoute || unobservedEffects(attempt)) {
            barrier();
            return;
          }
          if (transparent) {
            completed = true;
            return;
          }
          if (!key || !beforeState) return;
          const after = await observe("after_action", attempt.stateRefs?.afterAction);
          await options.commandRun?.checkpoint();
          if (options.signal?.aborted || after.kind === "unavailable") {
            barrier();
            return;
          }
          const afterDigest = automationStudioRuntimeRepeatDigest(after);
          if (afterDigest.kind === "unavailable" || afterDigest.value !== beforeState) {
            barrier();
            return;
          }
          view(after.resource, after.viewDigest);
          completed = true;
        },
        settle() {
          if (stopped) return;
          if (!completed || !beforeCheckpoint || sampledEpoch !== epoch) {
            barrier();
            return;
          }
          const afterCheckpoint = readCheckpoint();
          if (afterCheckpoint.kind === "unavailable" || afterCheckpoint.value !== beforeCheckpoint) {
            barrier();
            return;
          }
          touch(afterCheckpoint);
          if (transparent || !key) return;
          const prior = candidates.get(node.id);
          if (!candidates.has(node.id) && candidates.size >= 512) {
            barrier();
            return;
          }
          candidates.set(node.id, { key, count: prior?.key === key ? Math.min(2, prior.count + 1) : 1 });
        },
        stop() { stopped = true; },
        stopped() { return stopped; },
        abandon() {
          stopped = false;
          barrier();
        }
      };
    }
  };
}

function observer(host: AutomationStudioHostRuntimeBoundary | undefined): AutomationStudioHostRuntimeBoundary["observeRuntimeRepeat"] {
  let current: object | null | undefined = host;
  for (let depth = 0; current && depth < 8; depth++, current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, "observeRuntimeRepeat");
    if (descriptor) return Object.hasOwn(descriptor, "value") && typeof descriptor.value === "function" ? descriptor.value : undefined;
  }
  return undefined;
}

function unsupportedHandlers(options: AutomationStudioGraphExecutionOptions): boolean {
  const lifecycle = options.invocation?.run.lifecycle;
  return lifecycle !== undefined && [...lifecycle.graphs.values()].some(graph => graph.problems.length > 0 || graph.registrations.some(registration => registration.source.kind === "handler_node" || registration.source.kind === "clears_interference"));
}

function unobservedEffects(attempt: AutomationStudioNodeAttemptTrace): boolean {
  try {
    if (Object.getOwnPropertyDescriptor(attempt.outputs, "records") || attempt.effects.length > 512) return true;
    return attempt.effects.some(effect => {
      const type = Object.getOwnPropertyDescriptor(effect, "type");
      return !type || !Object.hasOwn(type, "value") || type.value !== "policy.output.dispatch";
    });
  } catch { return true; }
}
