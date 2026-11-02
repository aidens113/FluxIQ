import type { AutomationStudioInstructionText } from "../../../flows/executable/permissions/index.ts";
import { automationStudioComparableInstructionText as comparable } from "./quote/index.ts";
import { permissionConstants } from "./constants.ts";
const { MAX_QUOTE, MIN_QUOTE } = permissionConstants;

export /** The words with spacing folded, and the instruction that has them word for word; `undefined` when none does or they are out of bounds. */
function groundedWords(words: string, instructions: readonly AutomationStudioInstructionText[]): { quote: string; source: AutomationStudioInstructionText } | undefined {
  const quote = words.replace(/\s+/gu, " ").trim();
  if (quote.length < MIN_QUOTE || quote.length > MAX_QUOTE) return undefined;
  const source = instructions.find((instruction) => comparable(`${instruction.title}\n${instruction.body}`).includes(comparable(quote)));
  return source ? { quote, source } : undefined;
}
