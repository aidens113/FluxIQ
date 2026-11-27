// How one judge's check is asked again while its replies cannot be read (t979).
//
// **Live evidence (F25).** `run-mwoznmcq-cd1d4618`: two of four Haiku judge replies (0047, 0053) came back
// `llm.provider_malformed_response` at HTTP 200: a long diagnosis, sent as JSON text inside `result_json` because the
// judge continued the decider's cached conversation and so took the decider's transport, whose double escaping collapsed
// part-way through. The check had no answer and nothing asked it again. The same happened on a Sonnet judge
// (`run-mwouuc9b`, 0060) and another Haiku judge (`run-mwovplov`, 0307).
//
// **What this keeps for one check.**
//
// 1. Every ask after an unreadable reply carries a short note of what could not be read (`./note.ts`), placed last in
//    what the judge is shown, after any cached prefix.
// 2. **A judge continuing the decider's conversation stays in it (t1065).** After an unreadable reply it is asked again
//    in its own conversation (`inConversation`, sticky for the check): the adapter answers the reply there -- a call of
//    a decider's tool gets a tool result saying no tool runs, a reply with no answer is told to give it -- and asks for
//    the verdict again, with everything the judge already read (`../../models/providers/anthropic/judge-call-answered.ts`).
//    Live run `run-mwy3btww-31d32e0d`: all 7 continuing judges' replies were unreadable, 6 of them saying yes, and each
//    check was handed to a judge on its own request that saw only the trail and could not tell. Only where the decider
//    went in the JSON-text transport does the adapter still ask on the judge's own request in its native format, the
//    F25 cure for that transport's nested JSON (`../../llm/anthropic/provider.ts`, `standalone_after_unreadable`).
// 3. Every re-ask stays on the same model (user, 2026-11-20).
// 4. **The same unreadable reply again is a loop for the judge role (t1000)**, caught and steered as every role's is
//    (`../../llm/repeat-guard/loop-detection/`): two or more in a row that came back the same way (the same `said`,
//    which names the case and, for a reply off the schema, each path and rule it missed) are an `exact_repeat`
//    finding, put in a `loop` step folder, and the next ask carries the steer (`./steer.ts`) naming the repeat, how
//    often, and the judge's decision. t994 W1 saw a judge asked 2,399 times in 90 s on one reply missing one field,
//    each re-ask the same as the last: the note said only "it did not fit", and nothing noticed the repeat.
//
// No count ends it: the purse, the run's budget and the judge's existing deadline do (user: "it NEEDS to keep retrying
// until final result achieved or budget out"). No wait is added either: a re-ask that names what to change is the fix.
// A readable reply resets the run in a row and is read exactly as a first readable reply would be.

import { automationStudioLlmLoopStepFolder, type AutomationStudioLlmLoopFinding } from "../../llm/repeat-guard/loop-detection/index.ts";
import { automationStudioResultUnreadableSteer } from "./steer.ts";

/** The tool id a judge's loop is recorded under: its harness task, as Core names it. */
const JUDGE_TOOL_ID = "loop_verification";

/** What one unreadable reply did to how the check is asked next. */
export type AutomationStudioResultUnreadableStep = "asked_again" | "in_conversation" | "steered";

/** One check's unreadable replies, and how its next ask is made. */
export type AutomationStudioResultUnreadableAsks = {
  /** One more unreadable reply, `said` being what could not be read. Answers what it changed. */
  unread(said: string): AutomationStudioResultUnreadableStep;
  /** A reply was read: the run in a row is broken, and the next ask carries no note. Staying in the conversation stays. */
  readable(): void;
  /** What could not be read of the last reply, while the last reply was unreadable. */
  readonly said: string | undefined;
  /** Unreadable replies in a row. */
  readonly inARow: number;
  /** Every unreadable reply of the check. */
  readonly total: number;
  /** A continuing judge after an unreadable reply: asked again in its own conversation, on the same model (t1065). */
  readonly inConversation: boolean;
  /** The loop the last unreadable replies make, while they came back the same way two or more times in a row. */
  readonly repeat: AutomationStudioLlmLoopFinding | undefined;
  /** The steer the next ask carries for that loop (`./steer.ts`). */
  readonly steer: string | undefined;
};

export function automationStudioResultUnreadableAsks(options: { continuesDecider: boolean }): AutomationStudioResultUnreadableAsks {
  let said: string | undefined;
  let inARow = 0;
  let total = 0;
  let inConversation = false;
  // Unreadable replies in a row that came back the same way as the one before.
  let same = 0;
  let repeat: AutomationStudioLlmLoopFinding | undefined;
  return {
    unread(clause) {
      same = inARow > 0 && clause === said ? same + 1 : 1;
      said = clause;
      inARow += 1;
      total += 1;
      repeat = same >= 2 ? { pattern: "exact_repeat", repeats: same, toolIds: [JUDGE_TOOL_ID], unchanged: [] } : undefined;
      const first = options.continuesDecider && !inConversation;
      if (options.continuesDecider) inConversation = true;
      if (repeat) {
        automationStudioLlmLoopStepFolder(total, "steer", repeat);
        return "steered";
      }
      return first ? "in_conversation" : "asked_again";
    },
    readable() {
      said = undefined;
      inARow = 0;
      same = 0;
      repeat = undefined;
    },
    get said() { return said; },
    get inARow() { return inARow; },
    get total() { return total; },
    get inConversation() { return inConversation; },
    get repeat() { return repeat; },
    get steer() { return repeat ? automationStudioResultUnreadableSteer(repeat) : undefined; }
  };
}
