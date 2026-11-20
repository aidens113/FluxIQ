// What a replay of the Flow's own steps brought, as the loop detector reads it (t973).
//
// `core.run_flow` runs the draft's saved steps again from a step the model names
// (`../node-tools/run/flow-part.ts`). Its answer says whether it ran through and
// passed (`passed`), where it stopped (`stoppedAt`), the rows a forward run did
// (`rows.done`) and, when a pass changed which rows the result holds, Core's note
// on it (`resultList`). Read by shape, never by words: a replay changed the result
// when it did a row or carries that note, and reached the end when it passed with
// no `to`, so it ran to the Flow's last step. The detector counts the rest across
// starting steps (`../repeat-guard/loop-detection/detector.ts`, "A replay again").

import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID } from "../node-tools/run/run-flow-tool-id.ts";
import type { AutomationStudioLlmLoopCall } from "../repeat-guard/loop-detection/index.ts";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The replay fact for a call, or nothing when the call is not a replay of the Flow's steps or was refused. */
export function automationStudioLlmEvidenceReplayFacts(toolId: string, input: JsonObject, answer: unknown, refused: boolean): Pick<AutomationStudioLlmLoopCall, "replay"> {
  if (toolId !== AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID || refused || !isObject(answer) || answer.ok === false) return {};
  const done = isObject(answer.rows) && typeof answer.rows.done === "number" ? answer.rows.done : 0;
  const changed = done > 0 || isObject(answer.resultList);
  const reachedEnd = answer.passed === true && answer.stoppedAt === undefined && input.to === undefined;
  return { replay: { changed, reachedEnd } };
}
