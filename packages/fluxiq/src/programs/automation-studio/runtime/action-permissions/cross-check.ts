// Holding what a run declared against what the person's instruction asked for.
//
// Two numbers were already computed in the same gate, on the same build, and
// nothing ever compared them: the classes each action declared for itself, and
// the classes the person's own instruction was read as asking for
// (`instructed.ts`). Measured live on 2026-09-22, that gap is what let a build
// whose instruction says "Schedule a post ... saying: Trail clean-up on
// Saturday" author a Flow whose every press declared that it causes nothing
// lasting, and finish with every check green. Neither side can see that alone:
// the gate had nothing to refuse, because nothing was declared; the derivation
// was never run, because nothing was declared.
//
// **What this is not.** It does not read a control, a label, a URL or a node
// id. FluxIQ deleted its word list of dangerous-looking buttons on 2026-09-18
// because it made not one state-changing job possible, and nothing here brings
// it back under another name. The only two things compared are what the model
// said about its own action and what the model read the person's own words to
// ask for -- both self-report, cross-examined against each other.
//
// **What a disagreement does, and why it does no more.**
//
// 1. **It never refuses the build and never grants anything.** The instruction
//    is the authority for *permitting*, so a class the instruction asks for was
//    already allowed: an under-declaration bypasses no permission, and refusing
//    the build would be Core overruling the person's own instruction on Core's
//    reading of their words. A Flow that was built is a Flow worth having.
// 2. **It is recorded on what the person approves.** The proposal carries the
//    finding, the classes on both sides, and the person's own quoted words, so
//    approving the Flow means approving it in full sight of the contradiction.
// 3. **It is said out loud in the thread**, where a caller has one, because a
//    finding filed where nobody is shown it is the anti-pattern this product
//    has already been corrected on once. The build does not wait for the
//    answer: it has a Flow, and the question is about applying it.
//
// **Which direction matters.** A class declared that the instruction does not
// ask for is already handled -- the gate refuses it and raises a request, and a
// person answers. The direction nothing else catches is the other one: the
// instruction plainly asks for something lasting, actions that commit ran, and
// every one of them said it would cause nothing.

import { automationStudioConsequencesInOrder, type AutomationStudioActionConsequence } from "./consequences.ts";
import { automationStudioDeclaredConsequences, automationStudioDeclaredNothingLasting, type AutomationStudioActionDeclarationRecord } from "./declared.ts";
import type { AutomationStudioInstructedConsequence } from "./instructed.ts";

export const AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION = "automation-studio.action-declaration-cross-check.v1";

/** How much of the person's own words the finding carries per class. */
const MAX_QUOTE = 300;

/**
 * Core's reading of the two answers together.
 *
 * `not_comparable` is the honest ending when no action was ever put to the
 * gate: a build that only read a page declared nothing because it did nothing,
 * and calling that a contradiction would make every extraction Flow suspect.
 */
export type AutomationStudioActionDeclarationCrossCheckVerdict = "agreed" | "undeclared" | "beyond_instruction" | "not_comparable";

export type AutomationStudioActionDeclarationCrossCheck = {
  schemaVersion: typeof AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION;
  verdict: AutomationStudioActionDeclarationCrossCheckVerdict;
  /** Every class any action declared for itself, in Core's order. */
  declared: AutomationStudioActionConsequence[];
  /** Every class the person's instruction was read as asking for. */
  instructed: AutomationStudioActionConsequence[];
  /** Asked for by the instruction and declared by nothing. The finding. */
  undeclared: AutomationStudioActionConsequence[];
  /** Declared, and not among what the instruction asks for. Already gated; recorded for completeness. */
  beyondInstruction: AutomationStudioActionConsequence[];
  /** How many actions were put to the gate at all. */
  actions: number;
  /** How many of them acted and said they would cause nothing lasting. A read is not one of them. */
  declaredNothing: number;
  /** The person's own words, for each class in `undeclared`. */
  quotes: Array<{ consequence: AutomationStudioActionConsequence; instructionId: string; quote: string }>;
  /** Core's own sentence for the finding. Never a model's. */
  sentence: string;
};

export function automationStudioActionDeclarationCrossCheck(input: {
  declarations: readonly AutomationStudioActionDeclarationRecord[];
  instructed: readonly AutomationStudioInstructedConsequence[];
}): AutomationStudioActionDeclarationCrossCheck {
  const declared = automationStudioDeclaredConsequences(input.declarations);
  const instructedClasses = automationStudioConsequencesInOrder(input.instructed.map((entry) => entry.consequence));
  const undeclared = input.declarations.length
    ? instructedClasses.filter((consequence) => !declared.includes(consequence))
    : [];
  const beyondInstruction = declared.filter((consequence) => !instructedClasses.includes(consequence));
  const declaredNothing = automationStudioDeclaredNothingLasting(input.declarations).length;
  const verdict: AutomationStudioActionDeclarationCrossCheckVerdict = !input.declarations.length
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
    actions: input.declarations.length,
    declaredNothing,
    quotes,
    sentence: sentenceFor({ verdict, undeclared, beyondInstruction, actions: input.declarations.length, declaredNothing })
  };
}

/** One plain sentence a person can act on, in Core's words. */
function sentenceFor(input: {
  verdict: AutomationStudioActionDeclarationCrossCheckVerdict;
  undeclared: readonly AutomationStudioActionConsequence[];
  beyondInstruction: readonly AutomationStudioActionConsequence[];
  actions: number;
  declaredNothing: number;
}): string {
  if (input.verdict === "not_comparable") return "No action was put to the permission gate, so there is nothing to compare with the instruction.";
  const steps = `${input.actions} action${input.actions === 1 ? "" : "s"}`;
  if (input.verdict === "undeclared") {
    return `The instruction asks for ${list(input.undeclared)}, and none of this run's ${steps} said it would cause that; ${input.declaredNothing} of them said they would cause nothing lasting.`;
  }
  if (input.verdict === "beyond_instruction") {
    return `This run's ${steps} declared ${list(input.beyondInstruction)}, which the instruction does not ask for.`;
  }
  return `What this run's ${steps} declared matches what the instruction asks for.`;
}

function list(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "nothing";
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}
