/** Content-free state transition measured for one evidence-loop trace row. */
export type AutomationStudioLlmEvidenceLoopProgress = {
  draftRevisionBefore: number;
  draftRevisionAfter: number;
  pageState: "changed" | "unchanged" | "unobserved";
  draftState: "changed" | "unchanged";
  answerabilityState: "first_observed" | "changed" | "unchanged" | "unobserved";
};
