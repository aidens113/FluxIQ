// Every read that ran in the attempt stays evidence for the judge after the draft lets it go (t1067).
//
// The draft decides the Flow, not what the judge may see. The ledger (`../result/`) holds the draft's read steps only, so a
// read step that leaves the draft takes its pages out of the result (`../result/dropped.ts`), and a step amended to another
// version drops the old version's pages (`../result/step-set.ts`). That is right for the answer and for the Flow, and it
// was wrong for the judge, which was fed working reads only from steps still in the draft (t1048).
//
// **Live evidence.** `run-mwy3btww-31d32e0d`: the model read the Pickup list with its rating and pickup columns twice, c15
// at step 0082 and c50 at 0100, 15 rows each, the right $1.28 single roll rated 4.5 with "Pickup today" among them. The
// framework draft keeps only the result's read (t1037, `compose.ts` rule 2), so 0083 and 0101 said each step "left the
// draft, and its page=1 (15) left its working read". In every judge request asked on its own after that, "Pickup today"
// appeared 0 times: six judges said unsure and one said no about a right answer, asking for exactly those rows.
//
// **What is kept.** A page that leaves every step of the ledger is kept here, with the step and version it was read under,
// and goes to the judge among the working reads, page by page with its rows (t1048's shape), until a step holds it again.
// Two kinds of leaving are not a read lost, and keep nothing:
// - a page read again at its place under the same step and version (`../result/place-order.ts`): the newer read of the
//   same page stands for it;
// - a page carried on from an earlier attempt: it was not read in this attempt.
//
// Nothing here caps or cuts: every page keeps every row its read kept. The judge's own size handling decides what a
// request that does not fit says instead (`runtime/result-verification/flow-less/window-fitting.ts`).
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultStep } from "../result/index.ts";

/** One page that left the ledger, with the step it was read under as that step stood. */
export type AutomationStudioAnswerFirstLeftRead = { step: AutomationStudioAnswerFirstResultStep; page: AutomationStudioAnswerFirstResultPage };

export type AutomationStudioAnswerFirstLeftReads = {
  /** The ledger changed from `before` to `after`: keep each page that left it (header). */
  changed(before: AutomationStudioAnswerFirstResultLedger, after: AutomationStudioAnswerFirstResultLedger): void;
  /** Every page kept, in the order the reads ran. */
  reads(): AutomationStudioAnswerFirstLeftRead[];
};

export function automationStudioAnswerFirstLeftReads(): AutomationStudioAnswerFirstLeftReads {
  const left = new Map<string, AutomationStudioAnswerFirstLeftRead>();
  return {
    changed(before, after) {
      const held = new Set(after.steps.flatMap((step) => step.pages.map((page) => page.source)));
      for (const source of held) left.delete(source);
      for (const step of before.steps) {
        for (const page of step.pages) {
          if (held.has(page.source) || page.carried) continue;
          // Read again at its place: the same step, under the same version, still holds that place's newer read.
          if (after.steps.some((each) => each.id === step.id && each.version === step.version)) continue;
          left.set(page.source, { step, page });
        }
      }
    },
    reads() {
      return [...left.values()].sort((a, b) => a.page.seq - b.page.seq);
    }
  };
}
