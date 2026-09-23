// What a result check says to the person, and when.
//
// Exactly three moments, and no more. The settings view owns the configuration
// and the run view already renders `metadata.resultVerification`, so a fourth
// surface -- a training screen -- would be precisely the "complex UI for every
// single thing" the conversation exists to avoid.
//
//   1. A refutation. One automation turn on the *run*'s thread, carrying the
//      verification's own `reason` and `observation`, with the dataset attached
//      so the person can look at the rows that were judged. No ask: nothing is
//      waiting on them, and the repair entry is already open.
//   2. A check the model could not settle. `model_disagreed` and
//      `model_unconfirmed` leave the run `unverified`, and rather than spend a
//      third call on a question two calls did not settle, the person is asked.
//      `parks: false`, because the run is over and nothing waits on the answer.
//   3. A confirmed check says nothing at all. A thread that reports every
//      passing run is a thread nobody reads.
//
// The words are Core's own throughout. `verdict.ts` composes `reason` and
// `observation` from Core's counts and the verdict word precisely so the
// model's prose never reaches a run record, and a conversation turn is a run
// record that a person reads.

import type { AutomationStudioConversationAskInput } from "../conversations/index.ts";
import type { AutomationStudioResultVerificationStatus } from "../result-verification/index.ts";

/** The ask id a run's unsettled check is filed under: one per run, so re-asking the same run finds the same ask. */
export function automationStudioResultCheckAskId(runId: string): string {
  return `result-check:${runId}`;
}

/** One turn, or nothing. `attachment` names the dataset that was judged, where the run stored one. */
export type AutomationStudioResultCheckTurn = {
  text: string;
  ask: AutomationStudioConversationAskInput | null;
  attachment: { kind: string; ref: string } | null;
};

export function automationStudioResultCheckTurn(input: {
  runId: string;
  /** What the check concluded. Only `refuted` and `unverified` say anything. */
  status: AutomationStudioResultVerificationStatus;
  /** True only for a run the schedule chose and an authorization paid for. */
  checked: boolean;
  /** Core's own sentence for the verdict. */
  reason: string;
  /** Core's own bounded observation: counts, never a row's contents. */
  observation: string;
  /** The record set that was judged, where the run stored one. */
  datasetId?: string | undefined;
}): AutomationStudioResultCheckTurn | null {
  // A run nobody checked has nothing to report. Its `unverified` says only that
  // the schedule passed it over, which is not news and is on the run already.
  if (!input.checked) return null;
  const attachment = input.datasetId ? { kind: "dataset", ref: input.datasetId } : null;
  if (input.status === "refuted") {
    return { text: `${input.reason} ${input.observation}`.trim(), ask: null, attachment };
  }
  if (input.status === "unverified") {
    return {
      text: `I could not tell whether this run answered what you asked for. ${input.observation}`.trim(),
      ask: {
        askId: automationStudioResultCheckAskId(input.runId),
        kind: "choice",
        // The run is over. Nothing waits on the answer, and parking a finished
        // run on a question about it would be a dead end rather than a gate.
        parks: false,
        options: [
          { id: "answered", label: "Yes, that is what I asked for", route: null },
          { id: "did_not_answer", label: "No, that is not what I asked for", route: null }
        ]
      },
      attachment
    };
  }
  // `confirmed` and `no_result` say nothing.
  return null;
}

/** The two methods posting a result check needs. `AutomationStudioConversationWriter` satisfies it. */
export type AutomationStudioResultCheckThread = {
  say(text: string, attachment?: { kind: string; ref: string }): Promise<unknown>;
  ask(input: { text: string; ask: AutomationStudioConversationAskInput; attachment?: { kind: string; ref: string } }): Promise<unknown>;
};

/**
 * Posts what this check found, where there is anything to post.
 *
 * A refutation says its piece and expects nothing back: the repair entry is
 * already open and the person is being told, not consulted. Only a check that
 * settled nothing asks, and it asks without parking, because the run is over.
 */
export async function sayAutomationStudioResultCheck(input: {
  thread: AutomationStudioResultCheckThread;
  found: Parameters<typeof automationStudioResultCheckTurn>[0];
}): Promise<void> {
  const turn = automationStudioResultCheckTurn(input.found);
  if (!turn) return;
  if (turn.ask) await input.thread.ask({ text: turn.text, ask: turn.ask, ...(turn.attachment ? { attachment: turn.attachment } : {}) });
  else await input.thread.say(turn.text, ...(turn.attachment ? [turn.attachment] as const : [] as const));
}
