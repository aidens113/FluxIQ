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
// three in page order.
//
// So a listing whose process carries `sort` or `limit` is refused, once, at
// that process key, when a For Each it feeds runs a step declaring a lasting
// consequence -- any of Core's classes
// (`../../action-permissions/consequences.ts`). A repeat that only reads or
// navigates acts on nothing that lasts, and its listing may shape its saved
// answer however it likes; a listing no repeat walks is not touched either.
//
// **What the listing's node can do is the node's to say (t751).** The refusal's
// `instead` once told every builder to put the order on the listing itself,
// `extractList.sort`. The web domain cannot keep that: its read hands its rows
// on in page order, and its `sort` and `maxItems` become the record output's
// `process` (downstream `output-nodes/extract-list/one-page-read.ts`), so that
// answer was refused in turn, and so was the one coherent shape left -- a limit
// equal to `repeat most` with no sort. Photo rerun 5 (`run-mvhibis0-b536958b`)
// spent its last sixteen steps between the two. A listing node now declares in
// its definition's metadata:
//
// - `answersRows: "page_order"` -- its rows go on in the order the page shows
//   them, and nothing it is given reorders them. Then a `limit` of N with no
//   sort and no where in the process is admitted when every lasting For Each it
//   feeds stops after the same N (`repeat most: N`): the rows it saves and the
//   rows the repeat acts on are the same first N in page order. A sort is still
//   refused, and the `instead` names only the narrowing on the listing, `repeat
//   most` and that limit -- never a sort, which this node cannot apply to the
//   rows a repeat walks.
// - `recordProcessWrittenAt: {<process key>: "<parameter path>"}` -- where on
//   the node's own parameters its author writes a process key. A sort or limit
//   written there is read as one, whether or not the domain has yet moved it
//   into the record output, and is refused at that path: at the key the model
//   wrote, never at a process key it never wrote.
//
// A listing that declares neither keeps the t741 rule and sentence unchanged.
//
// It reads the assembled plan, as `./record-replace-in-repeat.ts` does, and the
// completion check asks it beside that one
// (`../../llm/harness-options/bootstrap-completion.ts`).
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowPlanLoopBody } from "./loop-body.ts";

/** The node a `repeat over` span becomes, the input its rows arrive on, and its `repeat most` (header). */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
const STOP_AFTER = "stopAfter";
/** The definition metadata a listing node declares its rows' order and its process keys' authored paths under (header). */
const ANSWERS_ROWS = "answersRows";
const PAGE_ORDER = "page_order";
const WRITTEN_AT = "recordProcessWrittenAt";
/** A declared authored path: dotted parameter keys. */
const PARAMETER_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/u;
/** The code the refusal is made under; its sentences are Core's own and quote nothing the model or the page wrote. */
const CODE = "record_output.process_order_in_repeat";
const MESSAGE = "This listing sorts or limits its rows in recordOutput.process, and a repeat over it makes a lasting change on each row it visits. "
  + "A repeat visits the rows in the listing's own order, every row the listing kept: recordOutput.process only shapes the answer saved at the end of the run, "
  + "so the repeat would act on the rows in the order the page shows them, not in the order or the number the process asks for.";
const INSTEAD = "Put the order on the listing step itself, `extractList.sort: [{\"field\": \"<column>\", \"order\": \"asc\", \"as\": \"date\"}]` "
  + "(order asc or desc, as number, date or text), keep only the rows to act on with `extractList.where`, "
  + "and act on the first N of that order with `repeat most: <N>` beside `repeat over:`. Then take sort and limit out of recordOutput.process.";

type OrderingKey = "sort" | "limit";
type WrittenAt = Partial<Record<OrderingKey, string>>;

/** Every listing a lasting repeat walks whose record output sorts or limits only the saved answer, each refused once at the key it was written at. */
export function automationStudioFlowPlanListingOrderInRepeatIssues(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): AutomationStudioFlowBootstrapIssue[] {
  return input.plan.subflows.flatMap((subflow, subflowIndex) => {
    const byKey = new Map(subflow.nodes.map((node) => [node.key, node]));
    // The listings whose rows a For Each with a lasting act in its body walks, each with those For Eaches.
    const walked = new Map<string, AutomationStudioFlowBootstrapNode[]>();
    for (const loop of subflow.nodes.filter((node) => node.definitionId === FOR_EACH_ID)) {
      const body = automationStudioFlowPlanLoopBody(subflow, loop.key);
      if (![...body].some((key) => lasting(byKey.get(key)))) continue;
      for (const edge of subflow.edges) {
        if (edge.target.nodeKey !== loop.key || edge.target.portId !== ROWS_INPUT) continue;
        walked.set(edge.source.nodeKey, [...(walked.get(edge.source.nodeKey) ?? []), loop]);
      }
    }
    return subflow.nodes.flatMap((node, nodeIndex): AutomationStudioFlowBootstrapIssue[] => {
      const loops = walked.get(node.key);
      if (!loops) return [];
      const definition = input.registry.get(node.definitionId, input.resolution);
      if (!definition) return [];
      const parameters = node.parameters ?? {};
      const writtenAt = declaredWrittenAt(definition);
      const parameter = definition.parameters.find((candidate) => candidate.ui?.control === "record-output" && orderingKey(parameters, candidate, writtenAt));
      if (!parameter) return [];
      const key = orderingKey(parameters, parameter, writtenAt)!;
      const path = `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${writtenPath(parameters, parameter, writtenAt, key)}`;
      if (definition.metadata?.[ANSWERS_ROWS] !== PAGE_ORDER) return [{ severity: "error", code: CODE, message: MESSAGE, instead: INSTEAD, path }];
      const process = processOf(parameters, parameter);
      const most = sameStop(loops);
      const limit = present(process?.limit) ? wholeNumber(process?.limit) : wholeNumber(valueAt(parameters, writtenAt.limit));
      // Saved rows = acted rows: the same first N in page order, with nothing reordering or dropping either.
      if (key === "limit" && most !== undefined && limit === most && process?.where === undefined) return [];
      return [{ severity: "error", code: CODE, message: MESSAGE, instead: pageOrderInstead(parameters, parameter, writtenAt, most), path }];
    });
  });
}

/**
 * The `instead` for a listing whose node hands its rows on in page order: the
 * narrowing on the listing, `repeat most`, and a limit of the same N written
 * where this listing already writes its limit -- never a sort (header).
 */
function pageOrderInstead(parameters: JsonObject, parameter: AutomationNodeParameter, writtenAt: WrittenAt, most: number | undefined): string {
  const n = most === undefined ? "<N>" : String(most);
  const process = processOf(parameters, parameter);
  const limitAt = writtenAt.limit !== undefined && present(valueAt(parameters, writtenAt.limit))
    ? `\`${writtenAt.limit}: ${n}\``
    : `\`"limit": ${n}\` in \`${parameter.id}.process\``;
  // A sort is named where it was written: on the listing when its author wrote it there, which is
  // then the sort the process carries (the read's own wins over the record output's), else in the process.
  const out: string[] = [];
  if (processSort(process?.sort) || authoredSort(valueAt(parameters, writtenAt.sort))) out.push(`\`${writtenPath(parameters, parameter, writtenAt, "sort")}\``);
  if (process?.where !== undefined) out.push(`\`${parameter.id}.process.where\``);
  return "This listing's node hands its rows on in the order the page shows them, and nothing reorders the rows a repeat over it visits. "
    + "Keep only the rows to act on with `extractList.where`, "
    + `act on the first ${n} of them with \`repeat most: ${n}\` beside \`repeat over:\`, `
    + `and, to save only the rows the repeat acts on, write ${limitAt} with that same number.`
    + (out.length ? ` Take ${out.join(" and ")} out.` : "");
}

/** Whether a step declares a lasting consequence, any of Core's classes. */
function lasting(node: AutomationStudioFlowBootstrapNode | undefined): boolean {
  return (node?.consequences ?? []).some((written) => isAutomationStudioActionConsequence(written));
}

/** The key a listing orders or narrows its saved rows by, in its process or where its node says its author writes it, `sort` before `limit`, or none. */
function orderingKey(parameters: JsonObject, parameter: AutomationNodeParameter, writtenAt: WrittenAt): OrderingKey | undefined {
  const process = processOf(parameters, parameter);
  if (processSort(process?.sort) || authoredSort(valueAt(parameters, writtenAt.sort))) return "sort";
  if (present(process?.limit) || present(valueAt(parameters, writtenAt.limit))) return "limit";
  return undefined;
}

/** Where a refused key was written: the node's own authored path when it holds a value there, else the process key (header). */
function writtenPath(parameters: JsonObject, parameter: AutomationNodeParameter, writtenAt: WrittenAt, key: OrderingKey): string {
  const authored = writtenAt[key];
  const held = valueAt(parameters, authored);
  if (authored !== undefined && (key === "sort" ? authoredSort(held) : present(held))) return authored;
  return `${parameter.id}.process.${key}`;
}

/** The process keys a node declares its author writes on its own parameters, as dotted parameter paths. */
function declaredWrittenAt(definition: AutomationStudioNodeDefinition): WrittenAt {
  const declared = definition.metadata?.[WRITTEN_AT];
  if (!isObject(declared)) return {};
  const out: WrittenAt = {};
  for (const key of ["sort", "limit"] as const) {
    const path = declared[key];
    if (typeof path === "string" && PARAMETER_PATH.test(path)) out[key] = path;
  }
  return out;
}

/** The one `repeat most` every lasting For Each over this listing stops after, or none when any walks every row or they differ. */
function sameStop(loops: readonly AutomationStudioFlowBootstrapNode[]): number | undefined {
  const stops = loops.map((loop) => wholeNumber(loop.parameters?.[STOP_AFTER]));
  const first = stops[0];
  return first !== undefined && stops.every((stop) => stop === first) ? first : undefined;
}

function processOf(parameters: JsonObject, parameter: AutomationNodeParameter): JsonObject | undefined {
  const output = parameters[parameter.id];
  return isObject(output) && isObject(output.process) ? output.process : undefined;
}

function valueAt(root: JsonObject, path: string | undefined): JsonValue | undefined {
  if (path === undefined) return undefined;
  let at: JsonValue | undefined = root;
  for (const segment of path.split(".")) at = isObject(at) ? at[segment] : undefined;
  return at;
}

/** A whole number, written as a number or its digits, or none. */
function wholeNumber(value: JsonValue | undefined): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(number) ? number : undefined;
}

/** A process sort as t741 read it: any non-empty list, or any other value written. */
function processSort(value: JsonValue | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : present(value);
}

/** A sort written on the node's own parameters: an author's off values (`[]`, `false`, `""`) order nothing. */
function authoredSort(value: JsonValue | undefined): boolean {
  return Array.isArray(value) ? value.length > 0 : present(value) && value !== false && value !== "";
}

function present(value: JsonValue | undefined): boolean {
  return value !== undefined && value !== null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
