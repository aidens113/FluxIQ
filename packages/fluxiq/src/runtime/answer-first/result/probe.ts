import { parseAutomationStudioTaskResult, type AutomationStudioTaskResultParseResult } from "@fluxiq/contracts/automation";

/**
 * Whether the contract takes these fields, on the smallest record it takes. The
 * contract's checks on a field are internal to it (`person-words.ts`, the id and
 * dataset patterns), and restating them here would let the two part, so the writer
 * asks the parser.
 */
export function automationStudioAnswerFirstResultProbe(fields: Record<string, unknown>): AutomationStudioTaskResultParseResult {
  return parseAutomationStudioTaskResult({ attemptId: "probe", kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [], ...fields });
}
