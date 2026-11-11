// The row fields a repeat reads, kept by the read it walks, in a replay as in the saved Flow (run-mwb9b59w-aa0784db).
//
// Assembly may narrow a read's record output to the columns the instruction names, and then keeps in it each field
// a step of a repeat over that read takes from its row -- `$row.url` on the step that opens each row by its own
// address -- stored and not shown (`../../../flow-authoring/bootstrap/script-statements/repeat/row-fields.ts`, t869).
// A replay sends a read the record output its saved Flow node has (`./replay.ts`), and once the instruction's named
// columns reached it, it sent the narrowing without that keeping: a forward run's read returned title and price, every
// pass of the repeat over it found no `url`, and the run stopped `core.replay.unresolved_binding` on a step the saved
// Flow runs. So a replayed read keeps those fields too, by the same lowering: the read, a For Each over its records,
// and the row fields the repeat's steps read, handed to it as one plan, and the read's parameters taken back from it.
// Nothing changes for a read no repeat walks, a do-while (it walks no list), or a record output that keeps them already.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { AutomationStudioNodeRegistry, isAutomationNodeParameterStateBinding, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-authoring/bootstrap/plan/index.ts";
import { automationStudioFlowPlanRepeatRowFields } from "../../../flow-authoring/bootstrap/script-statements/index.ts";
import { automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepId, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";

/** The node a `repeat over` span becomes, the input its rows arrive on, and the name a pass's row goes by in state, as assembly writes them. */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
const ROW_NAME = "item";
/** How deep a step's call is searched for a row binding, as far as the executor resolves one. */
const MAXIMUM_DEPTH = 16;

/** `parameters` with each record output keeping the row fields a repeat over `step` reads (header); `parameters` itself when none needs it. */
export function automationStudioFlowDraftReplayRowFieldsKept(input: {
  /** The whole draft: where the repeats over `step` are. */
  steps: readonly AutomationStudioFlowDraftStep[];
  step: AutomationStudioFlowDraftStep;
  definition: AutomationStudioNodeDefinition;
  parameters: JsonObject;
}): JsonObject {
  const fields = rowFieldsRead(input.steps, input.step);
  if (!fields.length) return input.parameters;
  const { definition } = input;
  const port = definition.outputs.find((output) => output.valueType === "array")?.id ?? "records";
  const reads: JsonValue[] = fields.map((field) => ({ $state: { path: `${ROW_NAME}.${field}` } }));
  const plan: AutomationStudioFlowBootstrapPlan = {
    schemaVersion: "0.1",
    router: { name: "replay", rules: [], fallback: { kind: "fail" } },
    subflows: [{
      key: "replay",
      name: "replay",
      role: "primary",
      nodes: [
        { key: "list", definitionId: definition.id, definitionVersion: definition.version, parameters: input.parameters },
        { key: "each", definitionId: FOR_EACH_ID, definitionVersion: definition.version },
        { key: "row", definitionId: FOR_EACH_ID, definitionVersion: definition.version, parameters: { reads } }
      ],
      edges: [
        { key: "rows", source: { nodeKey: "list", portId: port }, target: { nodeKey: "each", portId: ROWS_INPUT } },
        { key: "pass", source: { nodeKey: "each", portId: ROW_NAME }, target: { nodeKey: "row", portId: "in" } },
        { key: "back", source: { nodeKey: "row", portId: "out" }, target: { nodeKey: "each", portId: "next" } }
      ]
    }]
  };
  const kept = automationStudioFlowPlanRepeatRowFields({ plan, registry: new AutomationStudioNodeRegistry([definition]), resolution: available(definition) });
  return kept === plan ? input.parameters : kept.subflows[0]?.nodes[0]?.parameters ?? input.parameters;
}

/** The fields the steps of every repeat over `step` read from their row, each once, in the order first read. */
function rowFieldsRead(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep): string[] {
  const proposed = steps.filter(automationStudioFlowDraftStepIsProposed);
  const id = automationStudioFlowDraftStepId(step);
  const fields = new Set<string>();
  proposed.forEach((first, start) => {
    const routing = first.routing;
    if (routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(routing) || routing.over !== id) return;
    const end = proposed.findIndex((each) => automationStudioFlowDraftStepId(each) === routing.through);
    for (const member of proposed.slice(start, Math.max(start, end) + 1)) collect(member.ranWith ?? member.input, 0, fields);
  });
  return [...fields];
}

/** Each row field a value reads, `item.<field>` in a state binding, into `into`. */
function collect(value: JsonValue | undefined, depth: number, into: Set<string>): void {
  if (value === undefined || value === null || typeof value !== "object" || depth > MAXIMUM_DEPTH) return;
  if (isAutomationNodeParameterStateBinding(value)) {
    const [root, field] = value.$state.path.split(".");
    if (root === ROW_NAME && field) into.add(field);
    return;
  }
  for (const inner of Array.isArray(value) ? value : Object.values(value)) collect(inner, depth + 1, into);
}

/** A resolution under which the definition is available, so the one-node registry answers it. */
function available(definition: AutomationStudioNodeDefinition): AutomationStudioNodeRegistryResolution {
  const availability = definition.availability;
  return {
    scope: availability.kind === "domain" ? { kind: "domain", domainId: availability.domainId } : { kind: "global" },
    runtimeCapabilities: definition.requiredRuntimeCapabilities ?? [],
    permissions: definition.safety?.requiredPermissions ?? []
  };
}
