// What a person reads when a press of Run again starts nothing: plain words, no codes.

import type { AutomationStudioAnswerFirstRunAgainRefusedCode } from "./answer.ts";

export const AUTOMATION_STUDIO_ANSWER_FIRST_RUN_AGAIN_REFUSED_WORDS: Readonly<Record<AutomationStudioAnswerFirstRunAgainRefusedCode, string>> = {
  unknown_task: "I no longer have this task, so there is nothing to run again. Ask for it in the chat.",
  live: "This task is still going.",
  other_task_on_flow: "This task's Flow has been given something else to do since, so I can't run it again from here. Ask for it in the chat.",
  stopped_part_way: "You stopped the last run of this task part way, after it had already done something on the site. Press Carry on on it to finish it, so nothing it did is done twice.",
  unreadable: "I could not read this task just now, so nothing was started."
};
