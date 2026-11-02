import type { AutomationStudioActionConsequence } from "../../../../components/automation/action-effect/consequences/index.ts";

/** One class the person's instruction plainly asks for, and the words that ask. */
export type AutomationStudioInstructedConsequence = {
  consequence: AutomationStudioActionConsequence;
  instructionId: string;
  /** `sha256:` of the instruction's title and body as they read when this was derived. */
  instructionDigest: string;
  /** The person's own words, exactly as their instruction has them. */
  quote: string;
};
