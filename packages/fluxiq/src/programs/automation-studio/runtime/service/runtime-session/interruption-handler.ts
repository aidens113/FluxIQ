// The handler Core proposes, with no model, for a layer the client's defence
// closed while a step succeeded (t516).
//
// The user's rule: an interruption met in a run becomes a branch of the Flow --
// wait for it, dismiss it, return. The defence already closes such a layer, so
// the step succeeds and no failure ever reaches a repair; the Flow learned
// nothing, and the everything-store gate's deal-wheel drift could never count
// (`docs/working/language-driven-flow-loop-plan/debugs/run-mv6v2hx5-f448e662.md`
// downstream). The close is evidence enough to write the branch without asking
// anyone: the layer's name, which the page view labels it by, and the way out
// the defence pressed, which the domain names by a handle.
//
// So the branch is an `add_handler` (C4), the kind an in-run repair writes for
// an interruption, scoped to the layer rather than the step (P6, t796): a
// subflow-wide handler that waits for the layer by its name, so the part holds
// one handler per layer and it answers the layer at every step the site covers
// with it, not only the one it was first met at, in the one shape a
// build also gives a layer its exploration cleared
// (`../../flow-bootstrap/layer-handlers/patch.ts`, t787):
//
// - `before` each step of the part, `when` the layer by that name is visible (the `obstruction` fact for a layer that carried an `id`, else `dialog`): the guard. No
//   wait is written (supervisor, 2026-10-13): a wait would slow every run for a
//   layer that may never come, and the defence stays the backup for one that
//   opens after the guard was read.
// - one step pressing the way out, by the domain's pressing definition and the
//   handle; it declares no lasting consequence, since a way out the defence may
//   press is one that commits nothing (the extension's press guard).
// - `completionCheck`: the layer by that name is absent.
// - `resume`: the step then runs as it would have.
//
// Nothing is proposed for a layer with no name or no way out the domain can
// press, or when the part already has a handler waiting for that layer.

import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioClearedLayer } from "../../executor/index.ts";
import type { AutomationStudioFactCondition } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioRuntimeAddHandlerPatch } from "../../llm/index.ts";
import { automationStudioLayerFact, automationStudioLayerHandlerPatch } from "../../flow-bootstrap/index.ts";
import { isJsonRecord } from "../json-values.ts";

/** The host facts a layer by its name is asked about: any open layer whose name contains the words (I3, CC7). A layer that carried an `id` is asked by `obstruction`, else by `dialog`; a handler waits by either. */
const LAYER_FACTS: ReadonlySet<string> = new Set(["obstruction", "dialog"]);

/** The most characters of a name a step's label or the reason quotes. */
const QUOTED_MAX = 80;

/** The handler for `layer`, met at `nodeId`, pressing the way out the domain names `handle`; or nothing (header). */
export function automationStudioInterruptionHandlerPatch(input: {
  graph: Pick<AutomationStudioFlowDocument, "nodes">;
  nodeId: string;
  layer: AutomationStudioClearedLayer;
  handle: string;
}): AutomationStudioRuntimeAddHandlerPatch | undefined {
  const { layer, nodeId } = input;
  const name = layer.name;
  if (!name || !layer.wayOutDefinitionId) return undefined;
  if (alreadyHandled(input.graph, nodeId, name, layer.id)) return undefined;
  const fact = automationStudioLayerFact(layer);
  const shown: AutomationStudioFactCondition = { fact, op: "visible", value: name };
  const gone: AutomationStudioFactCondition = { fact, op: "absent", value: name };
  const pressed = layer.controlName ?? layer.control;
  return automationStudioLayerHandlerPatch({
    scope: { kind: "subflow", inherit: false },
    shown,
    gone,
    press: { definitionId: layer.wayOutDefinitionId, label: `Close "${quoted(name)}"`, parameters: { target: { handle: input.handle } } },
    reason: `The page put "${quoted(name)}" in the way of a step and the run closed it by "${quoted(pressed)}". When it is there again, the Flow closes it the same way and carries on.`,
    metadata: { learnedFrom: "defence_close", layerKind: layer.kind, ...(layer.id ? { layerId: layer.id } : {}) }
  });
}

/** Whether a handler of the graph already waits for the layer by `name` (by either fact) or by its `layerId` at `nodeId`: any registration naming the layer whose scope reaches that step. */
function alreadyHandled(graph: Pick<AutomationStudioFlowDocument, "nodes">, nodeId: string, name: string, layerId: string | undefined): boolean {
  return graph.nodes.some((node) => {
    if (node.definitionId !== AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) return false;
    const values = node.parameterValues ?? {};
    const scope = isJsonRecord(values.scope) ? values.scope : undefined;
    const covers = scope?.kind !== "nodes" || (Array.isArray(scope.nodeIds) && scope.nodeIds.includes(nodeId));
    if (covers && layerId !== undefined && isJsonRecord(node.metadata) && node.metadata.layerId === layerId) return true;
    const when = Array.isArray(values.when) ? values.when : [];
    return covers && when.some((condition) => isJsonRecord(condition) && typeof condition.fact === "string" && LAYER_FACTS.has(condition.fact) && condition.value === name);
  });
}

function quoted(words: string): string {
  return words.length > QUOTED_MAX ? `${words.slice(0, QUOTED_MAX - 1)}…` : words;
}
