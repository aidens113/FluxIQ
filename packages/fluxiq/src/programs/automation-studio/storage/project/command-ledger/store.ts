import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandReceipt, type ClientGatewayCommandRecord, type ClientGatewayCommandUnknownReason } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioProjectUnitOfWork } from "../unit-of-work.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import type { AutomationStudioCommandLedgerMutationProof, AutomationStudioCommandLedgerOperation } from "./contracts.ts";
import { AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION } from "./migration.ts";

type ClaimRow = { command_id: string; claim_json: string; proof_digest: string; claimed_at_ms: number };
type ReceiptRow = { command_id: string; receipt_json: string; proof_digest: string; committed_at_ms: number };
type UnknownRow = { command_id: string; reason: ClientGatewayCommandUnknownReason; proof_digest: string };
/** Internal receipt-only infrastructure; no production gateway currently injects this port. */
export class AutomationStudioProjectCommandLedgerStore implements ClientGatewayCommandLedgerPort {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease, private readonly unitOfWork: AutomationStudioProjectUnitOfWork) {}
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectCommandLedgerStore> {
    const lease = await input.pool.acquire(input.projectId);
    let unitOfWork: AutomationStudioProjectUnitOfWork | undefined;
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION] }).migrate();
      unitOfWork = await AutomationStudioProjectUnitOfWork.open(input);
      return new AutomationStudioProjectCommandLedgerStore(lease, unitOfWork);
    } catch (error) { await unitOfWork?.close(); await lease.release(); throw error; }
  }
  async close(): Promise<void> { try { await this.unitOfWork.close(); } finally { await this.lease.release(); } }
  async claim(input: ClientGatewayCommandClaim): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> {
    const claim = this.prepare(input), commandId = claim.binding.commandId;
    const outcome = await this.unitOfWork.runIdempotent(this.mutation(claim, "claim", claim), async context => {
      const claimedAt = context.changedAt, proofDigest = Rules.digest({ claim, claimedAt });
      await context.sql.run("insert into gateway_command_claims(command_id,claim_json,proof_digest,claimed_at_ms) values(?,?,?,?)", [commandId, JSON.stringify(claim), proofDigest, claimedAt]);
      return { commandId, operation: "claim" as const, proofDigest };
    });
    const record = await this.required(claim);
    await this.verifyReturned(claim, "claim", outcome.response);
    return { sendAllowed: !outcome.replayed && record.state === "pending", record };
  }
  async commitReceipt(input: ClientGatewayCommandClaim, inputReceipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> {
    const claim = this.prepare(input), receipt = structuredClone(inputReceipt);
    Rules.validateReceipt(claim, receipt);
    const outcome = await this.unitOfWork.runIdempotent(this.mutation(claim, "receipt", { claim, receipt }), async context => {
      const current = await this.readChecked(claim, context.sql);
      if (!current) throw new Error("command_ledger.missing_claim");
      const committedAt = context.changedAt, proofDigest = Rules.digest({ claim, receipt, committedAt });
      Rules.validateRecord(claim, { ...current, state: "committed", receipt, committedAt, unknownReason: null });
      await context.sql.run("insert into gateway_command_receipts(command_id,receipt_json,proof_digest,committed_at_ms) values(?,?,?,?)", [claim.binding.commandId, JSON.stringify(receipt), proofDigest, committedAt]);
      return { commandId: claim.binding.commandId, operation: "receipt" as const, proofDigest };
    });
    const record = await this.required(claim);
    if (Rules.digest(record.receipt) !== Rules.digest(receipt)) throw new Error("command_ledger.receipt_conflict");
    await this.verifyReturned(claim, "receipt", outcome.response);
    return record;
  }
  async markUnknown(input: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> {
    const claim = this.prepare(input);
    if (!Rules.unknownReason(reason)) throw new Error("command_ledger.invalid_unknown_reason");
    // A committed receipt always wins; never downgrade or overwrite it on timeout/cancel.
    const before = await this.required(claim);
    if (before.state === "committed") return before;
    const outcome = await this.unitOfWork.runIdempotent(this.mutation(claim, "unknown", { claim, reason }), async context => {
      const current = await this.readChecked(claim, context.sql);
      if (!current) throw new Error("command_ledger.missing_claim");
      const proofDigest = Rules.digest({ claim, reason });
      await context.sql.run("insert into gateway_command_unknowns(command_id,reason,proof_digest) values(?,?,?)", [claim.binding.commandId, reason, proofDigest]);
      return { commandId: claim.binding.commandId, operation: "unknown" as const, proofDigest };
    });
    const record = await this.required(claim);
    await this.verifyReturned(claim, "unknown", outcome.response);
    return record;
  }
  read(input: ClientGatewayCommandClaim): Promise<ClientGatewayCommandRecord | null> {
    const claim = this.prepare(input);
    return this.lease.database.transaction(sql => this.readChecked(claim, sql));
  }
  private prepare(input: ClientGatewayCommandClaim): ClientGatewayCommandClaim {
    Rules.validateClaim(input);
    if (input.binding.projectId !== this.lease.projectId) throw new Error("command_ledger.project_conflict");
    return structuredClone(input);
  }
  private mutation(claim: ClientGatewayCommandClaim, operation: AutomationStudioCommandLedgerOperation, request: unknown) {
    return { mutationId: `${claim.binding.commandId}.${operation}`, operationKind: `gateway_command.${operation}`, ownerKind: "gateway_command", ownerId: claim.binding.commandId, requestDigest: Rules.digest(request) };
  }
  private async required(claim: ClientGatewayCommandClaim): Promise<ClientGatewayCommandRecord> {
    const record = await this.read(claim); if (!record) throw new Error("command_ledger.missing_claim"); return record;
  }
  private async verifyReturned(claim: ClientGatewayCommandClaim, operation: AutomationStudioCommandLedgerOperation, response: AutomationStudioCommandLedgerMutationProof): Promise<void> {
    const record = await this.unitOfWork.getMutation(`${claim.binding.commandId}.${operation}`);
    if (!record || record.responseJson === null || Rules.digest(JSON.parse(record.responseJson)) !== Rules.digest(response)) throw new Error("command_ledger.mutation_result_conflict");
    // readChecked validates the historical row's original request, owner, operation and proof, independently of this response.
    await this.required(claim);
  }
  private async readChecked(claim: ClientGatewayCommandClaim, sql: AutomationStudioSqlExecutor): Promise<ClientGatewayCommandRecord | null> {
    const commandId = claim.binding.commandId, row = await sql.get<ClaimRow>("select * from gateway_command_claims where command_id=?", [commandId]);
    if (!row) { await this.verifyAbsent(sql, commandId, "claim"); return null; }
    const original = this.decode<ClientGatewayCommandClaim>(row.claim_json); Rules.validateClaim(original);
    if (Rules.digest(original) !== Rules.digest(claim)) throw new Error("command_ledger.claim_conflict");
    const claimProof = Rules.digest({ claim: original, claimedAt: row.claimed_at_ms });
    if (row.command_id !== commandId || row.proof_digest !== claimProof) throw new Error("command_ledger.corrupt_claim");
    await this.verifyMutation(sql, claim, "claim", original, claimProof);
    const ack = await sql.get<ReceiptRow>("select * from gateway_command_receipts where command_id=?", [commandId]);
    const unknown = await sql.get<UnknownRow>("select * from gateway_command_unknowns where command_id=?", [commandId]);
    if (!ack) await this.verifyAbsent(sql, commandId, "receipt");
    if (!unknown) await this.verifyAbsent(sql, commandId, "unknown");
    let receipt: ClientGatewayCommandReceipt | null = null;
    if (ack) {
      receipt = this.decode<ClientGatewayCommandReceipt>(ack.receipt_json); Rules.validateReceipt(claim, receipt);
      const proof = Rules.digest({ claim, receipt, committedAt: ack.committed_at_ms });
      if (ack.command_id !== commandId || ack.proof_digest !== proof) throw new Error("command_ledger.corrupt_receipt");
      await this.verifyMutation(sql, claim, "receipt", { claim, receipt }, proof);
    }
    if (unknown) {
      if (!Rules.unknownReason(unknown.reason) || unknown.command_id !== commandId || unknown.proof_digest !== Rules.digest({ claim, reason: unknown.reason })) throw new Error("command_ledger.corrupt_unknown");
      await this.verifyMutation(sql, claim, "unknown", { claim, reason: unknown.reason }, unknown.proof_digest);
    }
    const record: ClientGatewayCommandRecord = { claim: original, claimedAt: row.claimed_at_ms, state: ack ? "committed" : unknown ? "unknown" : "pending", receipt, committedAt: ack?.committed_at_ms ?? null, unknownReason: ack ? null : unknown?.reason ?? null };
    Rules.validateRecord(claim, record);
    return record;
  }
  private async verifyMutation(sql: AutomationStudioSqlExecutor, claim: ClientGatewayCommandClaim, operation: AutomationStudioCommandLedgerOperation, request: unknown, proofDigest: string): Promise<void> {
    const expected = this.mutation(claim, operation, request);
    const row = await sql.get<{ owner_kind: string; owner_id: string; operation_kind: string; request_digest: string; status: string; response_json: string | null }>("select * from mutation_records where mutation_id=?", [expected.mutationId]);
    const response = row?.response_json ? this.decode<AutomationStudioCommandLedgerMutationProof>(row.response_json) : null;
    if (!row || row.owner_kind !== expected.ownerKind || row.owner_id !== expected.ownerId || row.operation_kind !== expected.operationKind || row.request_digest !== expected.requestDigest || row.status !== "committed" || !response || Rules.digest(response) !== Rules.digest({ commandId: claim.binding.commandId, operation, proofDigest })) throw new Error("command_ledger.corrupt_mutation_join");
  }
  private async verifyAbsent(sql: AutomationStudioSqlExecutor, commandId: string, operation: AutomationStudioCommandLedgerOperation): Promise<void> {
    const row = await sql.get<{ status: string }>("select status from mutation_records where mutation_id=?", [`${commandId}.${operation}`]);
    if (row?.status === "committed") throw new Error("command_ledger.missing_historical_join");
  }
  private decode<T>(json: string): T { if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > 8192) throw new Error("command_ledger.invalid_record_size"); return JSON.parse(json) as T; }
}
