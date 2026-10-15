// A condition as a Flow wrote it, so one revision's is matched with another's
// (t641, `./kept-conditions.ts`, `./kept-condition-drop.ts`).
//
// Core's record names a condition by its read's node id and its number
// (`../refuted-no/record-conditions.ts`). The gate that keeps a build's trials
// finds it in the plan of the revision that ran: the step whose node id ends
// with its subflow's and its own key (`node.bootstrap.<build>.<subflow>.<step>`,
// `../../flow-bootstrap/adaptation.ts`), then the `where` list that step's read
// is written with -- the object among its parameters holding what a read is
// written with, as `../read-account/read-parameters.ts` finds it -- or, for a
// saved answer's condition, its `recordOutput.process.where`. A later
// submission writes the condition still where any step's parameters hold the
// same object under a `where` list: keys in any order, any step, any subflow,
// since step keys and the step that reads change between revisions. Nothing
// here reads a run: only plans, which the gates already hold.

/** A plan as a condition is found in: its subflows' steps, each with its key and parameters. */
export type AutomationStudioResultConditionPlan = { subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; parameters?: unknown }> }> };

/** How a saved answer's condition is named among a read's (`../refuted-no/record-conditions.ts`). */
const PROCESSING_CONDITION = "recordOutput.process.where ";
/** The members that mark an object as a read's own parameters (`../read-account/read-parameters.ts`). */
const READ_PARAMETER_KEYS = ["where", "paginate", "dedupe", "fields"];

/** The condition `condition` names, as the plan's step wrote it (header); nothing where the step or the condition cannot be found. */
export function automationStudioResultWrittenCondition(plan: AutomationStudioResultConditionPlan | undefined, condition: { name: string; nodeId?: string | undefined; number?: number | undefined }): string | undefined {
  if (!plan || condition.nodeId === undefined || condition.number === undefined || condition.number < 1) return undefined;
  const parameters = stepOf(plan, condition.nodeId)?.parameters;
  if (!isRecord(parameters)) return undefined;
  const where = condition.name.startsWith(PROCESSING_CONDITION) ? processingWhere(parameters) : readParameters(parameters)?.where;
  const written = Array.isArray(where) ? where[condition.number - 1] : undefined;
  return isRecord(written) ? canonical(written) : undefined;
}

/** Every condition any step of the plan writes under a `where` list, as `automationStudioResultWrittenCondition` gives one (header). */
export function automationStudioResultWrittenConditions(plan: AutomationStudioResultConditionPlan | undefined): Set<string> {
  const written = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "where" && Array.isArray(entry)) for (const condition of entry) if (isRecord(condition)) written.add(canonical(condition));
      visit(entry);
    }
  };
  for (const subflow of plan?.subflows ?? []) for (const node of subflow.nodes) visit(node.parameters);
  return written;
}

/** The one step whose node id names it by its subflow's and its own key, else by its own key alone; none where it is not one. */
function stepOf(plan: AutomationStudioResultConditionPlan, nodeId: string): { parameters?: unknown } | undefined {
  const steps = plan.subflows.flatMap((subflow) => subflow.nodes.map((node) => ({ subflow: subflow.key, node })));
  const named = (suffix: string): boolean => nodeId === suffix || nodeId.endsWith(`.${suffix}`);
  const bySubflow = steps.filter((step) => named(`${step.subflow}.${step.node.key}`));
  if (bySubflow.length === 1) return bySubflow[0]!.node;
  const byKey = steps.filter((step) => named(step.node.key));
  return byKey.length === 1 ? byKey[0]!.node : undefined;
}

/** The object among a step's parameters holding what a read is written with (header). */
function readParameters(parameters: Record<string, unknown>): Record<string, unknown> | undefined {
  return [parameters, ...Object.values(parameters).filter(isRecord)].find((candidate) => READ_PARAMETER_KEYS.some((key) => Object.hasOwn(candidate, key)));
}

/** A saved answer's conditions: its `recordOutput.process.where`, on the step or the object its read is written in. */
function processingWhere(parameters: Record<string, unknown>): unknown {
  for (const holder of [parameters, ...Object.values(parameters).filter(isRecord)]) {
    const output = holder.recordOutput;
    const process = isRecord(output) ? output.process : undefined;
    if (isRecord(process) && Array.isArray(process.where)) return process.where;
  }
  return undefined;
}

/** JSON with every object's keys sorted, so key order never makes two conditions differ. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
