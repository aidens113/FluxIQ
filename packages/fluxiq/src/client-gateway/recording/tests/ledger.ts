import type { ClientGatewayCommandClaim, ClientGatewayCommandReceipt, ClientGatewayCommandRecord, ClientGatewayCommandUnknownReason, ClientGatewayCommandLedgerPort } from "../../service/command-ledger/index.ts";
import { ClientGatewayCommandLedgerController } from "../../service/command-ledger/index.ts";

export class CaptureCommandLedger implements ClientGatewayCommandLedgerPort {
  record: ClientGatewayCommandRecord | null = null;
  async claim(claim: ClientGatewayCommandClaim) {
    const sendAllowed = this.record === null;
    this.record ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
    ClientGatewayCommandLedgerController.validateRecord(claim, this.record);
    return { sendAllowed, record: this.record };
  }
  async commitReceipt(claim: ClientGatewayCommandClaim, receipt: ClientGatewayCommandReceipt) {
    if (!this.record) throw new Error("test.missing_claim");
    this.record = { ...this.record, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null };
    ClientGatewayCommandLedgerController.validateRecord(claim, this.record);
    return this.record;
  }
  async markUnknown(_claim: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason) {
    if (!this.record) throw new Error("test.missing_claim");
    if (this.record.state !== "committed") this.record = { ...this.record, state: "unknown", unknownReason: reason };
    return this.record;
  }
  async read() { return this.record; }
}
