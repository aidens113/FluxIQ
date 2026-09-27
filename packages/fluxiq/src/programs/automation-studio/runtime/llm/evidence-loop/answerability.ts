/** Content-free capability facts observed while checking a completed plan. */
export type AutomationStudioLlmEvidenceLoopAnswerability = {
  recordsRequested: boolean;
  recordProducerPresent: boolean;
  recordStorePresent: boolean;
  issueCode?: "bootstrap.cannot_answer_instruction";
};
