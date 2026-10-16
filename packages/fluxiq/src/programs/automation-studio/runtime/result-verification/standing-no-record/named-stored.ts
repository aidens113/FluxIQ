// The labels of the stored rows a judge's reading names, sentence by sentence,
// as a no's claims are found (`../refuted-no/named-rows.ts`). Moved here from
// `../agreement/` (t628), which still reads a split's no by it, so the record
// a build keeps of a standing no (`./record.ts`, t633) names the same rows.

import type { AutomationStudioResultRepairDirective } from "../contracts/index.ts";
import { automationStudioResultReadingSentences, automationStudioResultSentenceRows, type AutomationStudioResultNoRecord } from "../refuted-no/index.ts";

/** The labels of the stored rows `reading` names in its expected, observed and advice, each once. */
export function automationStudioResultNamedStoredLabels(reading: AutomationStudioResultRepairDirective["judgement"] | undefined, record: AutomationStudioResultNoRecord): string[] {
  const labels = new Set<string>();
  for (const text of [reading?.expected, reading?.observed, reading?.advice]) {
    for (const sentence of automationStudioResultReadingSentences(text)) {
      for (const row of automationStudioResultSentenceRows(sentence, record).stored) labels.add(row.label);
    }
  }
  return [...labels];
}
