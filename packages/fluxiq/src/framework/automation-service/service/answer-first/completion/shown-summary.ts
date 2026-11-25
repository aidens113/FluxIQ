// What the judge is shown of a summary, as the one function the deciding digest reads it by
// (`./deciding-digest.ts`): the summary made sendable and projected exactly as the judge makes
// it (`flow-less/judge.ts`), from the same privacy declaration and evidence projector.
// Nothing of the judge's is invoked and nothing is sent. With no privacy declaration the judge
// shows nothing (it answers unsure, `flow-less/judge.ts`), so there is no view to read.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstShownSummary } from "./deciding-digest.ts";

type Projector = NonNullable<Parameters<typeof automationStudioFlowLessJudgedSummary>[2]>["projectJudgeEvidence"];

export function automationStudioAnswerFirstShownSummary(input: { deniedEvidenceKeys?: readonly string[] | undefined; judgeEvidenceVersion?: 1 | undefined; projectJudgeEvidence?: Projector }): AutomationStudioAnswerFirstShownSummary | undefined {
  const { deniedEvidenceKeys } = input;
  if (deniedEvidenceKeys === undefined) return undefined;
  return (summary) => automationStudioFlowLessJudgedSummary(summary, deniedEvidenceKeys, { ...(Object.hasOwn(input, "judgeEvidenceVersion") ? { judgeEvidenceVersion: input.judgeEvidenceVersion } : {}), projectJudgeEvidence: input.projectJudgeEvidence }).sent as unknown as JsonObject;
}
