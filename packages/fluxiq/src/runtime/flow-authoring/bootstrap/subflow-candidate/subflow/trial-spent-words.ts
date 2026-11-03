/**
 * What the subflow trial gate says in place of each answer that says to test again, once a revision has no
 * retests left (t849, `./trial-gate.ts`): testing it again is refused, so these never say to. Generic words.
 */
export const AUTOMATION_STUDIO_SUBFLOW_TRIAL_SPENT_WORDS = Object.freeze({
  notJudged: "The trial was not judged, and this revision has no retests left, so it cannot complete. Change the subflow for what the feedback names, submit it with core.submit_subflow, then test the new revision.",
  notJudgedAfterYes: "The judges answered yes for this revision and none answered no, but Core could not confirm that yes (the feedback's why says what it lacked), so the trial counts as not judged, and this revision has no retests left. "
    + "The judges accepted the rows this subflow kept: do not rewrite it or change which rows it keeps. End the brief: complete with {\"ended\": \"partial\", \"reason\": \"<the judges answered yes and Core could not confirm it>\"}.",
  entryNotPrepared: "A subflow that runs before this one did not run to its end, so this subflow did not start from its prepared entry and the verdict says nothing about it. This revision has no retests left: complete with outcome blocked and say why."
});
