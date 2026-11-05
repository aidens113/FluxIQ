import type { AutomationStudioSkippedProjectPart } from "./types.ts";

/** Why a part was not kept, in words to the person who asked. Every code `saveProjectPartsOfAppliedFlow` can skip with has a line. */
const SKIP_WORDS: Readonly<Record<AutomationStudioSkippedProjectPart["reason"], string>> = Object.freeze({
  "part.name_unusable": "It has no name that reads as plain words. Give it a name and save it again.",
  "part.port_unusable": "One of the values it takes or hands back has a name that does not read as plain words.",
  "part.contract_unreadable": "Its start and end conditions could not be read, so FluxIQ cannot tell when it has worked.",
  "part.no_acting_step": "It does nothing on a page, so there is nothing to reuse.",
  "part.fixed_value_unusable": "It types a fixed value that cannot be shown safely.",
  "part.secret_shaped_value": "It holds a value that looks like a password or a key, so it was not kept.",
  "part.fixed_value_from_request": "It has your request written into its steps (a fixed item or word), so reusing it would repeat that request instead of a new one.",
  "part.unclassified_step": "FluxIQ could not tell whether one of its steps changes anything for good, so it was not kept.",
  "part.unreadable_consequences": "One of its steps says it changes something that FluxIQ does not recognise, so it was not kept.",
  "part.unresolved_call": "It uses another part that is not saved, so it cannot be kept on its own.",
  "part.card_invalid": "Its description could not be written safely, so it was not kept.",
  "part.primary_not_explicit": "It is the main part of its automation, which is kept only when you ask for it.",
  "part.call_cycle": "It and another part use each other, so neither can be kept.",
  "part.call_too_deep": "It uses parts that use parts too many levels deep, so it was not kept."
});

export function projectPartSkipWords(reason: AutomationStudioSkippedProjectPart["reason"]): string {
  return SKIP_WORDS[reason] ?? "It could not be kept.";
}
