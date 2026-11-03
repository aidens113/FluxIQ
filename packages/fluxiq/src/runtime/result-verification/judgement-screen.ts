// The screen every word a judge wrote passes before Core carries it: a
// refutation's directive (`./repair-directive.ts`), and since t477 the reading
// a yes gave beside its verdict (`./verdict/`), which a split shows the model
// beside the no's (`./agreement.ts`).

import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import type { AutomationStudioResultRepairDirective } from "./contracts/index.ts";

/** The three words `stillAchievable` may carry; any other value is not carried. */
const STILL_ACHIEVABLE = ["yes", "no", "unknown"] as const;

/**
 * What the model said, every word of it that passes the screens.
 *
 * Read forgivingly on purpose: anything that is not a non-empty string is
 * absent, and nothing here can refuse the verdict. A credential-shaped value is
 * dropped whole, because a sentence that matched one of those shapes has a
 * secret in it and no rewrite makes it safe. A locator-shaped one is rewritten
 * rather than dropped, which is the rule `locator-text.ts` states for exactly
 * this case: these are sentences, and the sentence around a selector is the most
 * informative thing in it. Either way the loss is named in `withheld`, so an
 * absent field and a refused one do not read alike.
 */
export function automationStudioResultScreenedJudgement(judgement: { expected?: unknown; observed?: unknown; advice?: unknown; stillAchievable?: unknown } | undefined): {
  judgement?: NonNullable<AutomationStudioResultRepairDirective["judgement"]>;
  withheld: boolean;
} {
  if (!judgement) return { withheld: false };
  let withheld = false;
  const carried = (value: unknown): string | undefined => {
    const screened = screenedText(value);
    if (screened.withheld) withheld = true;
    return screened.text;
  };
  const expected = carried(judgement.expected);
  const observed = carried(judgement.observed);
  const advice = carried(judgement.advice);
  // A closed word, not prose: carried only as one of the three, never screened as text.
  const stillAchievable = STILL_ACHIEVABLE.find((word) => word === judgement.stillAchievable);
  const said = {
    ...(expected ? { expected } : {}),
    ...(observed ? { observed } : {}),
    ...(advice ? { advice } : {}),
    ...(stillAchievable ? { stillAchievable } : {})
  };
  return { ...(Object.keys(said).length ? { judgement: said } : {}), withheld };
}

function screenedText(value: unknown): { text?: string; withheld: boolean } {
  if (typeof value !== "string") return { withheld: false };
  const trimmed = value.trim();
  if (!trimmed) return { withheld: false };
  if (screenAutomationStudioLlmEvidence(trimmed, []).secretShaped) return { withheld: true };
  if (!automationStudioLocatorShapedText(trimmed)) return { text: trimmed, withheld: false };
  return { text: automationStudioWithoutLocators(trimmed), withheld: true };
}
