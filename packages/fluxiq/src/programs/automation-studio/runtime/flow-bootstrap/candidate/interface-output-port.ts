// What a callable part's interface output is bound to (t594, t639).
//
// A part hands back `output: <name> = $step.<label>.<output>`, which the plan
// keeps as `$node.<key>.<output>` on the interface port. That output is one of
// three things: a value the step makes; the step's success or failure port, a
// route that says only whether it worked (t594's `output_not_a_value`); or a
// port the step's node does not declare at all, which holds nothing at run
// time (t639). On A8 wave 10 a builder handed on an output of a step whose node
// declares only its success and failure ports; Core accepted it, the value was
// empty, and every later builder was held to read it.
//
// A node whose definition the registry does not know is read by the port's id,
// as definitions default it (`nodes/shared/definition.ts`), and is never said
// to lack a port. A call to a part also gives the part's outputs, which its own
// parameters name (`../authoring/assemble-draft.ts`, `calledOutputs`).
//
// Both the whole-candidate check (`./submission.ts`) and a subflow brief's
// (`../subflow-candidate/route-outputs.ts`) read the binding here, and each
// says the refusal in its own words.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";

/** A port's role by its id, for a port the registry does not describe (header). */
const ROUTE_PORTS: Readonly<Record<string, "success" | "failure">> = { success: "success", failed: "failure", failure: "failure" };

/** Where a bound output reads from: `$node.<key>.<port>`, the plan's form of `$step.<label>.<output>`. */
const NODE_OUTPUT = /^\$node\.([^.]+)\.([^.]+)/u;

/** What one interface output reads (header); undefined when it reads no step of the part. */
export type AutomationStudioInterfaceOutputPort =
  | { kind: "value"; port: string }
  | { kind: "route"; port: string; role: "success" | "failure" }
  | { kind: "unknown"; port: string; definitionId: string; declared: string[] };

/** Classifies an interface output's binding against the node of the step it reads (header). */
export function automationStudioInterfaceOutputPort(
  subflow: Pick<AutomationStudioFlowBootstrapSubflow, "nodes">,
  binding: JsonObject | undefined,
  nodes: { registry: Pick<AutomationStudioNodeRegistry, "get">; resolution?: Parameters<AutomationStudioNodeRegistry["get"]>[1] }
): AutomationStudioInterfaceOutputPort | undefined {
  const state = binding?.$state;
  const path = state && typeof state === "object" && !Array.isArray(state) ? state.path : undefined;
  const read = typeof path === "string" ? NODE_OUTPUT.exec(path) : null;
  const nodeKey = read?.[1];
  const port = read?.[2];
  const node = nodeKey === undefined ? undefined : subflow.nodes.find((candidate) => candidate.key === nodeKey);
  if (!node || port === undefined) return undefined;
  const definition = nodes.registry.get(node.definitionId, nodes.resolution);
  const declaredPort = definition?.outputs.find((candidate) => candidate.id === port);
  const role = declaredPort?.role ?? ROUTE_PORTS[port];
  if (role === "success" || role === "failure") return { kind: "route", port, role };
  if (declaredPort || !definition) return { kind: "value", port };
  const called = calledOutputs(node.definitionId, node.parameters);
  if (called.includes(port)) return { kind: "value", port };
  return { kind: "unknown", port, definitionId: node.definitionId, declared: [...definition.outputs.map((candidate) => candidate.id), ...called] };
}

/** The outputs a call to a part gives, by the names its own parameters carry. */
function calledOutputs(definitionId: string, parameters: JsonObject | undefined): string[] {
  const outputs = definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow ? parameters?.outputs : undefined;
  return outputs && typeof outputs === "object" && !Array.isArray(outputs) ? Object.keys(outputs) : [];
}
