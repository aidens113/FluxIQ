// What a step version has read of its list, stated as facts for the model and the judge to weigh (I6, I8): the places
// read in order, whether the list's first place is among them, and what the pager said after the last one. Never
// "complete": an "ended" is only as true as the pager that said it, so its reason is carried with it.
//
// Whether the first place was read is known only where the places are numbered (`name=N`): the lowest is 0 or 1, or
// it is not. A cursor or an unplaced read says nothing of it, and the answer is "unknown".
import { automationStudioAnswerFirstResultNumberedPlace } from "./place-order.ts";
import { automationStudioAnswerFirstResultPlaceLabels } from "./place-label.ts";
import type { AutomationStudioAnswerFirstResultCoverage, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultCoverage(step: AutomationStudioAnswerFirstResultStep): AutomationStudioAnswerFirstResultCoverage {
  const places = automationStudioAnswerFirstResultPlaceLabels(step.pages);
  const numbers = step.pages.flatMap((page) => {
    const numbered = automationStudioAnswerFirstResultNumberedPlace(page.place);
    return numbered ? [numbered.value] : [];
  });
  const first = numbers.length ? (Math.min(...numbers) <= 1 ? "read" : "not read") : "unknown";
  const lastPage = step.pages[step.pages.length - 1];
  const last = lastPage ? { place: places[places.length - 1]!, paging: lastPage.paging } : undefined;
  return { places, first, last };
}
