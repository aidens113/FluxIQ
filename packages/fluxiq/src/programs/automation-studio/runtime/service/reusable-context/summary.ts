import type { AutomationStudioReusableLlmContextRecord } from "../../../storage/index.ts";
import type { AutomationStudioReusableLlmContextSummary } from "./contracts.ts";

// A stored reusable context row without the prompt projection a listing must
// not carry.

export function reusableLlmContextSummary(record: AutomationStudioReusableLlmContextRecord): AutomationStudioReusableLlmContextSummary {
  const { promptProjection: _promptProjection, ...summary } = record;
  return summary;
}
