import { automationStudioActivityReads } from "./reads.ts";
import type { AutomationStudioActivityLoopPass } from "./types.ts";

/**
 * What a step says of the pass it runs as. A read in a paging loop is the
 * page it reads: "Reading page 3", page 1 included, so the cards of a loop
 * count up from its first page and a person sees paging start. Any other step
 * of the pass names it after what it does: "Clicking “Next” on page 3", or in
 * a loop that reads no list "Clicking “Confirm” (pass 3)". `action` is the
 * step's own words; a step with none keeps none, and `after` is what follows
 * its "step N of M" instead ("Running step 4 of 5 on page 3"). Never an id:
 * the pass is a number and a generic word.
 */
export function automationStudioActivityPassWords(input: { action: string | undefined; definitionId: string | undefined; pass: AutomationStudioActivityLoopPass }): { action?: string; after: string } {
  const { pass } = input;
  // A list loop's pass is its row, which the step carries for its card (`../step/started.ts`): no number of its own.
  if (pass.unit === "row") return input.action === undefined ? { after: "" } : { action: input.action, after: "" };
  if (pass.unit === "page" && automationStudioActivityReads(input.definitionId)) return { action: `Reading page ${pass.pass}`, after: "" };
  const after = pass.unit === "page" ? ` on page ${pass.pass}` : ` (pass ${pass.pass})`;
  return input.action === undefined ? { after } : { action: `${input.action}${after}`, after: "" };
}
