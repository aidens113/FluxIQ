// Core's own harness options: the actions the exploration loop may take that
// hold for every domain.
//
// Until this file existed Core shipped none, so every action the loop could
// take came from one importing domain and the loop looked domain-specific
// when it was not. These six are the neutral set. Each one reads something
// Core itself models -- the Flow graph, a node, the node catalogue, the state
// the host reports, the difference between two states, what has been tried
// before -- and each is expressible with no page, selector, tab or browser
// anywhere in it.
//
// An option appears only when the host binds the method behind it, so a host
// that binds nothing behaves exactly as before this file was added, and a
// domain that binds three gets three. A domain's own options extend this set;
// the registry refuses a duplicate id, so they can never replace it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioHarnessOptionHost, AutomationStudioHarnessOptionHostContext } from "./host.ts";
import type {
  AutomationStudioHarnessOption,
  AutomationStudioHarnessOptionBundle,
  AutomationStudioHarnessOptionExecution,
  AutomationStudioHarnessOptionImplementation
} from "./option.ts";

export const AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS = {
  flowGraph: "core.flow_graph",
  nodeDetail: "core.node_detail",
  nodeCatalog: "core.node_catalog",
  stateSnapshot: "core.state_snapshot",
  stateDiff: "core.state_diff",
  priorAdaptations: "core.prior_adaptations"
} as const;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,200}$/;
const MAX_PRIOR_ADAPTATIONS = 20;

/**
 * Core's bundle for one host, holding only the options that host can serve.
 *
 * No built-in declares an `initialObservation`: the evidence loop runs at most
 * one of those, and a Core option claiming the slot would take it from every
 * domain that wants to seed the loop with its own first look.
 */
export function builtinAutomationStudioHarnessOptions(host: AutomationStudioHarnessOptionHost): AutomationStudioHarnessOptionBundle {
  const options: AutomationStudioHarnessOption[] = [];
  const implementations: Record<string, AutomationStudioHarnessOptionImplementation> = {};
  const add = (option: AutomationStudioHarnessOption, implementation: AutomationStudioHarnessOptionImplementation): void => {
    options.push(option);
    implementations[option.toolId] = implementation;
  };

  const describeFlowGraph = host.describeFlowGraph?.bind(host);
  if (describeFlowGraph) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.flowGraph,
      description: "Read the Flow as it is authored right now: every node with its definition and parameter values, and how the nodes are wired together. Use it to learn what the Flow does before proposing a change to it.",
      schema: emptyObjectSchema()
    }), async (input) => {
      if (Object.keys(input.value).length) return rejection("harness_option.input_invalid");
      return describeFlowGraph(hostContext(input));
    });
  }

  const describeNode = host.describeNode?.bind(host);
  if (describeNode) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.nodeDetail,
      description: "Read one node of the Flow in detail: its definition, the parameter values it will run with, the state it is expected to reach, and its retry settings.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["nodeId"],
        properties: { nodeId: { type: "string", pattern: IDENTIFIER.source } }
      }
    }), async (input) => {
      const nodeId = input.value.nodeId;
      if (!exactKeys(input.value, ["nodeId"]) || typeof nodeId !== "string" || !IDENTIFIER.test(nodeId)) return rejection("harness_option.input_invalid");
      return describeNode({ ...hostContext(input), nodeId });
    });
  }

  const listAvailableNodes = host.listAvailableNodes?.bind(host);
  if (listAvailableNodes) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.nodeCatalog,
      description: "List the node definitions this Flow is allowed to use, with what each one does and the parameters it takes. Use it to find out whether a capability you need already exists before inventing one.",
      schema: emptyObjectSchema()
    }), async (input) => {
      if (Object.keys(input.value).length) return rejection("harness_option.input_invalid");
      return listAvailableNodes(hostContext(input));
    });
  }

  const captureStateSnapshot = host.captureStateSnapshot?.bind(host);
  if (captureStateSnapshot) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateSnapshot,
      description: "Capture the current state of whatever this Flow acts on, as the host reports it, and return a reference to it alongside its summary.",
      schema: emptyObjectSchema(),
      requiredRuntimeCapabilities: ["state-snapshot"],
      repeatPolicy: "after_mutation"
    }), async (input) => {
      if (Object.keys(input.value).length) return rejection("harness_option.input_invalid");
      return captureStateSnapshot(hostContext(input));
    });
  }

  const inspectStateDiff = host.inspectStateDiff?.bind(host);
  if (inspectStateDiff) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.stateDiff,
      description: "Compare two captured states by reference and report what changed between them. Use it to tell what a step actually did, rather than assuming it did what it was meant to.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["beforeRef", "afterRef"],
        properties: {
          beforeRef: { type: "string", pattern: IDENTIFIER.source },
          afterRef: { type: "string", pattern: IDENTIFIER.source }
        }
      },
      requiredRuntimeCapabilities: ["state-diff"]
    }), async (input) => {
      const { beforeRef, afterRef } = input.value;
      if (!exactKeys(input.value, ["beforeRef", "afterRef"]) || typeof beforeRef !== "string" || !IDENTIFIER.test(beforeRef)
        || typeof afterRef !== "string" || !IDENTIFIER.test(afterRef)) return rejection("harness_option.input_invalid");
      return inspectStateDiff({ ...hostContext(input), beforeRef, afterRef });
    });
  }

  const listPriorAdaptations = host.listPriorAdaptations?.bind(host);
  if (listPriorAdaptations) {
    add(observeOption({
      toolId: AUTOMATION_STUDIO_BUILTIN_HARNESS_OPTION_IDS.priorAdaptations,
      description: "Read the adaptations already recorded for this Flow and whether each one was verified to work. Use it to avoid proposing again something that has already been tried and failed.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1, maximum: MAX_PRIOR_ADAPTATIONS },
          failureSignature: { type: "string", pattern: IDENTIFIER.source }
        }
      }
    }), async (input) => {
      const { limit, failureSignature } = input.value;
      if (!exactKeys(input.value, ["limit", "failureSignature"])
        || (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_PRIOR_ADAPTATIONS))
        || (failureSignature !== undefined && (typeof failureSignature !== "string" || !IDENTIFIER.test(failureSignature)))) {
        return rejection("harness_option.input_invalid");
      }
      return listPriorAdaptations({
        ...hostContext(input),
        limit: typeof limit === "number" ? limit : 5,
        ...(typeof failureSignature === "string" ? { failureSignature } : {})
      });
    });
  }

  return { schemaVersion: "0.1", options, implementations };
}

function observeOption(input: {
  toolId: string;
  description: string;
  schema: JsonObject;
  requiredRuntimeCapabilities?: string[];
  repeatPolicy?: "after_mutation";
}): AutomationStudioHarnessOption {
  return {
    toolId: input.toolId,
    description: input.description,
    inputSchema: input.schema,
    effect: "observe",
    ...(input.repeatPolicy ? { repeatPolicy: input.repeatPolicy } : {}),
    // "both" rather than "global": a Core option is offered to a
    // domain-scoped Flow too, which is the whole point of Core owning it.
    availability: { kind: "both" },
    ...(input.requiredRuntimeCapabilities ? { requiredRuntimeCapabilities: input.requiredRuntimeCapabilities } : {}),
    safety: { sideEffect: "observe" }
  };
}

function emptyObjectSchema(): JsonObject {
  return { type: "object", additionalProperties: false, properties: {} };
}

function hostContext(input: AutomationStudioHarnessOptionExecution): AutomationStudioHarnessOptionHostContext {
  return {
    projectId: input.projectId,
    flowId: input.flowId,
    ...(input.runId !== undefined ? { runId: input.runId } : {}),
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  };
}

/**
 * A refusal the model can act on. The loop treats `{ok:false,code}` evidence as
 * feedback and picks another action, so a malformed call costs one iteration
 * instead of ending the exploration.
 */
function rejection(code: string): AutomationStudioLlmEvidenceToolExecutionResult {
  const evidence: JsonValue = { ok: false, code };
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: false, resultCode: code };
}

function exactKeys(value: JsonObject, allowed: string[]): boolean {
  const permitted = new Set(allowed);
  return Object.keys(value).every((key) => permitted.has(key));
}
