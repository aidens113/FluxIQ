// One lasting act the run completed, as its completed-act ledger keeps it
// (state-aware recovery plan, C5; t411).

import type { JsonValue } from "../../../../../core/index.ts";

/**
 * A lasting act that completed in this run: an attempt that succeeded, or a
 * failed one the run settled as done (its expected state already held, or its
 * effect check said `landed`).
 *
 * - `key`: the act's identity (`./act-identity.ts`), which the ledger is keyed by.
 * - `nodeId`, `attemptId`: where it ran, and the attempt that did it.
 * - `outputs`: what that attempt produced, which a later skip of the same act
 *   hands on, so the steps after it read what they read the first time.
 * - `row`: the row the act ran on, as a person reads it, when it ran per row.
 *
 * Held in memory for the run only (`./run-state.ts`); never persisted.
 */
export type AutomationStudioCompletedAct = {
  key: string;
  nodeId: string;
  attemptId: string;
  outputs: Readonly<Record<string, JsonValue>>;
  row?: string;
};
