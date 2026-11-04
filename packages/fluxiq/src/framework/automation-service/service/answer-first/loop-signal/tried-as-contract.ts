// t859's attempt record, as the contract's `AutomationStudioTriedRecord`, which is what the attempt
// row carries (`@fluxiq/contracts/automation`, `tried-record.ts`, which says this side states the
// assignment when the two meet). The members are the same, `same_act` included.

import type { AutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { AutomationStudioLlmLoopAttemptRecordData } from "../../../../../runtime/llm/repeat-guard/index.ts";
import { automationStudioAnswerFirstLoopPattern } from "./loops-caught.ts";

export function automationStudioAnswerFirstTriedAsContract(data: AutomationStudioLlmLoopAttemptRecordData): AutomationStudioTriedRecord {
  return {
    version: data.version,
    approaches: data.approaches,
    tried: data.tried.map(({ pattern, changes, ...entry }) => ({
      ...entry,
      ...(pattern ? { pattern: automationStudioAnswerFirstLoopPattern(pattern) } : {}),
      ...(changes ? { changes: changes.map((change) => ({ ...change })) } : {})
    }))
  } satisfies AutomationStudioTriedRecord;
}
