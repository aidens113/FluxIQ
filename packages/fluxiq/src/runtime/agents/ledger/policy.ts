/** A program binds its receipt vocabulary without coupling the ledger to a task schema. */
export type ModelReceiptPolicy = {
  isTaskKind(value: unknown): value is string;
  isStage(value: unknown): value is string;
};

export type ModelRunLedgerPolicy = ModelReceiptPolicy & {
  defaultCostCeilingUsd: number;
  maxCallsPerRun: number;
  recordLimit: number;
};
