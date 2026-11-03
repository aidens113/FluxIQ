// Every computed fact, in one order: the facts Core settles before any judge
// is asked (`../contracts/computed-facts.ts`, framework plan P5).

import type { AutomationStudioResultComputedFact, AutomationStudioResultComputedFactCheck, AutomationStudioResultComputedFactsInput } from "../contracts/index.ts";
import { automationStudioResultActPassesFact } from "./act-passes.ts";
import { automationStudioResultColumnsFact } from "./columns.ts";
import { automationStudioResultCountFact } from "./count.ts";
import { automationStudioResultKeptBoundsFact } from "./kept-bounds.ts";
import { automationStudioResultLeftOutAccountedFact } from "./left-out-accounted.ts";
import { automationStudioResultOrderFact } from "./order.ts";
import { automationStudioResultRepeatedFact } from "./repeated.ts";
import { automationStudioResultVerbatimFact } from "./verbatim.ts";

/** In the order a person reads them: what was stored, then what was left out, then the acts. */
const CHECKS: readonly AutomationStudioResultComputedFactCheck[] = [
  automationStudioResultCountFact,
  automationStudioResultColumnsFact,
  automationStudioResultRepeatedFact,
  automationStudioResultVerbatimFact,
  automationStudioResultKeptBoundsFact,
  automationStudioResultOrderFact,
  automationStudioResultLeftOutAccountedFact,
  automationStudioResultActPassesFact
];

/** Every fact Core could compute of this result, in `CHECKS` order; none where it could compute none. */
export function automationStudioResultComputedFacts(input: AutomationStudioResultComputedFactsInput): AutomationStudioResultComputedFact[] {
  return CHECKS.flatMap((check) => check(input));
}
