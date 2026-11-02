import type { AutomationStudioInstructionText, AutomationStudioInstructedConsequence } from "../../../flows/executable/permissions/index.ts";
import { isRecord } from "./record.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, isAutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { automationStudioInstructionDigest } from "./digest.ts";
import { automationStudioComparableInstructionText as comparable } from "./quote/index.ts";
import { permissionConstants } from "./constants.ts";
const { MAX_QUOTE, MIN_QUOTE } = permissionConstants;

/**
 * The classes a model's answer claims, kept only where its quote is found word
 * for word in one of the instructions it was shown. One entry per class, the
 * first grounded claim winning. Anything malformed claims nothing.
 */
export function readAutomationStudioInstructedConsequences(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
}): AutomationStudioInstructedConsequence[] {
  const claims = isRecord(input.result) && Array.isArray(input.result.instructed) ? input.result.instructed : [];
  const found = new Map<AutomationStudioActionConsequence, AutomationStudioInstructedConsequence>();
  for (const claim of claims.slice(0, AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length * 2)) {
    if (!isRecord(claim) || !isAutomationStudioActionConsequence(claim.consequence) || typeof claim.quote !== "string" || found.has(claim.consequence)) continue;
    const quote = claim.quote.replace(/\s+/gu, " ").trim();
    if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) continue;
    const source = input.instructions.find((instruction) => comparable(`${instruction.title}\n${instruction.body}`).includes(comparable(quote)));
    if (!source) continue;
    found.set(claim.consequence, {
      consequence: claim.consequence,
      instructionId: source.instructionId,
      instructionDigest: automationStudioInstructionDigest(source),
      quote
    });
  }
  return AUTOMATION_STUDIO_ACTION_CONSEQUENCES.flatMap((consequence) => {
    const entry = found.get(consequence);
    return entry ? [entry] : [];
  });
}
