const DRY_RUN_INSTRUCTION = "You said the Flow is ready, so it was tested: run once from the beginning with no model attached, the way the finished Flow will run. The target was put back the way your first step found it, and every step you kept was run in order with the argument the Flow will use. "
  + "A step that does not replay is a step the Flow cannot rely on, so the Flow is not proposed until they all do. Repair it live from where the test stopped -- the draft is not run from the beginning again until you say it is ready again. "
  + "failed: the step did not run this time. Rerun it with a corrected argument (amend_draft rerun), or run the step it needed first and keep that one too. "
  + "changed: it ran, and produced nothing where it produced something before -- almost always the step before it left the target somewhere else, so correct the order or the earlier step rather than this one. "
  + "unreproducible: the step's target was not there, and the test was not on the page the step acted on: the steps before it no longer reach that page. Check that they still get there. "
  // The site's memory is not the draft's fault (`./site-memory.ts`). The
  // finished Flow runs on a site that has not seen any of this, so a step
  // dropped for it is a wall the Flow stops at (t195-w19a/b/d/e).
  + "remembered: the step's target was gone from the very page it acted on, because the site remembers what you did while exploring -- a consent banner answered once stays answered, a sign-in wall passed once stays passed -- and the test never clears what the site remembers. It passes, and it stays in the Flow exactly as it is: the finished Flow runs on a site that has not seen it yet and needs it there. Do not drop, rerun or reorder a remembered step. "
  + "reanchored: true means the step was first looked for on another page, right after a step that was not done again (verified, present, remembered or afterWithheld), so the test went to the page the step acted on and tried it once more there; what the line shows is that second try. "
  // The honest answer to a step that is not always there. Before routing
  // existed the only answers were "insist" or "delete", and a live build's
  // dismissals were waved through unchecked under the first. Named here rather
  // than only in the draft entry because this refusal is where the model is
  // actually looking at the step that needs it.
  + "A step that is not always needed is not a step to insist on: say so instead, with amend_draft optional, and the Flow carries on when it is not there. Where you ran a check first, amend_draft only_if on this step runs it only when that check succeeded. "
  // Insisting used to be accepted the second time; runs 18, 21 and 33 shipped
  // or nearly shipped a step that did not replay that way (see the header).
  + "So a step that failed, changed or is unreproducible keeps the Flow from being proposed until it replays, is marked optional (or only_if on a check), or is dropped; finishing again with it unchanged is refused again. Drop it only if the Flow does not need it at all. "
  // The one case the replay answers itself (`./sometimes-present.ts`), said so
  // the model does not mark by hand what the next test would mark for it.
  + "An unreproducible step that does none of the acts, and without which every later step replayed, is made optional by the test itself once nothing else stands in the way. "
  + "again: true marks a step an earlier dry run already reported as not replaying. "
  // Decision D1: a lasting effect is never repeated (`./verify-only.ts`). The
  // model must not read a checked step as one that was done again.
  + "verified: the step changes something that lasts, so it was not run again, only checked that it could run now. present: the same kind of step, whose effect is already in place on the page it acted on, so it was not run either. Both pass. "
  // A step the test passed over is not one to repair (`./excused.ts`): the
  // judge of live run `run-murzln6g-11debe1d` asked to fix or remove one.
  + "excused: the step did not replay, and the Flow passes over it as written -- the line says why: optional, an interruption that was not there, a check, a fallback, a repeat, or a step that needed what a verified step would have done. It does not stand in the way: do not fix, rerun, reorder or drop it for this. "
  + "afterWithheld names the verified step before this one whose effect was withheld -- one that moved the page, or one that moves money, deletes, or sends or publishes, which the test never does -- so this step may have needed what that step would have done; a step marked with it does not stand in the way of the proposal on its own. "
  // t252: a repeat is run as the Flow runs it (`../llm/node-tools/replay-span.ts`).
  + "A step inside a repeat was run once for each item its list returned in this test, each time with that item and with its bound values filled in for it -- a lasting act is checked for each item, never done -- or, over a check, once each time the check held, or, with while, once per pass, until its last step answered that it ended or the loop reached its most passes. passes says how many times it ran, and pass names the first time it did not replay, which is what its line shows; passes 0 means the list had no items in this test. "
  + "loop_bound: the list returned more items than the loop takes. unresolved_binding: a bound value had nothing to take it from -- a row field on a step outside the repeat, or one the item does not have -- so the step was not sent. "
  + "When the test could not read the list's items, the repeat ran once on the item you explored, as a step the Flow does not always run. "
  + "The target now stands where the replay ended.";

export function automationStudioFlowDraftDryRunInstruction(): string {
  return DRY_RUN_INSTRUCTION;
}
