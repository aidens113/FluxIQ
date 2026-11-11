// What a refused completion says, to the model and to the person. Generic: nothing here mirrors a
// site or a task, and the only words not Core's are the check's own screened reason.
//
// **Every sentence is about what the check really reads** (`./check.ts`, `summaryOf`): the rows in
// their order, the acts on the record, the model's `answer`, the page, the witnesses and what looks
// found after the first lasting act. So a draft
// edit, a reworded summary and a note are not evidence, and it says so: a run was told the opposite
// (run-mw37vz9n-a77a02c2, steps 117 to 121, the draft's words on a check that never reads a draft),
// edited its draft, and completed three more times at about $0.14 each.
//
// **A look is named as the way out, and nothing invites a wait (lane B, run-mw4dsh8i-3fb9dc39).**
// The check reads what looks found after the first lasting act (`./check.ts`, `looked`). That run's
// model was told new evidence was only an act, different rows or a changed site, so a look that
// found what the check could not see read as nothing; and "you need not keep trying" told it it
// could stop. A task ends only with its result or its budget, so a refusal says where the evidence
// is got, never that the trying may end.

const NEW_EVIDENCE = "Only new evidence changes the check's answer: an act on the site that lands, a read that returns different rows or the same rows in a different order, after your acts a look at the page that shows what the check said it could not see (open that page, then read or search it there), the site showing something different, or different words in answer where the result is words. resultHolds is exactly what the check reads, so compare it with what was asked for before you complete. Editing the draft, or rewording your summary or notes, is not new evidence: the check reads none of them.";

const NOT_NEW = "The check reads what you hold, never the draft, your summary or your notes, so only new evidence changes its answer.";

const SAID: Readonly<Record<"no" | "unsure", string>> = Object.freeze({ no: "said no to", unsure: "could not confirm" });

export const AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS = Object.freeze({
  /** A judge's no or unsure, as the model reads it: its reason whole, then what would change it. */
  judged: (reason: string): string => `${reason} ${NEW_EVIDENCE}`,

  /** A request that asks for rows back, completed before any read ran (`./check.ts`, `rows_not_read`). `asked` is the person's own sentence, where Core found one. */
  rowsNotRead: (asked: string | undefined): string =>
    `The request asks for rows back${asked ? ` ("${asked}")` : ""}, and no read has run in this attempt, so this completion was not checked. Rows come only from a read of the page: words in answer are not rows, however they are laid out. Go to the page that shows the rows asked for, run the read there, and complete once it has returned them. If that read finds none, complete then: an empty read is a result the check can judge.`,

  /** A completion over what the check last refused: what that was about, what would change it, and what repeating it leads to. */
  sameEvidence: (verdict: "no" | "unsure", reason: string): string =>
    `This completion was refused without being checked: what you hold is exactly what the check last ${SAID[verdict]}, so it would answer the same. What it said: ${reason} ${NEW_EVIDENCE} So get something new before you complete again: go to where what the check could not see is shown, and look, read or act there. Completing again with nothing new starts a fresh round, and each time after that the round is stopped and the next must take a different way, while the person is asked what to do; you never wait for them.`,

  /** Said when any of these comes again over one draft, in place of the loop's words for a check that reads the draft (`../../../../../runtime/llm/decision-handlers/completion.ts`). */
  sentAgain: NOT_NEW,

  /** A check that gave no answer is no refusal of what was sent: asking again is what it wants. */
  sentAgainUnjudged: "The check gave no answer, which is not a no: completing again asks it again.",

  /** A fresh round after a refused repeat, in front of its evidence: `lastCheck` beside it holds the reason, and `personSaid` the person's answer once they have given one. */
  freshRound: (personAnswered: boolean): string =>
    `Your completion was refused again over the same evidence, so this round starts fresh. lastCheck says what the check said. ${NEW_EVIDENCE} Completing again with nothing new stops this round too, and the next must take a different way; the person is asked what to do, and you never wait for them.${personAnswered ? " The person has answered: personSaid holds their words. Follow them to get something new." : ""}`
});
