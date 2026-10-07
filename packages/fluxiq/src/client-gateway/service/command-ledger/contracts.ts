export type ClientGatewayCommandBinding = {
  schemaVersion: "gateway_command.v1";
  projectId: string;
  runId: string;
  flowId: string;
  invocationId: string;
  attemptId: string;
  effectOrdinal: number;
  commandId: string;
  clientId: string;
  sessionId: string;
};
export type ClientGatewayCommandClaim = { binding: ClientGatewayCommandBinding; requestDigest: string };
export type ClientGatewayCommandReceipt = {
  schemaVersion: "gateway_command_receipt.v1";
  commandId: string;
  requestDigest: string;
  clientId: string;
  sessionId: string;
  status: "succeeded" | "failed" | "rejected" | "cancelled" | "timed_out";
  receivedAt: number;
  resultDigest: string;
  redaction: "receipt_only";
  failureClass?: "action_failed" | "permission_denied" | "cancelled" | "timed_out";
};
export type ClientGatewayCommandUnknownReason = "send_uncertain" | "receipt_commit_uncertain" | "cancelled_before_send" | "timeout" | "disconnected";
export type ClientGatewayCommandRecord = {
  claim: ClientGatewayCommandClaim;
  claimedAt: number;
  state: "pending" | "unknown" | "committed";
  unknownReason: ClientGatewayCommandUnknownReason | null;
  receipt: ClientGatewayCommandReceipt | null;
  committedAt: number | null;
};
/** Trusted server adapter only. Client/model metadata never implements this port. */
export interface ClientGatewayCommandLedgerPort {
  claim(claim: ClientGatewayCommandClaim): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }>;
  commitReceipt(claim: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord>;
  markUnknown(claim: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord>;
  read(claim: ClientGatewayCommandClaim): Promise<ClientGatewayCommandRecord | null>;
}
export type ClientGatewayDurableDispatchResult<TResult> =
  | { status: "completed"; result: TResult; receipt: ClientGatewayCommandReceipt }
  | { status: "result_unavailable"; receipt: ClientGatewayCommandReceipt }
  | { status: "outcome_unknown" };

export type ClientGatewayCommandOutcomeObserver = {
  completed(proof: object): Promise<void>;
  uncertain(context: import("./context.ts").ClientGatewayCommandContext, disposition: string): Promise<void>;
};
export type ClientGatewayCommandCompletion = {
  readonly context: import("./context.ts").ClientGatewayCommandContext;
  readonly claim: ClientGatewayCommandClaim;
  readonly receipt: ClientGatewayCommandReceipt;
  readonly result: import("@fluxiq/contracts/client-gateway").ClientGatewayActionResult;
};
export type ClientGatewayCommandLedgerLease = { ledger: ClientGatewayCommandLedgerPort; outcomeObserver?: ClientGatewayCommandOutcomeObserver; close(): Promise<void> };
export type ClientGatewayDurableActionOptions = { context: import("./context.ts").ClientGatewayCommandContext; signal?: AbortSignal };
export type ClientGatewayDurableActionResponse = {
  commandId: string;
  message: import("@fluxiq/contracts/client-gateway").ClientGatewayServerMessage;
  result: Promise<ClientGatewayDurableDispatchResult<import("@fluxiq/contracts/client-gateway").ClientGatewayActionResult>>;
};
