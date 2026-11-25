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

const NEW_EVIDENCE = "Only new evidence changes the check's answer: an act on the site that lands, a read that returns different rows or the same rows in a different order, the result's processing declared anew so that it keeps other rows or another order, after your acts a look at the page that shows what the check said it could not see (open that page, then read or search it there), the site showing something different, or different words in answer where the result is words. resultHolds is exactly what the check reads, and its result says which draft step the rows are from and which reads outside the draft are not in it, so compare it with what was asked for before you complete. Editing the draft, or rewording your summary or notes, is not new evidence: the check reads none of them.";

// **What a no found wrong is where to go next (t1011).** Run `run-mwug2xjw-41f62603` was told a no in
// the check's prose alone, and went back to a look it had already made. A no that lists its defects
// (`./check.ts`, `defects`, `checkedRows`) is told what each kind is fixed by, so the next step works
// on what the check named and not on what was already tried.
const FOUND = "defects lists what the check found wrong, in its own words: each names a row (or every row), the column, and the request's own words it fails; checkedRows, where given, is Core's own check of the rows it named against what you hold. Compare each with resultHolds, then work on what is still wrong there, not on anything you have already tried: a kept row the request does not ask for, a row kept twice, or rows in the wrong order leave or move when the result's processing declares the condition, deduplication or order the request gives, or when a read, or the site's own filter, leaves them out; a row or a column the request asks for that the result lacks comes from a read of the page that shows it; a value held wrong is read again where the site shows it; an act that is missing or wrong is done on the site.";

const NOT_NEW ="The check reads what you hold, never the draft, your summary or your notes, so only new evidence changes its answer.";

const SAID: Readonly<Record<"no" | "unsure", string>> = Object.freeze({ no: "said no to", unsure: "could not confirm" });

export const AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS = Object.freeze({
  /**
   * A judge's no or unsure, as the model reads it: its reason whole, what each defect it listed is fixed by where it listed
   * any (`found`), which named columns the rows it read lack and how the asked table becomes the result where they lack
   * any (`columns`, `./result-columns.ts`, t1032), then what would change it.
   */
  judged: (reason: string, found = false, columns?: string): string => `${reason} ${found ? `${FOUND} ` : ""}${columns ? `${columns} ` : ""}${NEW_EVIDENCE}`,

  /**
   * Rows that cannot be the table the request names, refused before any judge (`./asked-table.ts`, t1034): which named
   * columns they lack, and how the asked table becomes the result (`columns`, `./result-columns.ts`).
   */
  notAskedTable: (asked: readonly string[], lacking: readonly string[], columns: string | undefined): string =>
    `This completion was refused before any check was paid for: the request names the columns of the table it asks for (${asked.join(", ")}), and the rows the result holds have no ${lacking.join(" or ")} column, so no check can take them as that table, whatever else they show. Everything else the request asks for is checked once the result is that table. ${columns ? `${columns} ` : ""}${NEW_EVIDENCE}`,

  /** A request that asks for rows back, completed before any read ran (`./check.ts`, `rows_not_read`). `asked` is the person's own sentence, where Core found one. */
  rowsNotRead: (asked: string | undefined): string =>
    `The request asks for rows back${asked ? ` ("${asked}")` : ""}, and no read has run in this attempt, so this completion was not checked. Rows come only from a read of the page: words in answer are not rows, however they are laid out. Go to the page that shows the rows asked for, run the read there, and complete once it has returned them. If that read finds none, complete then: an empty read is a result the check can judge.`,

  /** A completion over what the check last refused: what that was about, what would change it, and what repeating it leads to. */
  sameEvidence: (verdict: "no" | "unsure", reason: string, found = false, columns?: string): string =>
    `This completion was refused without being checked: what you hold is exactly what the check last ${SAID[verdict]}, so it would answer the same. What it said: ${reason} ${found ? `${FOUND} ` : ""}${columns ? `${columns} ` : ""}${NEW_EVIDENCE} So get something new before you complete again: ${found ? "work on a defect it listed, or " : ""}go to where what the check could not see is shown, and look, read or act there. First decide how to go on with core.loop_decision where it is offered: change_approach and name the way, or finish_with_best only with a different result; ask_person, with one plain question for something genuinely impossible, only once the decision offers it. Completing again with nothing new stops this round, and the next must take a different way.`,

  /** Said when any of these comes again over one draft, in place of the loop's words for a check that reads the draft (`../../../../../runtime/llm/decision-handlers/completion.ts`). */
  sentAgain: NOT_NEW,

  /** A check that gave no answer is no refusal of what was sent: asking again is what it wants. */
  sentAgainUnjudged: "The check gave no answer, which is not a no: completing again asks it again.",

  /** A fresh round after a refused repeat, in front of its evidence: `lastCheck` beside it holds the reason, and `personSaid` the person's answer once they have given one. */
  freshRound: (personAnswered: boolean): string =>
    `Your completion was refused again over the same evidence, so this round starts fresh. lastCheck says what the check said. ${NEW_EVIDENCE} Completing again with nothing new stops this round too, and the next must take a different way.${personAnswered ? " The person has answered: personSaid holds their words. Follow them to get something new." : ""}`
});
