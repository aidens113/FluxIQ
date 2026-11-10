import type { GraphPatchOperation } from "../../../../api-contracts/automation/index.ts";

/**
 * The patch an edit makes, with the plain message its revision is saved
 * under, or why it cannot be made, in words a person reads.
 */
export type OutlineEditResult = { ok: true; operations: GraphPatchOperation[]; message: string } | { ok: false; reason: string };
