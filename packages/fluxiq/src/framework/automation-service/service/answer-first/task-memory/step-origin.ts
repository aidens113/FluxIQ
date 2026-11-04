/** Where one step of an attempt's Flow came from, and what its Flow run did with it. */
export type AutomationStudioAnswerFirstStepOrigin = {
  position: number;
  label?: string;
  /** saved: same as a step the attempt started with; worked_out: new or changed in this attempt. */
  from: "saved" | "worked_out";
  ran?: "passed" | "failed" | "skipped" | "not_reached";
};
