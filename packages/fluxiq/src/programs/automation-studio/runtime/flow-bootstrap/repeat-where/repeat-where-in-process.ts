// A lasting act repeated over a listing that narrows its rows only in its saved
// answer (t800, P7).
//
// A `repeat over: <listing>` span becomes a For Each fed by the listing's rows
// (`../authoring/draft-routing.ts`), and it visits every row the listing's read
// kept. A listing's `recordOutput.process.where` shapes only the answer the run
// saves at its end (`../script-statements/listing-order-in-repeat.ts` says the same of sort and
// limit), so a repeat whose body makes a lasting change would act on rows the
// answer leaves out.
//
// So a listing whose process carries a `where` is refused, once, at that path,
// when a For Each it feeds runs a step declaring a lasting consequence -- any
// of Core's classes (`../../action-permissions/consequences.ts`). A repeat that
// only reads or navigates acts on nothing that lasts, a listing no repeat walks
// is not touched, and a listing without a process `where` has nothing to say.
//
// Core does not rewrite the plan: no node definition declares which of its
// parameters is the read's own condition (the registry's metadata names only
// `answersRows` and `recordProcessWrittenAt`, for sort and limit), so there is
// no domain-neutral name to move the condition to. The sentence says where the
// condition goes instead.
//
// It reads the assembled plan, as `./record-replace-in-repeat.ts` does.
import type { JsonObject } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "../script-statements/index.ts";

/** The node a `repeat over` span becomes and the input its rows arrive on (header). */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
/** The code the refusal is made under; its sentence is Core's own and quotes nothing the model or the page wrote. */
const CODE = "record_output.process_where_in_repeat";
const MESSAGE = "This listing narrows its rows with a where in its saved answer, and a repeat over it makes a lasting change on each row it visits. "
  + "A repeat visits every row the listing's read kept, and a where in the saved answer only shapes the answer saved at the end of the run, "
  + "so the repeat would act on rows the answer leaves out. "
  + "Put the condition on the listing's read so the repeat runs over kept rows only (the read's own where has the same vocabulary), and take the where out of the saved answer.";

/** Every listing a lasting repeat walks whose record output narrows only the saved answer, each refused once at its process `where`. */
export function automationStudioFlowPlanRepeatWhereInProcessIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  return input.plan.subflows.flatMap((subflow, subflowIndex) => {
    const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
    const walked = new Set<string>();
    for (const loop of subflow.nodes.filter((node) => node.definitionId === FOR_EACH_ID)) {
      if (![...automationStudioFlowPlanLoopBody(subflow, loop.key)].some((key) => lasting(byKey.get(key)))) continue;
      for (const edge of subflow.edges) {
        if (edge.target.nodeKey === loop.key && edge.target.portId === ROWS_INPUT) walked.add(edge.source.nodeKey);
      }
    }
    return subflow.nodes.flatMap((node, nodeIndex): AutomationStudioFlowBootstrapIssue[] => {
      if (!walked.has(node.key)) return [];
      const definition = input.registry.get(node.definitionId, input.resolution);
      const parameter = (definition?.parameters ?? []).find((candidate) => candidate.ui?.control === "record-output" && narrows(node.parameters?.[candidate.id]));
      if (!parameter) return [];
      return [{
        severity: "error", code: CODE, message: MESSAGE,
        path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${parameter.id}.process.where`
      }];
    });
  });
}

/** Whether a step declares a lasting consequence, any of Core's classes. */
function lasting(node: AutomationStudioFlowBootstrapNode | undefined): boolean {
  return (node?.consequences ?? []).some((written) => isAutomationStudioActionConsequence(written));
}

/** Whether a record output's process carries a where that says something. */
function narrows(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.process)) return false;
  const where = value.process.where;
  return where !== undefined && where !== null && where !== false && where !== "" && !(Array.isArray(where) && where.length === 0);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
