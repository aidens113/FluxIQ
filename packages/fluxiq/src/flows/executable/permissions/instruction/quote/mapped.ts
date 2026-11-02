import type { AutomationStudioInstructionTextSpan } from "./span.ts";

/** The comparison text, and where any range of it came from in the original. */
export type AutomationStudioMappedInstructionText = {
  /** Exactly `automationStudioComparableInstructionText` of the original. */
  readonly text: string;
  /** The original interval the compared range `[from, to)` came from; `from < to` within `text`. */
  span(from: number, to: number): AutomationStudioInstructionTextSpan;
};
