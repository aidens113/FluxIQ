import type { AutomationStudioInstructionTextSpan } from "../quote/index.ts";

/** One place on a named route, in the order the read gave. */
export type AutomationStudioInstructionRouteWaypoint = {
  /** Core's id for these words at this place in this instruction text. */
  id: string;
  /** 1 for the first place to visit. */
  order: number;
  instructionId: string;
  instructionDigest: string;
  /** The person's own words, as the instruction has them at `sourceSpan`. */
  quote: string;
  /** Where in `title + "\n" + body`: UTF-16 code units, half-open. */
  sourceSpan: AutomationStudioInstructionTextSpan;
};
