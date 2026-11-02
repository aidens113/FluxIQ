import type { AUTOMATION_STUDIO_ACTION_DECLARATION_CROSS_CHECK_SCHEMA_VERSION } from "./schema.ts";
import type { AutomationStudioActionDeclarationCrossCheckVerdict } from "./verdict.ts";
import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

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
  /** How many actions were put to the gate at all, replays of the draft included. A record, never said to the person. */
  actions: number;
  /** How many of them acted and said they would cause nothing lasting. A read is not one of them. */
  declaredNothing: number;
  /** The person's own words, for each class in `undeclared`. */
  quotes: Array<{ consequence: AutomationStudioActionConsequence; instructionId: string; quote: string }>;
  /** Core's own sentence for the finding. Never a model's. */
  sentence: string;
};
