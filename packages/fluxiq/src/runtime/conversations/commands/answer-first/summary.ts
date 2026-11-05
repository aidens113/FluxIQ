/**
 * What the model is told a command does in answer-first mode. The last two sentences are the whole of
 * the rule's ask at the start (t869, `runtime/answer-first/act-record/seed.ts`): the same words again
 * press nothing that landed, and what the person answers to a question back becomes part of the words
 * the command saves (`../../person-words.ts`: a question back does not close what was asked), so their
 * own words make it another task with an empty record, and nothing the model writes can.
 */
export const AUTOMATION_STUDIO_CONVERSATION_ATTEMPT_SUMMARY = "Does what the person asks on the page they have open, in one live pass, comes back with the result, and keeps the steps it took as a draft Flow. The same request again checks what it already did and reports that, and does not do it twice. Where a person asks for something done before to be done a second time, first ask them once whether they want it done again, and start only when they answer yes.";
