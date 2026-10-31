import { clientGatewayCanonicalDigest } from "./canonical-digest.ts";
import type { ClientGatewayCommandBinding, ClientGatewayCommandClaim, ClientGatewayCommandLedgerPort, ClientGatewayCommandReceipt, ClientGatewayCommandRecord, ClientGatewayCommandUnknownReason, ClientGatewayDurableDispatchResult } from "./contracts.ts";

/** Small-record validation and durable ledger dispatch for the gateway and executor. */
export class ClientGatewayCommandLedgerController {
  static readonly HASH_LIMIT_BYTES = 256 * 1024;
  static readonly HASH_MAX_DEPTH = 64;
  static readonly HASH_MAX_NODES = 65_536;
  constructor(private readonly ledger: ClientGatewayCommandLedgerPort) {}
  /** Exact bounded plain JSON: array order retained; object keys sorted by Unicode code point. */
  static digest(value: unknown): string {
    return clientGatewayCanonicalDigest(value, { maxBytes: this.HASH_LIMIT_BYTES, maxDepth: this.HASH_MAX_DEPTH, maxNodes: this.HASH_MAX_NODES });
  }
  static commandId(owner: Pick<ClientGatewayCommandBinding, "projectId" | "runId" | "flowId" | "invocationId" | "attemptId" | "effectOrdinal">): string {
    const { projectId, runId, flowId, invocationId, attemptId, effectOrdinal } = owner;
    for (const id of [projectId, runId, flowId, invocationId, attemptId]) this.id(id);
    this.time(effectOrdinal);
    return `command.${this.digest({ projectId, runId, flowId, invocationId, attemptId, effectOrdinal }).slice(7)}`;
  }
  static validateClaim(claim: ClientGatewayCommandClaim): void {
    this.keys(claim, ["binding", "requestDigest"]); this.hash(claim.requestDigest);
    const binding = claim.binding;
    this.keys(binding, ["schemaVersion", "projectId", "runId", "flowId", "invocationId", "attemptId", "effectOrdinal", "commandId", "clientId", "sessionId"]);
    if (binding.schemaVersion !== "gateway_command.v1" || binding.commandId !== this.commandId(binding)) throw new Error("command_ledger.invalid_binding");
    this.id(binding.clientId); this.id(binding.sessionId);
  }
  static validateReceipt(claim: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt): void {
    this.validateClaim(claim);
    this.keys(receipt, ["schemaVersion", "commandId", "requestDigest", "clientId", "sessionId", "status", "receivedAt", "resultDigest", "redaction"], ["failureClass"]);
    if (receipt.schemaVersion !== "gateway_command_receipt.v1" || receipt.commandId !== claim.binding.commandId || receipt.requestDigest !== claim.requestDigest || receipt.clientId !== claim.binding.clientId || receipt.sessionId !== claim.binding.sessionId || receipt.redaction !== "receipt_only") throw new Error("command_ledger.receipt_binding_conflict");
    if (!["succeeded", "failed", "rejected", "cancelled", "timed_out"].includes(receipt.status) || receipt.failureClass !== undefined && !["action_failed", "permission_denied", "cancelled", "timed_out"].includes(receipt.failureClass)) throw new Error("command_ledger.invalid_receipt_status");
    this.time(receipt.receivedAt); this.hash(receipt.resultDigest);
  }
  static validateRecord(claim: ClientGatewayCommandClaim, record: ClientGatewayCommandRecord): void {
    this.keys(record, ["claim", "claimedAt", "state", "unknownReason", "receipt", "committedAt"]);
    this.validateClaim(record.claim); this.time(record.claimedAt);
    if (this.digest(claim) !== this.digest(record.claim)) throw new Error("command_ledger.claim_conflict");
    if (record.state === "committed") {
      if (!record.receipt || record.committedAt === null || record.unknownReason !== null) throw new Error("command_ledger.invalid_record");
      this.validateReceipt(claim, record.receipt); this.time(record.committedAt);
      if (record.receipt.receivedAt < record.claimedAt || record.committedAt < record.receipt.receivedAt) throw new Error("command_ledger.invalid_receipt_time");
    } else if (record.receipt !== null || record.committedAt !== null || record.state === "pending" && record.unknownReason !== null || record.state === "unknown" && !this.unknownReason(record.unknownReason) || !["pending", "unknown"].includes(record.state)) throw new Error("command_ledger.invalid_record");
  }
  static unknownReason(value: unknown): value is ClientGatewayCommandUnknownReason { return typeof value === "string" && ["send_uncertain", "receipt_commit_uncertain", "cancelled_before_send", "timeout", "disconnected"].includes(value); }
  private static keys(value: unknown, required: string[], optional: string[] = []): void {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || required.some(key => !Object.hasOwn(value, key)) || Reflect.ownKeys(value).some(key => typeof key !== "string" || !required.includes(key) && !optional.includes(key))) throw new Error("command_ledger.invalid_fields");
    if (Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) throw new Error("command_ledger.invalid_fields");
  }
  private static id(value: string): void { if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(value)) throw new Error("command_ledger.invalid_id"); }
  private static hash(value: string): void { if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("command_ledger.invalid_digest"); }
  private static time(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new Error("command_ledger.invalid_number"); }
  private static frozenClone<T extends ClientGatewayCommandClaim | ClientGatewayCommandReceipt>(value: T): T {
    const cloned = structuredClone(value);
    const freeze = (item: unknown): void => {
      if (!item || typeof item !== "object") return;
      for (const nested of Object.values(item)) freeze(nested);
      Object.freeze(item);
    };
    // Only validated bounded claim/receipt shapes reach this recursion; opaque live results never do.
    freeze(cloned); return cloned;
  }
  async dispatch<TResult>(input: ClientGatewayCommandClaim, send: () => Promise<{ result: TResult; receipt: ClientGatewayCommandReceipt }>, signal?: AbortSignal): Promise<ClientGatewayDurableDispatchResult<TResult>> {
    ClientGatewayCommandLedgerController.validateClaim(input);
    const claim = ClientGatewayCommandLedgerController.frozenClone(input), claimed = await this.ledger.claim(claim);
    ClientGatewayCommandLedgerController.validateRecord(claim, claimed.record);
    if (!claimed.sendAllowed) return this.reconciled(claimed.record);
    if (claimed.record.state !== "pending") throw new Error("command_ledger.invalid_send_authority");
    if (signal?.aborted) { await this.ledger.markUnknown(claim, "cancelled_before_send"); return { status: "outcome_unknown" }; }
    let answer: Awaited<ReturnType<typeof send>>;
    try {
      const live = await send(); ClientGatewayCommandLedgerController.validateReceipt(claim, live.receipt);
      answer = { result: live.result, receipt: ClientGatewayCommandLedgerController.frozenClone(live.receipt) };
    }
    catch { await this.ledger.markUnknown(claim, "send_uncertain"); return { status: "outcome_unknown" }; }
    try { await this.ledger.commitReceipt(claim, answer.receipt); }
    catch {
      const recorded = await this.ledger.read(claim);
      if (!recorded || recorded.state !== "committed") { await this.ledger.markUnknown(claim, "receipt_commit_uncertain"); return { status: "outcome_unknown" }; }
    }
    const committed = await this.ledger.read(claim);
    if (!committed) throw new Error("command_ledger.missing_committed_receipt");
    ClientGatewayCommandLedgerController.validateRecord(claim, committed);
    if (committed.state !== "committed" || ClientGatewayCommandLedgerController.digest(committed.receipt) !== ClientGatewayCommandLedgerController.digest(answer.receipt)) throw new Error("command_ledger.receipt_conflict");
    return { status: "completed", result: answer.result, receipt: committed.receipt! };
  }
  private reconciled<TResult>(record: ClientGatewayCommandRecord): ClientGatewayDurableDispatchResult<TResult> { return record.state === "committed" ? { status: "result_unavailable", receipt: record.receipt! } : { status: "outcome_unknown" }; }
}
