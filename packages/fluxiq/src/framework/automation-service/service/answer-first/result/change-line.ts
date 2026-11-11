// The change line (I2): on the answer of any call or run that changed the result, how it changed, worked out from the
// ledger before and after it, never from notes kept on the way. "result 17 → 0 rows: step 9 is now v2; v1's
// page=1 (12), page=2 (5) left the result; v2 has read no page yet." Pages that leave are always named, with their
// counts (run-mwafor01, where a read became the whole result and nothing said so). No change is no line: `undefined`.
import { automationStudioAnswerFirstResultPlaceLabels } from "./place-label.ts";
import { automationStudioAnswerFirstResultOutputStep } from "./output-step.ts";
import { automationStudioAnswerFirstResultWords as words } from "./statement-words.ts";
import { automationStudioAnswerFirstResultStepHolder } from "./holder.ts";
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultPage, AutomationStudioAnswerFirstResultStep } from "./types.ts";

export function automationStudioAnswerFirstResultChangeLine(before: AutomationStudioAnswerFirstResultLedger, after: AutomationStudioAnswerFirstResultLedger): string | undefined {
  const outputBefore = automationStudioAnswerFirstResultOutputStep(before);
  const outputAfter = automationStudioAnswerFirstResultOutputStep(after);
  const parts: string[] = [];
  for (const taken of after.taken.filter((each) => !before.taken.some((earlier) => earlier.source === each.source))) {
    const step = automationStudioAnswerFirstResultStepHolder(after, taken.stepId);
    parts.push(`call ${taken.source} is now a draft step${step ? ` (${words.step(step)})` : ""}`);
  }
  const matched = new Set<AutomationStudioAnswerFirstResultStep>();
  for (const earlier of before.steps) {
    const later = successor(after, earlier);
    const where = earlier === outputBefore ? "the result" : "its working read";
    if (!later) {
      parts.push(`step ${earlier.position} left the draft${earlier.pages.length ? `, and its ${words.pages(earlier.pages)} left ${where}` : ""}`);
      continue;
    }
    matched.add(later);
    if (later.version !== earlier.version) {
      const left = earlier.pages.length ? `v${earlier.version}'s ${words.pages(earlier.pages)} left ${where}` : `v${earlier.version} had read no page`;
      const read = later.pages.length ? `v${later.version} has read ${automationStudioAnswerFirstResultPlaceLabels(later.pages).join(", ")} only` : `v${later.version} has read no page yet`;
      parts.push(`${words.step(later)} is now v${later.version}; ${left}; ${read}`);
      continue;
    }
    parts.push(...pageChanges(later, earlier.pages));
  }
  const foldedBefore = new Set(before.steps.flatMap((step) => step.folded.map((folded) => folded.id)));
  for (const later of after.steps) {
    if (!matched.has(later)) parts.push(`${words.step(later)} is a new read step${later.pages.length ? ` and read ${words.pages(later.pages)}` : ""}`);
    for (const folded of later.folded.filter((each) => !foldedBefore.has(each.id))) {
      parts.push(`step ${folded.position} reads the same list as step ${later.position} with the same conditions and fields, so its pages are step ${later.position}'s`);
    }
  }
  const outputNow = outputBefore ? successor(after, outputBefore) : undefined;
  if (outputAfter && outputNow !== outputAfter) parts.push(`the result is now ${words.step(outputAfter)}'s${outputBefore ? ` (it was step ${outputBefore.position}'s)` : ""}`);
  if (!outputAfter && outputBefore) parts.push("no read step is the result now");
  const rowsBefore = outputBefore ? words.keptCount(outputBefore) : 0;
  const rowsAfter = outputAfter ? words.keptCount(outputAfter) : 0;
  if (!parts.length && rowsBefore === rowsAfter) return undefined;
  return `result ${rowsBefore} → ${words.rows(rowsAfter)}${parts.length ? `: ${parts.join("; ")}` : ""}.`;
}

/** The step of `after` holding what `earlier` held: the same draft step, or the one a folded step it held now holds. */
function successor(after: AutomationStudioAnswerFirstResultLedger, earlier: AutomationStudioAnswerFirstResultStep): AutomationStudioAnswerFirstResultStep | undefined {
  for (const id of [earlier.id, ...earlier.folded.map((folded) => folded.id)]) {
    const holder = automationStudioAnswerFirstResultStepHolder(after, id);
    if (holder) return holder;
  }
  return undefined;
}

/** Pages a step version read since `earlier`: a new place, a place read again, a page carried in. */
function pageChanges(step: AutomationStudioAnswerFirstResultStep, earlier: readonly AutomationStudioAnswerFirstResultPage[]): string[] {
  const labels = automationStudioAnswerFirstResultPlaceLabels(step.pages);
  const changes: string[] = [];
  step.pages.forEach((page, index) => {
    const was = earlier.find((each) => each.seq === page.seq) ?? (page.place === undefined ? undefined : earlier.find((each) => each.place === page.place));
    if (was && was.seq === page.seq) return;
    const count = `${page.kept.length}${page.carried ? ", carried from an earlier attempt" : ""}`;
    changes.push(was ? `${words.step(step)} read ${labels[index]} again (${was.kept.length} → ${count})` : `${words.step(step)} read ${labels[index]} (${count})`);
  });
  return changes;
}
