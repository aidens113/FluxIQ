// Which Flow a task keeps as its best (design D11, "Which Flow is better"). Pure.
//
//   kept none, next has steps            next
//   same steps                           next; proven-whole true if the whole run was judged yes,
//                                        false if this Flow just failed live, else as kept
//   one assembles, the other does not    the one that assembles
//   neither assembles                    next: it was built from the kept one and went further
//   kept not confirmed, next confirmed   next
//   both confirmed                       next if the kept one just broke on the site, else kept
//   kept confirmed, next not             kept
//   neither confirmed                    next: it was built from the best and went further
//
// **Whether a Flow assembles comes before its label.** Saved steps that cannot be made into a Flow
// never run: a later attempt is only seeded with them, to repair (`../route/route.ts`). So a Flow
// that does not assemble never wins over one that does. Ranked by label alone, a kept draft no Flow
// could be made of stayed best over the repair that fixed it, because a repair attempt never runs
// the kept Flow and so never sees it "just break on the site", and every later attempt was seeded
// with the same broken steps again.
//
// `next` assembles where its draft was saved, which happens only once it assembled (`candidateId`).
// Whether the kept one assembles is the caller's to say where the attempt checked it at its opening
// (`keptAssembles`); where it cannot say, the kept Flow's own record answers: it assembled when it
// was saved if it holds a `candidateId`.

import type { AutomationStudioAnswerFirstSavedFlow } from "./saved-flow.ts";

export function automationStudioAnswerFirstBetterFlow(
  kept: AutomationStudioAnswerFirstSavedFlow | undefined,
  next: AutomationStudioAnswerFirstSavedFlow,
  how: { flowFailedLive: boolean; wholeRunYes: boolean; keptAssembles?: boolean | undefined }
): AutomationStudioAnswerFirstSavedFlow | undefined {
  if (next.steps.length === 0) return kept;
  if (!kept) return next;
  if (kept.stepsDigest === next.stepsDigest) return { ...next, provenWhole: how.wholeRunYes ? true : how.flowFailedLive ? false : kept.provenWhole };
  const keptAssembles = how.keptAssembles ?? kept.candidateId !== undefined;
  const nextAssembles = next.candidateId !== undefined;
  if (keptAssembles !== nextAssembles) return nextAssembles ? next : kept;
  if (!keptAssembles) return next;
  const keptConfirmed = kept.label === "confirmed";
  const nextConfirmed = next.label === "confirmed";
  if (keptConfirmed && nextConfirmed) return how.flowFailedLive ? next : kept;
  if (keptConfirmed) return kept;
  return next;
}
