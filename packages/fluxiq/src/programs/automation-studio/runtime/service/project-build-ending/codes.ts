// The codes a project build's ending sets for the chat's commands (t753).
//
// Round 5 read one verdict three times: the build's ending row, then the
// command's answer, then the draft's card line. The ending row
// (`./ending-told.ts`, `../project-build/run.ts`) is now the one account of the
// ending -- what happened, why, what Core recorded of its tests and what is
// left on the site -- and says on what it hands back that it was told, so the
// commands (`conversations/commands/`) say only what the Flow keeps and what
// the person can do next:
//
// - `told`: the ending row said the ending. On a failure it is one of the
//   failure's issue codes; on a kept draft one of its trial's
//   `feedback.endingCodes`, which the promotion adds after the draft's own code
//   (`../candidate-trial/promotion.ts`).
// - `endedUnfinished`: the supervisor ended the build without completing it,
//   though the latest whole test it holds was judged yes. That test is kept as
//   the draft's, so nothing says it never ran, and its yes never promotes:
//   only a completion stands on its yes.

/** The codes (header): identifiers only, as every code a debug and the Lab read. */
export const AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_CODES = Object.freeze({
  told: "project.build_ending_told",
  endedUnfinished: "project.build_ended_unfinished"
});
