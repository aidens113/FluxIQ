import { createHash } from "node:crypto";
import type { ClientGatewayCommandBinding, ClientGatewayCommandClaim, ClientGatewayCommandLedgerPort, ClientGatewayCommandReceipt, ClientGatewayCommandRecord, ClientGatewayCommandUnknownReason, ClientGatewayDurableDispatchResult } from "./contracts.ts";

/** Infrastructure only: production gateway/executor callers are not wired to this controller. */
export class ClientGatewayCommandLedgerController {
  static readonly HASH_LIMIT_BYTES = 256 * 1024;
  static readonly HASH_MAX_DEPTH = 64;
  static readonly HASH_MAX_NODES = 65_536;
  constructor(private readonly ledger: ClientGatewayCommandLedgerPort) {}
  /** Exact bounded plain JSON: array order retained; object keys sorted by Unicode code point. */
  static digest(value: unknown): string {
    const hash = createHash("sha256"), ancestors = new Set<object>(); let bytes = 0, nodes = 0;
    const append = (text: string) => {
      bytes += Buffer.byteLength(text, "utf8");
      if (bytes > this.HASH_LIMIT_BYTES) throw new Error("command_ledger.hash_size_limit");
      hash.update(text);
    };
    const compareKeys = (left: string, right: string): number => {
      const a = Array.from(left, char => char.codePointAt(0)!), b = Array.from(right, char => char.codePointAt(0)!);
      for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index]! - b[index]!;
      return a.length - b.length;
    };
    const visit = (item: unknown, depth: number): void => {
      if (depth > this.HASH_MAX_DEPTH || ++nodes > this.HASH_MAX_NODES) throw new Error("command_ledger.hash_structure_limit");
      if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) { append(JSON.stringify(item)); return; }
      if (typeof item !== "object" || ancestors.has(item)) throw new Error("command_ledger.invalid_digest_value");
      const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error("command_ledger.nonplain_digest_value");
      const ownKeys = Reflect.ownKeys(item);
      if (ownKeys.some(key => typeof key !== "string") || ownKeys.length > this.HASH_MAX_NODES + 1) throw new Error("command_ledger.invalid_digest_fields");
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const fields = (ownKeys as string[]).filter(key => !array || key !== "length");
      if (fields.some(key => !descriptors[key]!.enumerable || !Object.hasOwn(descriptors[key]!, "value"))) throw new Error("command_ledger.invalid_digest_fields");
      if (array && (item.length > this.HASH_MAX_NODES || fields.length !== item.length || fields.some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length))) throw new Error("command_ledger.invalid_digest_array");
      ancestors.add(item); append(array ? "[" : "{");
      const keys = array ? Array.from({ length: item.length }, (_, index) => String(index)) : fields.sort(compareKeys);
      keys.forEach((key, index) => {
        if (index) append(",");
        if (!array) { append(JSON.stringify(key)); append(":"); }
        visit(descriptors[key]!.value, depth + 1);
      });
      append(array ? "]" : "}"); ancestors.delete(item);
    };
    visit(value, 0);
    return `sha256:${hash.digest("hex")}`;
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
