// The words every statement of the result names its parts in (`./header.ts`, `./change-line.ts`, `./look-line.ts`,
// `./empty-refusal.ts`), so a step, a page and a count read the same wherever the model meets them. Generic words
// only: a step's position, a page's place as the domain said it, and counts. Never a row, a site's word or a task's.
import { automationStudioAnswerFirstResultPlaceLabels } from "./place-label.ts";
import type { AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultRead, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export const automationStudioAnswerFirstResultWords = {
  /** "16 rows", "1 row". */
  rows(count: number): string {
    return count === 1 ? "1 row" : `${count} rows`;
  },
  /** "step 9", or "step 9 (also step 12, the same list read the same way)" for a step others were folded into. */
  step(step: AutomationStudioAnswerFirstResultStep): string {
    if (!step.folded.length) return `step ${step.position}`;
    const others = step.folded.map((folded) => `step ${folded.position}`).join(", ");
    return `step ${step.position} (also ${others}, the same list read the same way)`;
  },
  /** "v2: 4 conditions", "v1: no conditions". */
  version(step: AutomationStudioAnswerFirstResultStep): string {
    const count = step.reads.conditions.length;
    return `v${step.version}: ${count === 0 ? "no conditions" : count === 1 ? "1 condition" : `${count} conditions`}`;
  },
  /** Each page by its label and kept count, in place order: "page=1 (11), page=2 (5, carried from an earlier attempt)". */
  pages(pages: readonly AutomationStudioAnswerFirstResultPage[]): string {
    const labels = automationStudioAnswerFirstResultPlaceLabels(pages);
    return pages.map((page, index) => `${labels[index]} (${page.kept.length}${page.carried ? ", carried from an earlier attempt" : ""})`).join(", ");
  },
  /** "1 page", "2 pages". */
  pageCount(count: number): string {
    return count === 1 ? "1 page" : `${count} pages`;
  },
  /** A look by its call and kept count: "call p1.read.4 (12 rows)". */
  look(look: AutomationStudioAnswerFirstResultRead): string {
    return `call ${look.source} (${automationStudioAnswerFirstResultWords.rows(look.kept.length)})`;
  },
  /** The rows the step's current version holds. */
  keptCount(step: AutomationStudioAnswerFirstResultStep): number {
    return step.pages.reduce((sum, page) => sum + page.kept.length, 0);
  },
};
