// The literal values one condition of a read keeps a row for, read from what
// the Flow authored the step with (t785).
//
// **Why.** A read's account says each condition in the model's own words
// (`../read-account/condition.ts`): `club equals ["A Club", "B Club"]` is
// text, and Core never reads its own wording back. What a condition tested is
// held structurally in one place, the step's authored parameters, which the
// summary carries per step, screened (`../contracts/flow-step-summary.ts`,
// `parameters`), and which the account was itself built from
// (`../read-account/accounts.ts`). So the condition is found there, by the
// account's node and its number, never parsed out of its wording.
//
// **What counts.** One `equals` test of one column against a value or a list
// of values, with no other relation and not negated: the shape of a condition
// that keeps a row only when its cell is one of the values the Flow wrote.
// Every value must have reached the summary as written; a value the screen
// withheld means Core cannot say which values were tested, and the condition
// is not one of these.
//
// **A list as the summary carries it.** The screen writes every authored list
// as `{ count, items }`, dropping each item it withholds
// (`../../recovery/repair-context/parameter-screen.ts`): a step's `where` and an
// `equals` list both arrive so, and a list whose items are fewer than its
// count lost one. Such a list is read as its items only where none was lost --
// a lost condition would shift every number after it. A plain list, as a
// summary built by hand holds, is read as it is. Run t785's headed proof on the
// realistic feed showed the screened shape; a reader of plain lists alone found
// no condition there at all. A step the summary does not hold -- a called
// part's read, a step whose parameters were not carried -- has none. Its one
// reader is `./tested-value-only.ts`.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioStoredListItems } from "../stored-list/index.ts";
import type { AutomationStudioResultFlowStepSummary, AutomationStudioResultReadAccount } from "../contracts/index.ts";
import { automationStudioResultReadConditionColumn, automationStudioResultReadParameters } from "../read-account/index.ts";

/** Keys that name the value a condition tests, rather than testing it (`../read-account/condition.ts`). */
const NAMING_KEYS = new Set(["field", "read"]);

/**
 * The column condition `number` of `read` tests and the values it keeps a row
 * for, where that condition is one `equals` test of one column against literal
 * values the Flow wrote (header); `undefined` for any other condition, or
 * where the summary does not hold the step as authored.
 */
export function automationStudioResultReadConditionEquals(
  flowShape: readonly AutomationStudioResultFlowStepSummary[],
  read: Pick<AutomationStudioResultReadAccount, "nodeId" | "definitionId">,
  number: number
): { column: string; values: string[] } | undefined {
  const step = flowShape.find((one) => one.nodeId === read.nodeId && one.definitionId === read.definitionId);
  const authored = automationStudioResultReadParameters(step?.parameters);
  const written = automationStudioStoredListItems(authored?.where) ?? [];
  const condition = Number.isSafeInteger(number) && number >= 1 ? written[number - 1] : undefined;
  if (!isRecord(condition) || condition.not === true) return undefined;
  const relations = Object.keys(condition).filter((key) => !NAMING_KEYS.has(key) && key !== "not" && condition[key] !== null && condition[key] !== undefined);
  if (relations.length !== 1 || relations[0] !== "equals") return undefined;
  const values = literals(condition.equals);
  const column = automationStudioResultReadConditionColumn(condition, isRecord(authored?.fields) ? authored.fields : undefined);
  return values && column ? { column, values } : undefined;
}

/** A value or a list of values, each text or a number, as written; `undefined` where any is anything else, the list is empty, or the screen withheld an item of it. */
function literals(value: JsonValue | undefined): string[] | undefined {
  const each = Array.isArray(value) || isRecord(value) ? automationStudioStoredListItems(value) : [value];
  if (!each?.length) return undefined;
  const said: string[] = [];
  for (const one of each) {
    if (typeof one === "string" && one.trim()) said.push(one);
    else if (typeof one === "number" && Number.isFinite(one)) said.push(String(one));
    else return undefined;
  }
  return said;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
