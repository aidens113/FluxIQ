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
//   rows the repeat acts on are the same first N in page order. A sort was then
//   still refused, its `instead` naming only the narrowing on the listing,
//   `repeat most` and that limit, until Core came to apply the listing's own
//   sort to the rows a repeat walks (t796, below).
// - `recordProcessWrittenAt: {<process key>: "<parameter path>"}` -- where on
//   the node's own parameters its author writes a process key. A sort or limit
//   written there is read as one, whether or not the domain has yet moved it
//   into the record output, and is refused at that path: at the key the model
//   wrote, never at a process key it never wrote.
//
// A listing that declares neither keeps the t741 rule and sentence unchanged.
//
// **Core orders the rows a repeat walks by the listing's own sort (t796).** The
// page-order case left "the three newest" on a page that lists featured or
// pinned rows first no way to be said, and every `extractList.sort` a live build
// wrote (`run-mvtdn37t-e1e4d0a7`, 0105, 0140, 0230) was refused under a sentence
// about `recordOutput.process`, a key it had not written. Assembly now gives each
// For Each over a page-order listing that listing's own sort as its `order`
// (`./repeat-order.ts`), which the For Each applies before its stop
// (`nodes/control-flow/for-each.ts`). So a sort written where the node declares
// its author writes one is admitted once every lasting For Each it feeds carries
// it (`./listing-repeat-sort.ts` reads it for both), and a limit beside it is
// judged as above: the same N as `repeat most`, with no where in the process,
// saves the rows the repeat acted on, the first N of one order. A sort a repeat
// is not handed is still refused, at the key the model wrote; a sort written
// only in the process is refused with an `instead` that puts the order on the
// listing. Every sentence names the key the refused value was written at.
//
// It reads the assembled plan, as `./record-replace-in-repeat.ts` does, and the
// completion check asks it beside that one
// (`../../llm/harness-options/bootstrap-completion.ts`).
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationNodeParameter, AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioListingRepeatSort } from "./listing-repeat-sort.ts";
import { automationStudioFlowPlanLoopBody } from "./loop-body.ts";

/** The node a `repeat over` span becomes, the input its rows arrive on, its `repeat most`, and the order Core hands it its rows in (header). */
const FOR_EACH_ID = "builtin.control.for-each";
const ROWS_INPUT = "items";
const STOP_AFTER = "stopAfter";
const ORDER = "order";
/** The definition metadata a listing node declares its rows' order and its process keys' authored paths under (header). */
const ANSWERS_ROWS = "answersRows";
const PAGE_ORDER = "page_order";
const WRITTEN_AT = "recordProcessWrittenAt";
/** A declared authored path: dotted parameter keys. */
const PARAMETER_PATH = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/u;
/** The code the refusal is made under; its sentences are Core's own and quote nothing the model or the page wrote, only keys the listing's node declares. */
const CODE = "record_output.process_order_in_repeat";
const INSTEAD = "Put the order on the listing step itself, `extractList.sort: [{\"field\": \"<column>\", \"order\": \"asc\", \"as\": \"date\"}]` "
  + "(order asc or desc, as number, date or text), keep only the rows to act on with `extractList.where`, "
  + "and act on the first N of that order with `repeat most: <N>` beside `repeat over:`. Then take sort and limit out of recordOutput.process.";
/** How a sort is written on a listing, in the record process's own shape (`nodes/record-process.ts`). */
const SORT_SHAPE = "`[{\"field\": \"<column>\", \"order\": \"asc\", \"as\": \"date\"}]` (order asc or desc, as number, date or text)";

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
      const at = (written: string) => `plan.subflows.${subflowIndex}.nodes.${nodeIndex}.parameters.${written}`;
      if (definition.metadata?.[ANSWERS_ROWS] !== PAGE_ORDER) {
        const written = writtenPath(parameters, parameter, writtenAt, key);
        return [{ severity: "error", code: CODE, message: saveOnlyMessage(written, key), instead: INSTEAD, path: at(written) }];
      }
      const process = processOf(parameters, parameter);
      const most = sameStop(loops);
      // The listing's own sort, which Core hands each For Each over it (header).
      const handed = automationStudioListingRepeatSort(definition, parameters);
      if (key === "sort") {
        if (handed) {
          if (!loops.every((loop) => sameValue(loop.parameters?.[ORDER], handed.keys))) {
            return [{ severity: "error", code: CODE, message: notHandedMessage(handed.path), instead: notHandedInstead(handed.path), path: at(handed.path) }];
          }
        } else if (writtenAt.sort !== undefined && authoredSort(valueAt(parameters, writtenAt.sort))) {
          // Written on the listing in a shape no key reads, so Core handed the repeat nothing.
          return [{ severity: "error", code: CODE, message: notHandedMessage(writtenAt.sort), instead: notHandedInstead(writtenAt.sort), path: at(writtenAt.sort) }];
        } else {
          const written = `${parameter.id}.process.sort`;
          return [{ severity: "error", code: CODE, message: processSortMessage(written), instead: processSortInstead(parameters, parameter, writtenAt, most), path: at(written) }];
        }
      }
      if (!present(process?.limit) && !present(valueAt(parameters, writtenAt.limit))) return [];
      const limit = present(process?.limit) ? wholeNumber(process?.limit) : wholeNumber(valueAt(parameters, writtenAt.limit));
      // Saved rows = acted rows: the same first N of one order, with nothing dropping either.
      if (most !== undefined && limit === most && process?.where === undefined) return [];
      const written = writtenPath(parameters, parameter, writtenAt, "limit");
      return [{ severity: "error", code: CODE, message: limitMessage(written), instead: pageOrderInstead(parameters, parameter, writtenAt, most, handed?.path), path: at(written) }];
    });
  });
}

/** The t741 sentence, naming the key the refused value was written at. */
function saveOnlyMessage(written: string, key: OrderingKey): string {
  return `This listing ${key === "sort" ? "sorts" : "limits"} its rows in \`${written}\`, and a repeat over it makes a lasting change on each row it visits. `
    + `A repeat visits the rows in the listing's own order, every row the listing kept: \`${written}\` only shapes the answer saved at the end of the run, `
    + "so the repeat would act on the rows in the order the page shows them, not in the order or the number it asks for.";
}

/** A page-order listing's own sort that a lasting repeat over it was not handed. */
function notHandedMessage(written: string): string {
  return `This listing sorts its rows in \`${written}\`, and a repeat over it that makes a lasting change on each row it visits is not handed its rows in that order. `
    + "This listing's node hands its rows on in the order the page shows them, so the repeat would act on them in page order.";
}

function notHandedInstead(written: string): string {
  return `Repeat over the listing with \`repeat over:\` naming its step, and \`repeat most: <N>\` for the first N: Core then hands the repeat its rows in the order \`${written}\` asks for, and takes the first N of that order.`;
}

/** A page-order listing sorted only in its saved answer. */
function processSortMessage(written: string): string {
  return `This listing sorts its rows only in \`${written}\`, which shapes the answer saved at the end of the run, and a repeat over it makes a lasting change on each row it visits. `
    + "This listing's node hands its rows on in the order the page shows them, so the repeat would act on them in page order, not in that sort's.";
}

/** Where the order goes instead: on the listing, where the node declares its author writes a sort, when it declares one. */
function processSortInstead(parameters: JsonObject, parameter: AutomationNodeParameter, writtenAt: WrittenAt, most: number | undefined): string {
  const take = ` Take \`${parameter.id}.process.sort\` out.`;
  if (writtenAt.sort === undefined) return pageOrderInstead(parameters, parameter, writtenAt, most, undefined) + take;
  const n = most === undefined ? "<N>" : String(most);
  return `Put the order on the listing step, \`${writtenAt.sort}\`, written ${SORT_SHAPE}: Core hands a repeat over the listing its rows in that order. `
    + `Act on the first ${n} of them with \`repeat most: ${n}\` beside \`repeat over:\`.${take}`;
}

/** A page-order listing's saved answer cut to a number that is not the repeat's own, or beside a where. */
function limitMessage(written: string): string {
  return `This listing limits the rows it saves in \`${written}\`, and a repeat over it makes a lasting change on each row it visits. `
    + `\`${written}\` only shapes the answer saved at the end of the run, so unless it is the repeat's own \`repeat most\`, with no where in the saved answer, the rows it saves are not the rows the repeat acted on.`;
}

/**
 * The `instead` for a limit on a listing whose node hands its rows on in page
 * order: the narrowing on the listing, `repeat most`, and a limit of the same N
 * written where this listing already writes its limit. The order it names is
 * the listing's own sort when Core hands the repeat one (header), else the
 * page's.
 */
function pageOrderInstead(parameters: JsonObject, parameter: AutomationNodeParameter, writtenAt: WrittenAt, most: number | undefined, sorted: string | undefined): string {
  const n = most === undefined ? "<N>" : String(most);
  const process = processOf(parameters, parameter);
  const limitAt = writtenAt.limit !== undefined && present(valueAt(parameters, writtenAt.limit))
    ? `\`${writtenAt.limit}: ${n}\``
    : `\`"limit": ${n}\` in \`${parameter.id}.process\``;
  return `Core hands a repeat over this listing its rows ${sorted === undefined ? "in the order the page shows them" : `in the order \`${sorted}\` asks for`}. `
    + "Keep only the rows to act on with `extractList.where`, "
    + `act on the first ${n} of them with \`repeat most: ${n}\` beside \`repeat over:\`, `
    + `and, to save only the rows the repeat acts on, write ${limitAt} with that same number.`
    + (process?.where !== undefined ? ` Take \`${parameter.id}.process.where\` out.` : "");
}

/** Whether two JSON values are the same value: the order Core wrote is a copy of the listing's sort. */
function sameValue(left: JsonValue | undefined, right: JsonValue): boolean {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
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
