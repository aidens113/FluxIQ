import type { AutomationStudioActionDeclarationRecord, AutomationStudioInstructedConsequence, AutomationStudioActionDeclarationCrossCheck, AutomationStudioActionDeclarationCrossCheckVerdict } from "../../../flows/executable/permissions/index.ts";
import { automationStudioDeclaredConsequences } from "./consequences.ts";
import { automationStudioConsequencesInOrder } from "../../../components/automation/action-effect/consequences/index.ts";
import { automationStudioDeclaredNothingLasting } from "./nothing.ts";
import { AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION } from "../../../flows/executable/permissions/index.ts";
import { sentenceFor } from "./sentence-for.ts";
import { permissionConstants } from "./constants.ts";
const { MAX_QUOTE } = permissionConstants;

export function automationStudioActionDeclarationCrossCheck(input: {
  declarations: readonly AutomationStudioActionDeclarationRecord[];
  instructed: readonly AutomationStudioInstructedConsequence[];
}): AutomationStudioActionDeclarationCrossCheck {
  // An action that undid one of the build's own acts put the site back; it is
  // no part of what the person asked for, so it is neither evidence for nor
  // against the instruction, and a reset never becomes a finding (t462).
  const declarations = input.declarations.filter((record) => record.undoes === undefined);
  const declared = automationStudioDeclaredConsequences(declarations);
  const instructedClasses = automationStudioConsequencesInOrder(input.instructed.map((entry) => entry.consequence));
  const undeclared = declarations.length
    ? instructedClasses.filter((consequence) => !declared.includes(consequence))
    : [];
  const beyondInstruction = declared.filter((consequence) => !instructedClasses.includes(consequence));
  const declaredNothing = automationStudioDeclaredNothingLasting(declarations).length;
  const verdict: AutomationStudioActionDeclarationCrossCheckVerdict = !declarations.length
    ? "not_comparable"
    : undeclared.length
      ? "undeclared"
      : beyondInstruction.length
        ? "beyond_instruction"
        : "agreed";
  const quotes = undeclared.flatMap((consequence) => {
    const entry = input.instructed.find((candidate) => candidate.consequence === consequence);
    return entry ? [{ consequence, instructionId: entry.instructionId, quote: entry.quote.slice(0, MAX_QUOTE) }] : [];
  });
  return {
    schemaVersion: AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION,
    verdict,
    declared,
    instructed: instructedClasses,
    undeclared,
    beyondInstruction,
    actions: declarations.length,
    declaredNothing,
    quotes,
    sentence: sentenceFor({ verdict, undeclared, beyondInstruction, quotes })
  };
}
