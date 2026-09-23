// A person's answer to one ask.
//
// It is the conversation's answer, not a second one: what the endpoint writes
// into the thread is exactly what settles the parked run, so an answer cannot
// mean one thing to the store and another to the runtime.
//
// `askId` is the whole of the addressing. It is the key the ask was opened
// under and the key the run is parked under, so an answer either names the ask
// the run is waiting on or is refused. An ask is answered once; a second
// answer is refused rather than replaying the run.

export type { AutomationStudioConversationAnswer as AutomationStudioAskAnswer } from "../conversations/index.ts";
