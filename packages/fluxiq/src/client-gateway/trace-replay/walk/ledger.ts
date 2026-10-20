// The command ledger a replayed gateway's durable commands are claimed in
// (traces and offline trials, P3): in memory, private to one replay, so a
// replay never touches a run's real ledger and its durable commands go
// through the same claim, send and commit as live ones.

import type {
  ClientGatewayCommandClaim,
  ClientGatewayCommandLedgerPort,
  ClientGatewayCommandReceipt,
  ClientGatewayCommandRecord,
  ClientGatewayCommandUnknownReason
} from "../../service/index.ts";

export class ClientGatewayTraceReplayLedger implements ClientGatewayCommandLedgerPort {
  private readonly records = new Map<string, ClientGatewayCommandRecord>();
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  async claim(claim: ClientGatewayCommandClaim): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> {
    const existing = this.records.get(claim.binding.commandId);
    if (existing !== undefined) return { sendAllowed: false, record: existing };
    const record: ClientGatewayCommandRecord = { claim: structuredClone(claim), claimedAt: this.now(), state: "pending", unknownReason: null, receipt: null, committedAt: null };
    this.records.set(claim.binding.commandId, record);
    return { sendAllowed: true, record };
  }

  async commitReceipt(claim: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> {
    const record: ClientGatewayCommandRecord = { claim: structuredClone(claim), claimedAt: this.require(claim).claimedAt, state: "committed", unknownReason: null, receipt: structuredClone(receipt), committedAt: this.now() };
    this.records.set(claim.binding.commandId, record);
    return record;
  }

  async markUnknown(claim: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> {
    const current = this.require(claim);
    if (current.state === "committed") return current;
    const record: ClientGatewayCommandRecord = { ...current, state: "unknown", unknownReason: reason };
    this.records.set(claim.binding.commandId, record);
    return record;
  }

  async read(claim: ClientGatewayCommandClaim): Promise<ClientGatewayCommandRecord | null> {
    return this.records.get(claim.binding.commandId) ?? null;
  }

  private require(claim: ClientGatewayCommandClaim): ClientGatewayCommandRecord {
    const record = this.records.get(claim.binding.commandId);
    if (record === undefined) throw new Error(`command ${claim.binding.commandId} was never claimed in this replay`);
    return record;
  }
}
