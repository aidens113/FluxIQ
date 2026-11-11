// What a page is called when the result is stated: its place as the domain said it, or, where none was said, which
// unplaced read of the version it was ("unplaced read 2"). Labels are worked out from the version's pages in place
// order, so they are the same in the header, the change line and the coverage.
import type { AutomationStudioAnswerFirstResultPage } from "./types.ts";

export function automationStudioAnswerFirstResultPlaceLabels(pages: readonly AutomationStudioAnswerFirstResultPage[]): string[] {
  let unplaced = 0;
  return pages.map((page) => {
    if (page.place !== undefined) return page.place;
    unplaced += 1;
    return `unplaced read ${unplaced}`;
  });
}
