/** A required reading that could change the automatic answer, tied to its original capture. */
export type AutomationStudioRecordProcessingMissingEvidence = {
  field: string;
  operator: "where" | "anyOf" | "compare" | "sort" | "columns";
  /** The declaration entry, from zero; `condition` identifies an anyOf group's member. */
  index: number;
  condition?: number;
  /** A derived field's stored source, when the required reading is virtual. */
  from?: string;
  reason: "missing" | "unreadable";
  source: { nodeId: string; batchKey: string; row: number };
};
