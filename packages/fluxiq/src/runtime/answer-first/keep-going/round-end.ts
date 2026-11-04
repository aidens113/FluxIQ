// How one round of the exploration ended, as the keep-going table is handed it:
// the loop's own result, or an error thrown out of it.

import type { AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop/index.ts";

export type AutomationStudioAnswerFirstRoundEnd =
  | { kind: "loop"; result: AutomationStudioLlmEvidenceLoopResult }
  | { kind: "thrown"; error: unknown };
