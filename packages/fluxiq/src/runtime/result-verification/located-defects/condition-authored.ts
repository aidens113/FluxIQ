// One condition of a read as the Flow authored it, by the account's node and
// the condition's number (t785, shared since t790).
//
// What a condition tested is held structurally in one place, the step's
// authored parameters, which the summary carries per step, screened
// (`../contracts/flow-step-summary.ts`, `parameters`); Core never reads a
// condition's wording back (`./condition-equals.ts`, header). t785 read it
// there for the values an `equals` condition keeps; t790 (run
// `run-mvswewhy-e4e469d4`) reads it there too for the column any condition
// tests (`./untested-column.ts`), so both readers find the condition the same
// way: the step by node and definition, its `where` as its items only where
// the screen lost none (a lost condition would shift every number after it),
// and the condition at that number, counting from 1.
//
// **A read the screen took apart names no column.** What addresses the page is
// what tells two reads apart, and the screen takes it out of the summary's copy:
// run `run-mw0jw263-0251c104` kept rows whose Ad tag was absent, that read and the
// `title` column both read `{ kind: "text" }`, and every row with a title failed
// the condition as a row the request does not ask for. So a condition named by a
// read of its own is given no columns once the screen took anything from that
// read or from a column. A condition named by `field` says its column itself.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioStoredListItems } from "../stored-list/index.ts";
import type { AutomationStudioResultFlowStepSummary, AutomationStudioResultReadAccount } from "../contracts/index.ts";
import { automationStudioResultReadParameters } from "../read-account/index.ts";

/**
 * Condition `number` of `read`'s step as authored, with the columns the step
 * declares; `undefined` where the summary does not hold the step as authored,
 * the `where` lost an item to the screen, or that condition is not an object.
 * A condition named by a read the screen took apart comes with no columns (header).
 */
export function automationStudioResultReadAuthoredCondition(
  flowShape: readonly AutomationStudioResultFlowStepSummary[],
  read: Pick<AutomationStudioResultReadAccount, "nodeId" | "definitionId">,
  number: number
): { condition: JsonObject; fields: JsonObject | undefined } | undefined {
  const step = flowShape.find((one) => one.nodeId === read.nodeId && one.definitionId === read.definitionId);
  const authored = automationStudioResultReadParameters(step?.parameters);
  const written = automationStudioStoredListItems(authored?.where) ?? [];
  const condition = Number.isSafeInteger(number) && number >= 1 ? written[number - 1] : undefined;
  if (!isRecord(condition)) return undefined;
  const fields = isRecord(authored?.fields) ? authored.fields : undefined;
  return { condition, fields: isRecord(condition.read) && readsTakenApart(step?.parametersWithheld, number) ? undefined : fields };
}

/** Whether the screen took anything from condition `number`'s own read or from any column the step declares. */
function readsTakenApart(withheld: readonly string[] | undefined, number: number): boolean {
  const ownRead = new RegExp(`(?:^|\\.)where\\.${number - 1}\\.read(?:\\.|$)`, "u");
  return withheld?.some((path) => ownRead.test(path) || /(?:^|\.)fields\./u.test(path)) === true;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
