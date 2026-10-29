// The values a noted advice listed (t790, run `run-mvswewhy-e4e469d4`): read
// back only where Core's note is (`./note.ts`), from the advice before it, by
// the reading the note was given by (`./advice-values.ts`). The trial's mark
// suggestion fires on these (`../../service/candidate-trial/row-mark.ts`), so a
// request that names its values, whose advice gets no note, gets no suggestion.

import { automationStudioResultAdviceListedValues } from "./advice-values.ts";
import { AUTOMATION_STUDIO_RESULT_LISTED_VALUES_NOTE } from "./note.ts";

/** The values an advice listed, where it carries Core's note; none for an advice without it. */
export function automationStudioResultNotedListedValues(advice: string): string[] {
  const at = advice.indexOf(AUTOMATION_STUDIO_RESULT_LISTED_VALUES_NOTE);
  return at < 0 ? [] : automationStudioResultAdviceListedValues(advice.slice(0, at));
}
