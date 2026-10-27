// The single values a run's steps returned, for the judge (t757).
//
// Auction `run-mveba82m-fd0616dc` read three values off a page one by one and
// stored no record set. The judge saw those values only as the targets the
// steps were authored with and somewhere on the end page: nothing said they
// were what the run returned, nor that a value a step returns is handed on and
// is no stored record. So the summary now lists, in run order and by the step
// that returned it, the value each succeeded step handed on through
// `outputs.value` -- Core's port for a node's single value, where a read's
// answer lands by its data port's `resultPath`
// (`../executor/node-execution/result-path-outputs.ts`) -- beside Core's
// sentence for what they are.
//
// Screened as every run value is (`./result-summary.ts`): no values without a
// declaration of the domain's denied keys, none the run itself withheld and
// none credential-shaped, a locator rewritten out of one; each loss sets
// `withheld`. A value that is no single string, number or boolean is no single
// value and is not listed.

import type { AutomationStudioResultReturnedValues } from "./contracts/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../executor/index.ts";
import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../llm/index.ts";

/** Core's sentence beside the values (header). */
const SAID = "The single value each of these steps returned when it ran in this run, by nodeId, in run order. "
  + "A returned value is handed on to later steps: it is not a stored record, and recordSets alone hold the records the run stored.";

/** The values `attempts` returned, screened (header); none where no step returned one. */
export function automationStudioResultReturnedValues(
  attempts: ReadonlyArray<{ nodeId: string; status?: string | undefined; outputs?: Readonly<Record<string, unknown>> | undefined }> | undefined,
  deniedEvidenceKeys: readonly string[] | undefined
): { returned?: AutomationStudioResultReturnedValues; withheld: boolean } {
  const returned = (attempts ?? []).flatMap((attempt) => {
    const value = attempt.status === "succeeded" ? attempt.outputs?.value : undefined;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? [{ nodeId: attempt.nodeId, value }] : [];
  });
  if (!returned.length) return { withheld: false };
  if (deniedEvidenceKeys === undefined) return { withheld: true };
  let withheld = false;
  const values = returned.flatMap((entry) => {
    if (typeof entry.value !== "string") return [entry];
    if (entry.value.includes(AUTOMATION_STUDIO_WITHHELD_VALUE) || screenAutomationStudioLlmEvidence(entry.value, deniedEvidenceKeys).secretShaped) {
      withheld = true;
      return [];
    }
    if (!automationStudioLocatorShapedText(entry.value)) return [entry];
    withheld = true;
    return [{ nodeId: entry.nodeId, value: automationStudioWithoutLocators(entry.value) }];
  });
  return values.length ? { returned: { said: SAID, values }, withheld } : { withheld };
}
