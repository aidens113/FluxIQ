export type AutomationStudioCommandLedgerOperation = "claim" | "receipt" | "unknown";
export type AutomationStudioCommandLedgerMutationProof = { commandId: string; operation: AutomationStudioCommandLedgerOperation; proofDigest: string };
