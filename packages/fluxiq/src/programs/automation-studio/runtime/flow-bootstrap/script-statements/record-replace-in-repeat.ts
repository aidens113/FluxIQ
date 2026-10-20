// A record output that replaces its rows on a step a loop runs again (t498).
//
// `writeMode: replace` clears every row the run already saved to that dataset
// before it saves its own: the run dataset store deletes the run's rows on each
// replace batch (`../../../storage/project/run-dataset-store.ts`, `appendBatch`),
// and a build's test counts it the same way
// (`../../result-verification/build-test/stores.ts`, `collect`). A step a loop
// runs once per pass writes once per pass, so each pass deletes what the passes
// before it saved and only the last pass's rows are left. Live run
// `run-mv6ff44s-01def7f6` read a listing page by page with `writeMode: replace`
// inside a `repeat while` span: it kept 17 rows over five pages, the last page
// kept none, and the trial stored 0.
//
// So a step inside a loop whose record output says `replace` is refused, at
// that step, with what each pass would do and what to write instead. A step is
// inside a loop when it stands on a cycle through one of Core's loop nodes --
// the Repeat a `repeat while` span becomes, or the For Each a `repeat over`
// span becomes (`../authoring/draft-routing.ts`). A cycle through neither, such
// as a recovery's way back, is not a loop a person wrote, and is left alone.
//
// It reads the assembled plan, not the script, so a JSON plan and a drafted one
// are held to it too: the completion check asks it once registry validation has
// passed (`../../llm/harness-options/bootstrap-completion.ts`). It sits here
// beside the other check that runs on a built plan (`./way-out-steps.ts`).
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan, AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "./loop-body.ts";

/** The nodes a written repeat becomes, whose cycles are loops (header). */
const LOOP_NODE_IDS: ReadonlySet<string> = new Set(["builtin.control.repeat", "builtin.control.for-each"]);
/** The code the refusal is made under; its sentence is Core's own and quotes nothing the model or the page wrote. */
const CODE = "record_output.replace_in_repeat";
const MESSAGE = "This step saves its rows with writeMode replace, and it is inside a repeat, so it runs once per pass. "
  + "Replace clears every row this run already saved before saving its own, so each pass would overwrite the rows the passes before it saved and only the last pass's rows would be kept. "
  + "Write writeMode: append (the default, also when writeMode is left out) so each pass adds its rows.";

/** Every step inside a loop whose record output replaces the run's rows, each refused at its record output's `writeMode`. */
export function automationStudioFlowPlanRecordReplaceInRepeatIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  return input.plan.subflows.flatMap((subflow, subflowIndex) => {
    const looped = loopMembers(subflow);
    if (!looped.size) return [];
    return subflow.nodes.flatMap((node, nodeIndex) => {
      if (!looped.has(node.key)) return [];
      const definition = input.registry.get(node.definitionId, input.resolution);
      return (definition?.parameters ?? [])
        .filter((parameter) => parameter.ui?.control === "record-output" && replaces(node.parameters?.[parameter.id]))
        .map((parameter): AutomationStudioFlowBootstrapIssue => ({
          severity: "error", code: CODE, message: MESSAGE,
          path: `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${parameter.id}.writeMode`
        }));
    });
  });
}

/** The keys of the nodes on a cycle through one of the Subflow's loop nodes, the loop nodes aside. */
function loopMembers(subflow: AutomationStudioFlowBootstrapSubflow): Set<string> {
  const members = new Set<string>();
  for (const loop of subflow.nodes.filter((node) => LOOP_NODE_IDS.has(node.definitionId))) {
    for (const key of automationStudioFlowPlanLoopBody(subflow, loop.key)) members.add(key);
  }
  return members;
}

/** Whether a record output says it replaces the run's rows. */
function replaces(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as JsonObject).writeMode === "replace";
}
