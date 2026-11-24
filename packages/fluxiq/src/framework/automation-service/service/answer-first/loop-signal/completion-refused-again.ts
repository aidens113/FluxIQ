// The ladder for a completion refused over the same evidence. A `complete` is no tool call, so it
// never passes the loop's own ladder: `../../../../../runtime/llm/decision-handlers/completion.ts`
// answers it through `context.unusable`, which counts no-progress and never tells the watch
// (`../../../../../runtime/llm/repeat-guard/loop-detection/watch.ts`). So a run spent about $0.14 a
// time on the same refusal with `loopsCaught` at 0, until its purse was gone (run-mw37vz9n-a77a02c2).
//
// It is a loop finding like any other, on this path only, and it acts sooner than a tool call's,
// because nothing can refuse a completion before it is paid for. It never changes the model: a task
// keeps the one it starts with (user, 2026-11-20, U1; 002650596 removed the t962 climb):
//
//   1st refused again    refused and steered: it reads what would change things, and is asked to
//                        decide how to go on (`core.loop_decision`, `../completion/refused-words.ts`)
//   2nd, and each after  the round ends, and the next is fresh from the page as it stands, steered
//                        off what was repeated (`./told-fresh-round.ts`)
//
// It never asks the person by itself and never parks: a completion refused again after that
// is stopped and steered again until the purse ends it (run-mwo3dp11-a47a032d, where an "ask the
// person" rung here came nine times while the attempt looped on one model for 34 minutes). The
// person is asked only where the model decides to ask (`ask_person`). `ask_person` stays in the
// rung's type only because the attempt's reader names it (`../attempt/round.ts`).
//
// **Counted where it happens.** `./loops-caught.ts` reads a round's rows, and a refused completion
// has a row of its own code that names no pattern, so nothing here is counted twice. It is a near
// repeat: the same completion with only its free text changed.

import type { AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE, automationStudioLlmLoopChatWords, automationStudioLlmLoopDigest, automationStudioLlmLoopStepFolder, type AutomationStudioLlmLoopAttemptRecord, type AutomationStudioLlmLoopFinding } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** Where this refusal stands: the first still goes back to the model, and the others end the round. `ask_person` is never answered (header). */
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
  record.noted(finding);
  const count = caught[pattern];
  count.refused += 1;
  if (times < AUTOMATION_STUDIO_LLM_LOOP_REFUSED_COMPLETIONS_BEFORE_CHANGE) {
    count.steered += 1;
    automationStudioLlmLoopStepFolder(iteration, "steer", finding);
    const { title, text } = automationStudioLlmLoopChatWords(finding);
    input.say(title, text);
    return "steered";
  }
  record.approachChanged();
  record.stopped(finding);
  count.changeApproach += 1;
  automationStudioLlmLoopStepFolder(iteration, "change_approach", finding);
  return "change_approach";
}
