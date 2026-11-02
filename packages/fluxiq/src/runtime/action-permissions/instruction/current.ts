import type { AutomationStudioInstructionText, AutomationStudioInstructedConsequence } from "../../../flows/executable/permissions/index.ts";
import { parseEntry } from "./parse.ts";
import { automationStudioInstructionDigest } from "./digest.ts";

/**
 * The stored entries that still stand, and those that lapsed.
 *
 * An entry stands only while its instruction is among the active ones and its
 * text still has the digest the entry was derived from. Anything that does not
 * parse is not an entry. Nothing here calls a model, so a replay with none can
 * read it.
 */
export function currentAutomationStudioInstructedConsequences(input: {
  stored: unknown;
  activeInstructions: readonly AutomationStudioInstructionText[];
}): { current: AutomationStudioInstructedConsequence[]; lapsed: AutomationStudioInstructedConsequence[] } {
  const current: AutomationStudioInstructedConsequence[] = [];
  const lapsed: AutomationStudioInstructedConsequence[] = [];
  for (const entry of Array.isArray(input.stored) ? input.stored.map(parseEntry) : []) {
    if (!entry) continue;
    const instruction = input.activeInstructions.find((candidate) => candidate.instructionId === entry.instructionId);
    if (instruction && automationStudioInstructionDigest(instruction) === entry.instructionDigest) current.push(entry);
    else lapsed.push(entry);
  }
  return { current, lapsed };
}
