// The judge's copy of the summary, with the left-out rows that name the asked
// item said beside the reads (`left-out-naming-the-item.ts`). Both kinds of
// judge are shown it, a build test's and a finished run's (`../verify.ts`), and
// the verdict holds a yes to it (`../verdict.ts`).

import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioResultLeftOutNamingTheItem } from "./left-out-naming-the-item.ts";

/** The summary with `leftOutNamingTheItem` set when there are such rows, and without it otherwise. */
export function automationStudioResultSummaryWithLeftOutNamingTheItem(
  summary: AutomationStudioRunResultSummary,
  instructions: readonly Pick<AutomationStudioFlowInstruction, "title" | "body">[]
): AutomationStudioRunResultSummary {
  const { leftOutNamingTheItem: _earlier, ...rest } = summary;
  // The request as the build read it (`read-account/unread-columns.ts` reads it the same way).
  const requestText = instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  const found = automationStudioResultLeftOutNamingTheItem(rest, requestText);
  return found.length ? { ...rest, leftOutNamingTheItem: found } : rest;
}
