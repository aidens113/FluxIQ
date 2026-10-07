// The tool the phases' own test of a Flow sends its replays through, said in
// the chat as the loop's own test is.
//
// **Why (t288 report `fix-ui.md`, R3-U-6).** A round that stopped before its
// Flow was ready is tested by the build's phases, outside the loop
// (`../../flow-bootstrap/unfinished-build/`), through the dry-run gate. Every
// call the loop's own test makes goes through the activity observer the loop
// is wrapped in (`../../activity/observer.ts`), which is what draws its
// "Testing: Click · Confirm" cards; the phases' test was handed the bare tool,
// so the second build test of a live run ran with no card at all. This gives
// that test the observer's tool: each replay is said as it starts and ends, in
// the same words, with the call's own description.
//
// Only the tool is taken from the observer. The test decides nothing, so the
// observer's decision side is never asked.

import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";

/** `executeTool`, observed for the chat as the loop's own calls are. */
export function automationStudioObservedTestTool(input: {
  executeTool: AutomationStudioLlmEvidenceLoopInput["executeTool"];
  describeCall?: AutomationStudioLlmEvidenceLoopInput["describeCall"];
}): AutomationStudioLlmEvidenceLoopInput["executeTool"] {
  return observeAutomationStudioEvidenceLoop({
    tools: [],
    decide: () => Promise.reject(new Error("A test of the Flow makes no decision.")),
    executeTool: input.executeTool,
    ...(input.describeCall ? { describeCall: input.describeCall } : {})
  }).executeTool;
}
