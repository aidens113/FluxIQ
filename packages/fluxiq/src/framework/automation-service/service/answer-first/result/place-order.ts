// Where a page goes among its step version's pages: the place rule that replaces the rows-overlap rules.
//
// - **A place already read** is read again: the new page replaces it where it stands (run-mwa19obz-*, where a short
//   re-read and then a run's page of the same place had been appended one after the other).
// - **A numbered place** (`name=N`, as the domain's pager says it) goes before the first page of the same name with a
//   higher number, so pages read out of order still stand in the list's order.
// - **The same spot** (`../result-feed/place-of.ts`: the page a read ran on and how often its list has moved) is the same page
//   read again, unless the pager named two different places for it. This is how a read the pager named no place for is told from a next page.
// - **Any other place, or none,** is the next after the version's last place. With no place and no spot said, nothing here can
//   tell a re-read from a next page, and none is guessed from the rows.
import type { AutomationStudioAnswerFirstResultPage } from "./types.ts";

const NUMBERED_PLACE = /^(page|offset)=(\d+)$/u;

export function automationStudioAnswerFirstResultPlacePage(pages: readonly AutomationStudioAnswerFirstResultPage[], page: AutomationStudioAnswerFirstResultPage): AutomationStudioAnswerFirstResultPage[] {
  // The same spot is the same page read again, unless the pager named two places for it: it stands where that page stood, with the place that page had.
  const again = page.spot === undefined ? -1 : pages.findIndex((each) => each.spot === page.spot && (each.place === undefined || page.place === undefined || each.place === page.place));
  if (again >= 0) return pages.map((each, index) => (index === again ? { ...page, place: page.place ?? each.place } : each));
  if (page.place !== undefined) {
    const at = pages.findIndex((each) => each.place === page.place);
    if (at >= 0) return pages.map((each, index) => (index === at ? page : each));
    const number = automationStudioAnswerFirstResultNumberedPlace(page.place);
    const before = number === undefined ? -1 : pages.findIndex((each) => {
      const other = automationStudioAnswerFirstResultNumberedPlace(each.place);
      return other !== undefined && other.name === number.name && other.value > number.value;
    });
    if (before >= 0) return [...pages.slice(0, before), page, ...pages.slice(before)];
  }
  return [...pages, page];
}

/** A place said as one `name=N`: its name and number. Anything else is not numbered. */
export function automationStudioAnswerFirstResultNumberedPlace(place: string | undefined): { name: string; value: number } | undefined {
  const match = place === undefined ? null : NUMBERED_PLACE.exec(place);
  const value = match ? Number(match[2]) : undefined;
  return match && value !== undefined && Number.isSafeInteger(value) ? { name: match[1]!, value } : undefined;
}
