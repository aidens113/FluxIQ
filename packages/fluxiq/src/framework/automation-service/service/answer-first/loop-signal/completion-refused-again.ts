// The ladder for a completion refused over the same evidence. A `complete` is no tool call, so it
// never passes the loop's own ladder: `../../../../../runtime/llm/decision-handlers/completion.ts`
// answers it through `context.unusable`, which counts no-progress and never tells the watch
// (`../../../../../runtime/llm/repeat-guard/loop-detection/watch.ts`). So a run spent about $0.14 a
// time on the same refusal with `loopsCaught` at 0, until its purse was gone (run-mw37vz9n-a77a02c2).
//
// It is a loop finding like any other, on this path only, and it climbs faster than a tool call's,
// because nothing can refuse a completion before it is paid for:
//
//   1st refused again   refused and steered: it reads what would change things
//   2nd                 the round ends, and the next is fresh from the page as it stands
//   3rd, and each after it stops spending and asks the person
//
// A second one goes straight to the person where fresh approaches have already been used up, as
// the watch's signal does. Reaching the person is a wait and not an ending, and nobody to ask goes
// on as `../attempt/stuck-ask.ts` says, so this adds no way for a task to end.
//
// **Counted where it happens.** `./loops-caught.ts` reads a round's rows, and a refused completion
// has a row of its own code that names no pattern, so nothing here is counted twice. It is a near
// repeat: the same completion with only its free text changed.

import type { AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING, AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_ASKING, AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE, automationStudioLlmLoopChatWords, automationStudioLlmLoopDigest, automationStudioLlmLoopStepFolder, type AutomationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopFinding } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** Where this refusal stands on the ladder: the first still goes back to the model, and the others end the round. */
export type AutomationStudioAnswerFirstRefusedAgainRung = "steered" | "change_approach" | "ask_person";

export function automationStudioAnswerFirstCompletionRefusedAgain(input: {
  /** How many in a row now (`refusedAgain`). */
  times: number;
  /** The digest of the evidence refused: content-free, so it may go on the attempt's record. */
  evidence: string;
  iteration: number;
  record: AutomationStudioLlmLoopAttemptRecord;
  caught: AutomationStudioTaskAttemptLoopsCaught;
  say(title: string, text: string): void;
}): AutomationStudioAnswerFirstRefusedAgainRung {
  const { times, record, caught, iteration } = input;
  const toolId = AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID;
  const pattern = "near_repeat";
  // The judged completion it repeats is the first of them.
  const finding: AutomationStudioLlmLoopFinding = { pattern, repeats: times + 1, toolIds: [toolId], unchanged: ["rows", "acts"] };
  const key = automationStudioLlmLoopDigest(["complete", input.evidence]);
  record.tried({ kind: "call", key, toolId, outcome: "failed" });
  record.caught(key, pattern);
  const count = caught[pattern];
  count.refused += 1;
  if (times < AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE) {
    count.steered += 1;
    automationStudioLlmLoopStepFolder(iteration, "steer", finding);
    const { title, text } = automationStudioLlmLoopChatWords(finding);
    input.say(title, text);
    return "steered";
  }
  if (times < AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_ASKING && record.approaches < AUTOMATION_STUDIO_LLM_LOOP_APPROACHES_BEFORE_ASKING) {
    record.approachChanged();
    count.changeApproach += 1;
    automationStudioLlmLoopStepFolder(iteration, "change_approach", finding);
    return "change_approach";
  }
  count.askPerson += 1;
  automationStudioLlmLoopStepFolder(iteration, "ask_person", finding);
  return "ask_person";
}
