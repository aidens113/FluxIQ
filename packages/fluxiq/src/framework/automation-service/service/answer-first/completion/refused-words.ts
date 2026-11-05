// What a refused completion says, to the model and to the person. Generic: nothing here mirrors a
// site or a task, and the only words not Core's are the check's own screened reason.
//
// **Every sentence is about what the check really reads** (`./check.ts`, `summaryOf`): the rows in
// their order, the acts on the record, the model's `answer`, the page and the witnesses. So a draft
// edit, a reworded summary and a note are not evidence, and it says so: a run was told the opposite
// (run-mw37vz9n-a77a02c2, steps 117 to 121, the draft's words on a check that never reads a draft),
// edited its draft, and completed three more times at about $0.14 each.

const NEW_EVIDENCE = "Only new evidence changes the check's answer: an act on the site that lands, a read that returns different rows or the same rows in a different order, the site showing something different, or different words in answer where the result is words. resultHolds is exactly what the check reads, so compare it with what was asked for before you complete. Editing the draft, or rewording your summary or notes, is not new evidence: the check reads none of them.";

const NOT_NEW = "The check reads what you hold, never the draft, your summary or your notes, so only new evidence changes its answer.";

const SAID: Readonly<Record<"no" | "unsure", string>> = Object.freeze({ no: "said no to", unsure: "could not confirm" });

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? "" : "s"}`;
}

export const AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS = Object.freeze({
  /** A judge's no or unsure, as the model reads it: its reason whole, then what would change it. */
  judged: (reason: string): string => `${reason} ${NEW_EVIDENCE}`,

  /** A completion over what the check last refused: what that was about, what would change it, and what repeating it leads to. */
  sameEvidence: (verdict: "no" | "unsure", reason: string): string =>
    `This completion was refused without being checked: what you hold is exactly what the check last ${SAID[verdict]}, so it would answer the same. What it said: ${reason} ${NEW_EVIDENCE} If you cannot get anything new you need not keep trying: completing again with nothing new starts a fresh round, and the time after that the person is asked whether to keep going or to stop with what you hold.`,

  /** Said when any of these comes again over one draft, in place of the loop's words for a check that reads the draft (`../../../../../runtime/llm/decision-handlers/completion.ts`). */
  sentAgain: NOT_NEW,

  /** A check that gave no answer is no refusal of what was sent: asking again is what it wants. */
  sentAgainUnjudged: "The check gave no answer, which is not a no: completing again asks it again.",

  /** A fresh round after a refused repeat, in front of its evidence: `lastCheck` beside it holds the reason. */
  freshRound: (personSaidKeepGoing: boolean): string =>
    `Your completion was refused again over the same evidence, so this round starts fresh. lastCheck says what the check said. ${NEW_EVIDENCE} Completing again with nothing new stops and asks the person whether to keep going or to stop with what you hold.${personSaidKeepGoing ? " The person was asked and said to keep going, so get something new." : ""}`,

  /** The person's question, with what is held and what the check said. No code in it: the reason is the check's screened words. */
  ask: (held: { rows: number; acts: number; answered: boolean }, reason: string | undefined): string => {
    const has = [...(held.rows ? [plural(held.rows, "row")] : []), ...(held.acts ? [`${plural(held.acts, "act")} on the site`] : []), ...(held.answered ? ["an answer in words"] : [])];
    const what = has.length ? has.join(" and ") : "nothing confirmed yet";
    return `The check keeps refusing what I have and I have found nothing new to change that, so I have stopped spending to ask. What I have: ${what}.${reason ? ` What the check said: ${reason}` : ""} Do you want me to keep going, or stop here with what I have?`;
  }
});
