// What a step version has read of its list, stated as facts for the model and the judge to weigh (I6, I8): the places
// read in order, whether the list's first place is among them, and what the pager said after the last one. Never
// "complete": an "ended" is only as true as the pager that said it, so its reason is carried with it.
//
// Whether the first place was read is known only where the places are numbered (`name=N`): the lowest is 0 or 1, or
// it is not. A cursor or an unplaced read says nothing of it, and the answer is "unknown".
//
// **Several result reads of one list read it together (t1091).** Where the answer is made of more than one read step of
// the same list (`./output-group.ts`), what was read of the list is every page of them all: a step that read page 2
// beside a step that read page 1 has not left the first place unread. Their pages are put in place order by the place
// rule (`./place-order.ts`), in the order they were read, and an unplaced page is named by its own step ("step 12's
// unplaced read 1"), so the header names the same page its step's own words do.
import { automationStudioAnswerFirstResultNumberedPlace, automationStudioAnswerFirstResultPlacePage } from "./place-order.ts";
import { automationStudioAnswerFirstResultPlaceLabels } from "./place-label.ts";
import type { AutomationStudioAnswerFirstResultCoverage, AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultStep } from "./types.ts";

/** What `read` (one step, or the steps that read one list together) has read of its list. */
export function automationStudioAnswerFirstResultCoverage(read: AutomationStudioAnswerFirstResultStep | readonly AutomationStudioAnswerFirstResultStep[]): AutomationStudioAnswerFirstResultCoverage {
  const steps: readonly AutomationStudioAnswerFirstResultStep[] = Array.isArray(read) ? read : [read as AutomationStudioAnswerFirstResultStep];
  const one = steps.length === 1 ? steps[0]! : undefined;
  const labels = new Map<number, string>();
  for (const step of steps) {
    const own = automationStudioAnswerFirstResultPlaceLabels(step.pages);
    step.pages.forEach((page, index) => labels.set(page.seq, page.place ?? (one ? own[index]! : `step ${step.position}'s ${own[index]!}`)));
  }
  const pages = one ? one.pages : steps.flatMap((step) => step.pages).sort((a, b) => a.seq - b.seq).reduce<AutomationStudioAnswerFirstResultPage[]>((placed, page) => automationStudioAnswerFirstResultPlacePage(placed, page), []);
  const places = pages.map((page) => labels.get(page.seq) ?? page.place ?? "unplaced read");
  const numbers = pages.flatMap((page) => {
    const numbered = automationStudioAnswerFirstResultNumberedPlace(page.place);
    return numbered ? [numbered] : [];
  });
  const first = numbers.length ? (numbers.some((place) => place.value === 0 || (place.name === "page" && place.value === 1)) ? "read" : "not read") : "unknown";
  const lastPage = pages[pages.length - 1];
  const last = lastPage ? { place: places[places.length - 1]!, paging: lastPage.paging } : undefined;
  return { places, first, last };
}
