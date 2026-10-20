// A lasting act repeated over a listing that orders or narrows its rows only in
// its saved answer (t741).
//
// A `repeat over: <listing>` span becomes a For Each fed by the listing's rows
// (`../authoring/draft-routing.ts`), and it visits them in the order the listing
// read them, every row the listing kept; `repeat most: N` is the For Each's own
// stop after the first N of that order (`nodes/control-flow/for-each.ts`). A
// listing's `recordOutput.process` -- where, dedupe, sort, limit, columns --
// shapes only the answer the run saves at its end, so a sort or a limit there
// never reaches the rows the repeat acts on. Rerun round 3
// (`run-mvgobp8h-b99ede98`, steps 0249-0284) found the right rows by date but
// sorted them only in the process, and `repeat most: 3` acted on the first
// three in page order. The web domain orders the rows a read answers through
// `extractList.sort` and narrows them through `extractList.where`; the script
// format names both (`../plan/flow-script-format.ts`).
//
// So a listing whose process carries `sort` or `limit` is refused, once, at
// that process key, when a For Each it feeds runs a step declaring a lasting
// consequence -- any of Core's classes
// (`../../action-permissions/consequences.ts`). A repeat that only reads or
// navigates acts on nothing that lasts, and its listing may shape its saved
// answer however it likes; a listing no repeat walks is not touched either.
//
// It reads the assembled plan, as `./record-replace-in-repeat.ts` does, and the
// completion check asks it beside that one
// (`../../llm/harness-options/bootstrap-completion.ts`).
import type { JsonObject } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "./loop-body.ts";

/** The node a `repeat over` span becomes, and the input its rows arrive on. */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
/** The code the refusal is made under; its sentences are Core's own and quote nothing the model or the page wrote. */
const CODE = "record_output.process_order_in_repeat";
const MESSAGE = "This listing sorts or limits its rows in recordOutput.process, and a repeat over it makes a lasting change on each row it visits. "
  + "A repeat visits the rows in the listing's own order, every row the listing kept: recordOutput.process only shapes the answer saved at the end of the run, "
  + "so the repeat would act on the rows in the order the page shows them, not in the order or the number the process asks for.";
const INSTEAD = "Put the order on the listing step itself, `extractList.sort: [{\"field\": \"<column>\", \"order\": \"asc\", \"as\": \"date\"}]` "
  + "(order asc or desc, as number, date or text), keep only the rows to act on with `extractList.where`, "
  + "and act on the first N of that order with `repeat most: <N>` beside `repeat over:`. Then take sort and limit out of recordOutput.process.";

/** Every listing a lasting repeat walks whose record output sorts or limits only the saved answer, each refused once at that process key. */
export function automationStudioFlowPlanListingOrderInRepeatIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  return input.plan.subflows.flatMap((subflow, subflowIndex) => {
    const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
    // The listings whose rows a For Each with a lasting act in its body walks.
    const walked = new Set<string>();
    for (const loop of subflow.nodes.filter((node) => node.definitionId === FOR_EACH_ID)) {
      const body = automationStudioFlowPlanLoopBody(subflow, loop.key);
      if (![...body].some((key) => lasting(byKey.get(key)))) continue;
      for (const edge of subflow.edges) if (edge.target.nodeKey === loop.key && edge.target.portId === ROWS_INPUT) walked.add(edge.source.nodeKey);
    }
    return subflow.nodes.flatMap((node, nodeIndex): AutomationStudioFlowBootstrapIssue[] => {
      if (!walked.has(node.key)) return [];
      const definition = input.registry.get(node.definitionId, input.resolution);
      const parameter = (definition?.parameters ?? []).find((candidate) => candidate.ui?.control === "record-output" && orderingKey(node.parameters?.[candidate.id]));
      if (!parameter) return [];
      return [{
        severity: "error", code: CODE, message: MESSAGE, instead: INSTEAD,
        path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${parameter.id}.process.${orderingKey(node.parameters?.[parameter.id])}`
      }];
    });
  });
}

/** Whether a step declares a lasting consequence, any of Core's classes. */
function lasting(node: AutomationStudioFlowBootstrapNode | undefined): boolean {
  return (node?.consequences ?? []).some((written) => isAutomationStudioActionConsequence(written));
}

/** The process key a record output orders or narrows its saved rows by, `sort` before `limit`, or none. */
function orderingKey(value: unknown): "sort" | "limit" | undefined {
  if (!isObject(value) || !isObject(value.process)) return undefined;
  const process = value.process;
  if (Array.isArray(process.sort) ? process.sort.length > 0 : process.sort !== undefined && process.sort !== null) return "sort";
  if (process.limit !== undefined && process.limit !== null) return "limit";
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
