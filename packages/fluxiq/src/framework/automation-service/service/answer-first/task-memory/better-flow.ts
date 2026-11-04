// Which Flow a task keeps as its best (design D11, "Which Flow is better"). Pure.
//
//   kept none, next has steps            next
//   same steps                           next; proven-whole true if the whole run was judged yes,
//                                        false if this Flow just failed live, else as kept
//   kept not confirmed, next confirmed   next
//   both confirmed                       next if the kept one just broke on the site, else kept
//   kept confirmed, next not             kept
//   neither confirmed                    next: it was built from the best and went further

import type { AutomationStudioAnswerFirstSavedFlow } from "./saved-flow.ts";

export function automationStudioAnswerFirstBetterFlow(
  kept: AutomationStudioAnswerFirstSavedFlow | undefined,
  next: AutomationStudioAnswerFirstSavedFlow,
  how: { flowFailedLive: boolean; wholeRunYes: boolean }
): AutomationStudioAnswerFirstSavedFlow | undefined {
  if (next.steps.length === 0) return kept;
  if (!kept) return next;
  if (kept.stepsDigest === next.stepsDigest) return { ...next, provenWhole: how.wholeRunYes ? true : how.flowFailedLive ? false : kept.provenWhole };
  const keptConfirmed = kept.label === "confirmed";
  const nextConfirmed = next.label === "confirmed";
  if (keptConfirmed && nextConfirmed) return how.flowFailedLive ? next : kept;
  if (keptConfirmed) return kept;
  return next;
}
