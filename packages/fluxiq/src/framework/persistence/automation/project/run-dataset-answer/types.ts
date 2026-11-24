/**
 * A collected row as processing reads it, joined to its batch's node and the field ids that batch's own read captured
 * (`captured_fields_json`, migration 0041, t998): null for a batch written before it, or a row whose batch is missing.
 */
export type AutomationStudioRunDatasetCollectedRow = { attempt_id: string; batch_key: string; node_id: string; row_json: string; captured_fields_json?: string | null };

/** One row to store, in either rows table. */
export type AutomationStudioRunDatasetRowInsert = { ordinal: number; attemptId: string; batchKey: string; rowJson: string };
