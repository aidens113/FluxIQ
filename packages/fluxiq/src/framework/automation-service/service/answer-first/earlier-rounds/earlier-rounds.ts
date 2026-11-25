// What a fresh round starts with of everything the attempt's earlier rounds did: the state, not the transcript (t1014,
// t1036 D10).
//
// **Why.** A round's evidence window is its own: when a round ends (loop detection's last rung, the completion check's
// ladder, a stall, a throw) the next one starts afresh, and it must not start empty (user, 2026-11-24: "THERE SHOULDNT BE
// ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). It used to be handed every earlier call's result
// whole but for its pages: in the long recorded runs that was 40-52% of every decision's input, mostly whole read rows
// and structure descriptions, none of which the round could act on, since a handle names a control only while its page
// stands. A fresh round is now handed what the run established and where everything else is:
// - **the reads**, one entry each: the call, how many rows, under which columns. The rows are the attempt's result's, which
//   the round's own `core.result` entry carries; the call's id names them to `core.recall_result`;
// - **every other call, as one short line** (`./reference.ts`): its number, its id, what it was on, grouped by what ran and
//   how it ended, oldest first, so the last of each group is the latest of its kind;
// - **by reference only**: the acts that landed (with the control words each pressed), the rows kept, the last check's
//   reasons and what was tried are the round's note (`core.attempt_note`, `../attempt/round-note.ts`); the draft is
//   `core.flow_draft` and the result's processing `core.result`. None is copied here.
// Nothing is dropped, only named: every earlier call stays listed. No page copy travels: the round's opening look is the
// page as it stands.
//
// **Constant for the round.** Built once, as the round starts, and shown right after its note, so every request of the
// round stays a byte prefix of the next. Screened as a judge's trail is
// (`../../../../../runtime/result-verification/run-trail/screen.ts`), and with no member under a key the domain denies,
// key and all (t1018): the loop refuses a request unsent that shows one.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmValueWithoutDeniedKeys } from "../../../../../runtime/llm/harness/index.ts";
import { automationStudioResultTrailScreened, type AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstEarlierReadRows } from "./read-rows.ts";
import { automationStudioAnswerFirstEarlierReference } from "./reference.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID } from "./tool-id.ts";

const WORDS = "What this attempt did in its earlier rounds, as state: each read (reads: its call, how many rows, which columns) and every other call as one line (calls: what ran and how it ended, with each call's number, id and what it was on, oldest first; the last in a group is the latest of its kind). "
  + "No call's result is repeated here and no page is carried: this round starts afresh from the page as it stands, and its own look shows it. "
  + "What stands is held elsewhere: the acts that landed, the rows kept, what was tried and the last check's reasons are in the round's note (core.attempt_note), the Flow so far is core.flow_draft, and the result and its processing are core.result. "
  + "Name a call's id to core.recall_result to read again what it held, and do not make a call again that a line here shows already ran, unless the page has changed. "
  + "A handle from an earlier round names a control only while its page stands, so check it on the page now before you act on it.";

const WITHHELD_WORDS = "Values under keys the domain does not show to a model are left out.";

/** The entry a fresh round is shown after its note; nothing where no call came before it. */
export function automationStudioAnswerFirstEarlierRounds(input: {
  trail: readonly AutomationStudioResultTrailStep[];
  observedStateKeys?: readonly string[] | undefined;
  /** The held member a read's rows are under (`holder.member`), where the domain does not declare it among its views. */
  readRowsKey?: string | undefined;
  deniedEvidenceKeys: readonly string[];
}): { callId: string; toolId: string; value: JsonObject } | undefined {
  if (input.trail.length === 0) return undefined;
  const observed = [...(input.observedStateKeys ?? []), ...(input.readRowsKey ? [input.readRowsKey] : [])];
  const reads: JsonObject[] = [];
  const groups = new Map<string, { did: string; outcome: string | undefined; calls: string[] }>();
  input.trail.forEach((step, index) => {
    const n = index + 1;
    const read = automationStudioAnswerFirstEarlierReadRows(step, observed);
    if (read) {
      reads.push({
        n,
        ...(step.callId === undefined ? {} : { callId: step.callId }),
        did: step.did,
        ...(step.on === undefined ? {} : { on: step.on }),
        ...(step.where === undefined ? {} : { where: step.where }),
        ...read
      });
      return;
    }
    const key = `${step.did}\n${step.outcome ?? ""}`;
    const group = groups.get(key) ?? { did: step.did, outcome: step.outcome, calls: [] };
    group.calls.push(automationStudioAnswerFirstEarlierReference(step, n));
    groups.set(key, group);
  });
  const entry: JsonObject = {
    words: WORDS,
    count: input.trail.length,
    ...(reads.length ? { reads } : {}),
    calls: [...groups.values()].map((group) => ({ did: group.did, ...(group.outcome === undefined ? {} : { outcome: group.outcome }), calls: group.calls }))
  };
  const { value: allowed, withheld } = automationStudioLlmValueWithoutDeniedKeys(entry, input.deniedEvidenceKeys);
  const screened = automationStudioResultTrailScreened(withheld > 0 ? { ...allowed, withheld: WITHHELD_WORDS } : allowed, input.deniedEvidenceKeys).value;
  if (typeof screened !== "object" || screened === null || Array.isArray(screened)) return undefined;
  return { callId: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID, toolId: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID, value: screened };
}
