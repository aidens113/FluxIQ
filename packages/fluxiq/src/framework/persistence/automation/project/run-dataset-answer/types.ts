/** A collected row as processing reads it, joined to its batch's node. */
export type AutomationStudioRunDatasetCollectedRow = { attempt_id: string; batch_key: string; node_id: string; row_json: string };

/** One row to store, in either rows table. */
export type AutomationStudioRunDatasetRowInsert = { ordinal: number; attemptId: string; batchKey: string; rowJson: string };
