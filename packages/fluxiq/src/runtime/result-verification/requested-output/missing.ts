import type { AutomationStudioResultRequestedOutput, AutomationStudioResultRequestedOutputMissing, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultHonestlyEmpty } from "./honestly-empty.ts";

/**
 * Core's finding that the run stored none of the records `owed` names, with
 * nothing in its record showing the empty answer honest (`./index.ts`); or
 * undefined where nothing is owed, records were stored, the empty answer is
 * shown honest, or the summary cannot say what was stored (a build test whose
 * would-be stores were not worked out).
 */
export function automationStudioResultRequestedOutputMissing(
  summary: AutomationStudioRunResultSummary,
  owed: AutomationStudioResultRequestedOutput | undefined
): AutomationStudioResultRequestedOutputMissing | undefined {
  if (!owed?.parts.length) return undefined;
  const rows = storedRows(summary);
  if (rows === undefined || rows > 0 || automationStudioResultHonestlyEmpty(summary)) return undefined;
  const parts = owed.parts.map((part) => ({ part: part.part, columns: [...part.columns] }));
  return { parts, said: said(parts) };
}

/**
 * The rows the run stored: a finished run's or a trial's own count; for a
 * build test, which stores nothing itself, what its Flow would store
 * (`AutomationStudioBuildTestAccount.stores`), undefined where that was not
 * worked out.
 */
function storedRows(summary: AutomationStudioRunResultSummary): number | undefined {
  if (!summary.buildTest) return summary.totalRecordCount;
  return summary.buildTest.stores?.reduce((total, store) => total + store.answer.rows, 0);
}

/** Core's sentence for the finding: the parts by id, each with the columns it declares. */
function said(parts: ReadonlyArray<{ part: string; columns: readonly string[] }>): string {
  const named = parts.map((part) => (part.columns.length ? `${part.part} (columns: ${part.columns.join(", ")})` : part.part));
  const which = named.length === 1 ? `part ${named[0]} asks` : `parts ${named.slice(0, -1).join(", ")} and ${named.at(-1)} ask`;
  return `The build's task spec declares that ${which} for records, and this run stored none. `
    + "Nothing in the run's record shows a list read to its end with nothing in it matching, so an empty answer is not shown to be the answer. "
    + "Values a step only read and handed on are not stored records: the Flow has to store the records asked for.";
}
