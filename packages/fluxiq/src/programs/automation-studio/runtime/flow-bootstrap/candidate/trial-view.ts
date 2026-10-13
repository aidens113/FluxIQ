// After a trial, the model's next decision sees the page the trial left (t477).
//
// A trial resets the site and replays the Flow with no model attached, so it
// leaves the target somewhere the model has not looked. Lane C round 10
// (`run-mv5uu9g1-9d80deea`, 0024-0044): the trial left the browser on a
// filtered results page, the trial's answer carried no page, candidate mode
// offers no plain look, and the only handle the model held was from the
// unfiltered page before it. It sent that handle four times and was refused
// each time for a page that had moved.
//
// So a trial that ran, or a reset that moved the target, is followed by one
// look where the target now stands -- the domain's own look, the one its tool
// declares as `initialObservation.input`, as a person-needed check takes one
// (`../../parking/person-needed-tool-calls.ts`) -- and its answer goes on the
// trial's answer under `pageAfterTrial`. It is a look the domain shows like any
// other, so the handles in it are the ones a later call binds. A look that
// fails costs the trial nothing: the answer then says to look again.
//
// The look is a library call, so the first one describes the domain's look node
// and names it under `describedNodes` on its result (`../../llm/node-tools/
// describing-failures.ts`). The request shows a definition only where that key
// is at the top of a window entry (`../../llm/deepseek/request-body.ts`); nested
// under `pageAfterTrial` it was not found there, so the definition went into
// the request's head instead, in front of every cached entry -- lane C round 11
// (`run-mv5yaapy-8c34bf34`, 0029) missed 51,218 of 55,058 input tokens on it
// (t480). The key is lifted onto the trial's answer, which is the entry the
// look's page arrives in, so the definition is appended with it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { AUTOMATION_STUDIO_LLM_DESCRIBED_NODES_KEY as DESCRIBED } from "../../llm/node-tools/index.ts";

/** What the model is told beside the page. */
const VIEW_NOTE = "pageAfterTrial is the page as this trial left it, with the handles to use now. A handle from a view before this trial may name a page that is no longer there.";

/** What the model is told when that page could not be looked at. */
const NO_VIEW_NOTE = "The page could not be looked at after this trial, and it may have moved: look at it again before using a handle from a view before this trial.";

/** The trial's answer, with the page it left when it ran or moved the target; any other answer as it was. */
export async function automationStudioCandidateTrialView(input: {
  answer: AutomationStudioLlmEvidenceToolExecutionResult;
  tools: readonly AutomationStudioLlmEvidenceTool[];
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  callId: string;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { answer } = input;
  const look = input.tools.find((tool) => tool.initialObservation);
  if (!answer.effectApplied || !look || !isJsonObject(answer.evidence)) return answer;
  let page: JsonValue | undefined;
  try {
    const ran = await input.executeTool({ callId: `${input.callId}.page`, toolId: look.toolId, value: structuredClone(look.initialObservation!.input), ...(input.signal ? { signal: input.signal } : {}) });
    page = isExecution(ran) ? ran.evidence : ran;
  } catch (error) {
    // The build stopping is not a look that failed.
    if (input.signal?.aborted) throw error;
    page = undefined;
  }
  const seen = page !== undefined && !(isJsonObject(page) && page.ok === false);
  // Lifted whether or not the page is shown: a refused look that described its
  // node still has to show the definition somewhere other than the head.
  const { page: shown, described } = withoutDescribed(page);
  const already = describedOf(answer.evidence[DESCRIBED]);
  const named = [...already, ...described.filter((id) => !already.includes(id))];
  const evidence: JsonObject = {
    ...answer.evidence,
    ...(named.length ? { [DESCRIBED]: named } : {}),
    ...(seen ? { pageAfterTrial: shown! } : {}),
    pageAfterTrialNote: seen ? VIEW_NOTE : NO_VIEW_NOTE
  };
  return { ...answer, evidence };
}

/** The look's page without the nodes it newly described, and those nodes' ids. */
function withoutDescribed(page: JsonValue | undefined): { page: JsonValue | undefined; described: JsonValue[] } {
  if (!isJsonObject(page) || !(DESCRIBED in page)) return { page, described: [] };
  const { [DESCRIBED]: described, ...rest } = page;
  return { page: rest, described: describedOf(described) };
}

function describedOf(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function isExecution(value: unknown): value is AutomationStudioLlmEvidenceToolExecutionResult {
  return isJsonObject(value) && value.kind === "llm_evidence_tool_execution";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
