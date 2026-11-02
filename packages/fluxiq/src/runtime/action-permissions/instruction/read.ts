import type { AutomationStudioInstructionText, AutomationStudioInstructedActText, AutomationStudioInstructedRead, AutomationStudioInstructedActRead } from "../../../flows/executable/permissions/index.ts";
import { readAutomationStudioInstructedConsequences } from "./consequences.ts";
import { isRecord } from "./record.ts";
import { actAnswer } from "./answer.ts";
import { groundedWords } from "./grounding.ts";
import { overlaps } from "./overlap.ts";
import { automationStudioInstructionDigest } from "./digest.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../components/automation/action-effect/consequences/index.ts";
import { withActReads } from "./attach.ts";

/**
 * A model's answer as a build holds it: the grounded free answer
 * (`readAutomationStudioInstructedConsequences`), then one entry per class
 * each act was answered with, quoting that act's own words where they are
 * found in an instruction, else the clause a split act came from where that is
 * found, and kept only then; never two entries of one class whose quotes
 * overlap, so sibling splits of one clause give one entry per class. Every
 * act's own answer rides beside them, under the act's own quote. An act whose
 * answer is missing or unreadable is `consequences: null`.
 */
export function readAutomationStudioInstructedRead(input: {
  result: unknown;
  instructions: readonly AutomationStudioInstructionText[];
  acts: readonly AutomationStudioInstructedActText[];
}): AutomationStudioInstructedRead {
  const entries = readAutomationStudioInstructedConsequences(input);
  if (!input.acts.length) return entries;
  const answers = isRecord(input.result) && isRecord(input.result.acts) ? input.result.acts : {};
  const reads = input.acts.map((act): AutomationStudioInstructedActRead => ({ act: act.id, quote: act.quote, consequences: actAnswer(answers[act.id]) }));
  for (const [index, read] of reads.entries()) {
    const clause = input.acts[index]!.source?.clause;
    const found = groundedWords(read.quote, input.instructions) ?? (clause === undefined ? undefined : groundedWords(clause, input.instructions));
    if (!found) continue;
    const { quote, source } = found;
    for (const consequence of read.consequences ?? []) {
      // The free answer may quote the same clause shorter or longer than the act does: that clause has its entry.
      if (entries.some((entry) => entry.consequence === consequence && overlaps(entry.quote, quote))) continue;
      entries.push({ consequence, instructionId: source.instructionId, instructionDigest: automationStudioInstructionDigest(source), quote });
    }
  }
  const ordered = AUTOMATION_STUDIO_ACTION_CONSEQUENCES.flatMap((consequence) => entries.filter((entry) => entry.consequence === consequence));
  return withActReads(ordered, reads);
}
