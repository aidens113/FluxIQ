export type AutomationStudioCommandLedgerOperation = "claim" | "receipt" | "unknown";
export type AutomationStudioCommandLedgerMutationProof = { commandId: string; operation: AutomationStudioCommandLedgerOperation; proofDigest: string };
/** Informational observations cannot grant admission or consumed-result clearance. */
export type AutomationStudioCommandRunObservation = {
  readonly projectId: string;
  readonly runId: string;
  readonly records: readonly import("../../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandRecord[];
  readonly historicalUnknownCommandIds: readonly string[];
};
export const AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT = 4096;
export const AUTOMATION_STUDIO_COMMAND_SCAN_PAGE = 128;
/** Injected trusted owner resolves only privately registered, same-incarnation tickets. */
export type AutomationStudioCommandConsumptionOwner = {
  resolveConsumed(ticket: object): { claim: import("../../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandClaim; receipt: import("../../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandReceipt } | null;
};
