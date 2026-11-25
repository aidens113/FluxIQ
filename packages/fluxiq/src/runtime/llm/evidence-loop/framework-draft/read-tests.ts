// Which steps read a list, and which of those read the table the person asked for, for the framework's choice of
// the Flow's result.
//
// **Why.** The framework drafts the Flow from the calls that worked and picks the result's read itself
// (`../../flow-authoring/draft/compose/result-reads.ts`), leaving out every other read as `not_the_result`.
//
// - **A read is a step that read a list**: the host named the list it read (`reads`), or its answer kept rows. A
//   step that only observes and is of the kind a Flow is made of without reading a list -- opening a page by its
//   address, a wait, a check -- is not a read, and is in the Flow when it worked, as a press is. Taken for a read,
//   such a step was left out as not the result: a repeat that opened each row's page by its address lost its open
//   step and pressed one row (t1037 phase 2, the lending library's row-address repeat).
// - **The asked table.** A build reads many lists on its way -- a list looked at, then filtered, then the one asked
//   for -- and the read of the asked table must be the result even when another list is read after it. The loop has
//   the columns the instruction names (`namedColumns`, read once by the caller) and every read's answer; a read whose
//   rows hold every named column, by the same test the completion check applies to the result's rows
//   (`../../result-verification/asked-words/table-lacks.ts`), is a read of the asked table. Where the loop has no
//   named columns, or the domain declared no place its reads keep their rows, there is no test and the last read is
//   the result.
//
// Nothing here reads a value: only whether rows were kept and their column keys.
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { automationStudioResultAskedTableLacks } from "../../../result-verification/asked-words/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../../context-window.ts";

/** Core's own key for the rows a read kept, ahead of the domain's declared `holder.member` (`../../node-tools/rerun-checked-rows.ts`). */
const READ_ROWS_KEY = "readRows";

type Step = AutomationStudioFlowDraftStep;

/** The two tests, read off the loop's evidence as it stands when the draft is composed; the asked table's is absent where there is none to make. */
export function automationStudioLlmEvidenceReadTests(input: {
  namedColumns?: readonly string[] | undefined;
  readRowsKey?: string | undefined;
  evidence: readonly AutomationStudioLlmEvidenceEntry[];
}): { isRead: (step: Step) => boolean; isAskedTable?: (step: Step) => boolean } {
  const rowsOf = (step: Step): readonly JsonValue[] | undefined => {
    if (step.callId === undefined) return undefined;
    return keptRows(input.evidence.find((entry) => entry.callId === step.callId)?.value, input.readRowsKey);
  };
  const isRead = (step: Step): boolean => step.effect === "observe" && (step.reads !== undefined || rowsOf(step) !== undefined);
  const named = input.namedColumns;
  if (!named?.length || !input.readRowsKey) return { isRead };
  return {
    isRead,
    isAskedTable: (step) => {
      if (step.effect !== "observe") return false;
      const rows = rowsOf(step);
      if (!rows?.length) return false;
      const held = [...new Set(rows.flatMap((row) => (isObject(row) ? Object.keys(row) : [])))];
      return held.length > 0 && automationStudioResultAskedTableLacks(named, held).length === 0;
    }
  };
}

/** The rows an answer kept: Core's `readRows.rows`, else the list under the domain's declared `holder.member`. */
function keptRows(answer: JsonValue | undefined, readRowsKey: string | undefined): readonly JsonValue[] | undefined {
  if (!isObject(answer)) return undefined;
  const named = answer[READ_ROWS_KEY];
  if (isObject(named) && Array.isArray(named.rows)) return named.rows;
  const [holder, member, ...more] = readRowsKey?.split(".") ?? [];
  if (!holder || !member || more.length) return undefined;
  const held = answer[holder];
  const rows = isObject(held) ? held[member] : undefined;
  return Array.isArray(rows) ? rows : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
