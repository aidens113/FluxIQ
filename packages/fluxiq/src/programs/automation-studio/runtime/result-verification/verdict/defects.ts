import { automationStudioLocatorShapedText, automationStudioWithoutLocators, screenAutomationStudioLlmEvidence, type AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";

/** The three kinds a defect may name; any other is not carried. */
const KINDS: ReadonlySet<string> = new Set(["kept_not_asked", "asked_missing", "wrong_value", "other"]);

/**
 * A no's own list of defects (`diagnosis.defects`, t752), as Core carries it on
 * the no's reading: read forgivingly, as every word a judge wrote is
 * (`../judgement-screen.ts`). A defect that is not an object of a known kind
 * with a row and the request's words is not carried, and neither is a column
 * on any kind but `wrong_value`; nothing here refuses the verdict. A text that
 * is credential-shaped drops its defect whole, and a locator-shaped one is
 * rewritten without the locator; either loss is `withheld`, so an absent defect
 * and a refused one do not read alike.
 */
export function automationStudioResultScreenedDefects(defects: unknown): { defects: AutomationStudioLlmVerificationDefect[]; withheld: boolean } {
  if (!Array.isArray(defects)) return { defects: [], withheld: false };
  let withheld = false;
  const carried: AutomationStudioLlmVerificationDefect[] = [];
  for (const defect of defects) {
    if (typeof defect !== "object" || defect === null || !KINDS.has((defect as { kind?: unknown }).kind as string)) continue;
    const { kind, row, column, value, requestWords } = defect as Record<string, unknown>;
    const texts = [row, requestWords, ...((kind === "wrong_value" || column !== undefined) ? [column] : []), ...(value !== undefined ? [value] : [])].map(screened);
    if (texts.some((text) => text.withheld)) withheld = true;
    if (texts.some((text) => text.secret)) continue;
    const [rowText, words, columnText, valueText] = texts.map((text) => text.text);
    if (!rowText || !words || (kind === "wrong_value" && !columnText)) continue;
    carried.push({ kind: kind as AutomationStudioLlmVerificationDefect["kind"], row: rowText, ...(columnText ? { column: columnText } : {}), ...(valueText ? { value: valueText } : {}), requestWords: words });
  }
  return { defects: carried, withheld };
}

/** One text of a defect through the screens: trimmed, absent where empty or not a string. */
function screened(value: unknown): { text?: string; withheld: boolean; secret?: true } {
  if (typeof value !== "string" || !value.trim()) return { withheld: false };
  const trimmed = value.trim();
  if (screenAutomationStudioLlmEvidence(trimmed, []).secretShaped) return { withheld: true, secret: true };
  if (!automationStudioLocatorShapedText(trimmed)) return { text: trimmed, withheld: false };
  return { text: automationStudioWithoutLocators(trimmed), withheld: true };
}
