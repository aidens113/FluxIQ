/**
 * What the model is told a command does in answer-first mode. The last two sentences are the whole of
 * the rule's ask at the start (t869, `runtime/answer-first/act-record/seed.ts`): the same words again
 * press nothing that landed, and what the person answers to a question back becomes part of the words
 * the command saves (`../../person-words.ts`: a question back does not close what was asked), so their
 * own words make it another task with an empty record, and nothing the model writes can.
 *
 * **One rule, not two.** It once said both that the same request again only checks and reports, and that
 * a request to do something again is asked about first. A model read the same words typed again as the
 * second and asked, so the attempt never started and the person never got the result
 * (run-mw4907db-c3992394, t875). The same words are the first case only; the ask is for the person's own
 * words asking for a repeat.
 */
export const AUTOMATION_STUDIO_CONVERSATION_ATTEMPT_SUMMARY = "Does what the person asks on the page they have open, in one live pass, comes back with the result, and keeps the steps it took as a draft Flow. The same words again are not a request to do it twice: start it as usual, and it checks what it already did, does not do that again, and reports the result. Only when the person's own words ask for something done before to be done again, ask them once before starting whether they want it done again, and start only when they answer yes.";
