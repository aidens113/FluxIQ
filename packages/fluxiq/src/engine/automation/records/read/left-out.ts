// What a read's own conditions left out, as its answer said it, carried on the record batch beside the rows it
// kept (`AutomationStudioRecordBatch.leftOut`) and never stored with them.
//
// **Why (run-mwaudvnh-c208d32c).** A site listed one product twice, once as an ad and once not. A saved Flow's
// replay kept every non-ad card and left the ad cards out, which was right, and the judge refused it twice
// (judges 0131 and 0182): it was shown the kept rows by name and the ad cards in the end view, and nothing said
// those ad cards were the ones the read had left out. A read the model made carries that account to the judge
// (`SVC/answer-first/rows/read-evidence.ts`); a saved Flow's own run, whose rows reach the result only as record
// batches, carried none. This is the one point every dispatch of a Flow's read reaches, so the account rides the
// batch from here, as the page the read read does (`./location.ts`).
//
// **What is carried, as said.** The answer's `extraction` member, the read's own account of itself, where it
// holds the rows its conditions turned down (`rejectedSamples`), found on the objects the rows' path runs through
// (`./holders.ts`); and the `parameters` the read was dispatched with, which hold the conditions the account's
// lists are aligned with and the columns they test. Nothing is parsed here: the framework reads the account by the
// parser it already reads a run's reads by. No such member is no account, and the batch then carries none.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../contracts.ts";
import { automationStudioRecordReadHolders } from "./holders.ts";

/** The member of a read's answer holding its own account, and the member of that account holding the rows its conditions turned down. */
const ACCOUNT_KEY = "extraction";
const LEFT_OUT_ROWS_KEY = "rejectedSamples";

export function automationStudioRecordReadLeftOut(payload: JsonValue | undefined, answer: JsonValue | undefined, recordsPath: readonly string[]): AutomationStudioRecordBatch["leftOut"] {
  const extraction = automationStudioRecordReadHolders(answer, recordsPath).map((holder) => holder[ACCOUNT_KEY]).find((account): account is JsonObject => isRecord(account) && Array.isArray(account[LEFT_OUT_ROWS_KEY]));
  if (!extraction) return undefined;
  const parameters = isRecord(payload) && isRecord(payload.parameters) ? payload.parameters : undefined;
  return { extraction, ...(parameters ? { parameters } : {}) };
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
