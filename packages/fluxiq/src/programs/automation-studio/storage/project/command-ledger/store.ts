import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandReceipt, type ClientGatewayCommandRecord, type ClientGatewayCommandUnknownReason } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "../database.ts";
import { AutomationStudioProjectUnitOfWork } from "../unit-of-work.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { AUTOMATION_STUDIO_COMMAND_SCAN_LIMIT as SCAN_LIMIT, AUTOMATION_STUDIO_COMMAND_SCAN_PAGE as SCAN_PAGE, type AutomationStudioCommandRunObservation, type AutomationStudioCommandLedgerMutationProof, type AutomationStudioCommandLedgerOperation, type AutomationStudioCommandConsumptionOwner } from "./contracts.ts";
import { AutomationStudioCommandRunAdmission } from "./admission.ts";
import { AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION } from "./migration.ts";

type ClaimRow = { command_id: string; claim_json: string; proof_digest: string; claimed_at_ms: number };
type ReceiptRow = { command_id: string; receipt_json: string; proof_digest: string; committed_at_ms: number };
type UnknownRow = { command_id: string; reason: ClientGatewayCommandUnknownReason; proof_digest: string };
/** Receipt-only project storage; closed run admission is not wired to Flow execution. */
export class AutomationStudioProjectCommandLedgerStore implements ClientGatewayCommandLedgerPort {
  private readonly admissions = new WeakMap<AutomationStudioCommandRunAdmission, { runId: string; first: ClientGatewayCommandClaim | null; owner?: AutomationStudioCommandConsumptionOwner; consumed: Map<string, { ticket: object; claim: ClientGatewayCommandClaim; receipt: ClientGatewayCommandReceipt }> }>();
  private readonly pipelines = new Set<Promise<unknown>>();
  private closed = false;
  private closing?: Promise<void>;
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
  close(): Promise<void> {
    this.closed = true;
    this.closing ??= (async () => { await Promise.allSettled([...this.pipelines]); const errors: unknown[] = []; try { await this.unitOfWork.close(); } catch (error) { errors.push(error); } try { await this.lease.release(); } catch (error) { errors.push(error); } if (errors.length) throw new AggregateError(errors, "command_ledger.close_failed"); })();
    return this.closing;
  }
  readRun(runId: string): Promise<AutomationStudioCommandRunObservation> {
    this.runId(runId);
    return this.pipeline(() => this.lease.database.transaction(sql => this.scanRun(sql, runId)));
  }
  openRunAdmission(runId: string, owner?: AutomationStudioCommandConsumptionOwner): Promise<AutomationStudioCommandRunAdmission> {
    this.runId(runId);
    if (owner !== undefined && (!owner || typeof owner.resolveConsumed !== "function")) throw new Error("command_ledger.invalid_consumption_owner");
    return this.pipeline(async () => {
      const observed = await this.lease.database.transaction(sql => this.scanRun(sql, runId));
      if (observed.records.length) throw new Error("command_ledger.prior_run_claim");
      if (this.closed) throw new Error("command_ledger.closed");
      const admission = AutomationStudioCommandRunAdmission.create(); this.admissions.set(admission, { runId, first: null, ...(owner ? { owner } : {}), consumed: new Map() }); return admission;
    });
  }
  claimForRun(input: ClientGatewayCommandClaim, admission: AutomationStudioCommandRunAdmission): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> {
    const claim = this.prepare(input), registered = this.admissions.get(admission);
    if (!registered || claim.binding.runId !== registered.runId) throw new Error("command_ledger.foreign_admission");
    if (registered.first && Rules.digest(registered.first) !== Rules.digest(claim) && (!registered.owner || !registered.consumed.has(registered.first.binding.commandId))) throw new Error("command_ledger.first_command_only");
    registered.first = this.freeze(structuredClone(claim));
    return this.pipeline(() => this.claimStored(claim, async sql => {
      const observed = await this.scanRun(sql, registered.runId);
      for (const record of observed.records) {
        if (Rules.digest(record.claim) === Rules.digest(claim)) continue;
        const consumed = registered.consumed.get(record.claim.binding.commandId), original = consumed && registered.owner?.resolveConsumed(consumed.ticket);
        if (!consumed || !original || Rules.digest(original) !== Rules.digest({ claim: consumed.claim, receipt: consumed.receipt }) || Rules.digest(record.claim) !== Rules.digest(consumed.claim) || Rules.digest(record.receipt) !== Rules.digest(consumed.receipt) || record.state !== "committed" || observed.historicalUnknownCommandIds.includes(record.claim.binding.commandId)) throw new Error("command_ledger.run_claim_conflict");
      }
    }));
  }
  consumeForRun(admission: AutomationStudioCommandRunAdmission, ticket: object): Promise<void> {
    const registered = this.admissions.get(admission), resolved = registered?.owner?.resolveConsumed(ticket);
    if (!registered || !resolved) throw new Error("command_ledger.foreign_consumption");
    const value = this.freeze(structuredClone(resolved)), claim = this.prepare(value.claim); Rules.validateReceipt(claim, value.receipt);
    if (claim.binding.runId !== registered.runId || !registered.first || Rules.digest(registered.first) !== Rules.digest(claim) || registered.consumed.has(claim.binding.commandId)) throw new Error("command_ledger.consumption_conflict");
    return this.pipeline(() => this.lease.database.transaction(async sql => {
      const observed = await this.scanRun(sql, registered.runId), record = observed.records.find(item => item.claim.binding.commandId === claim.binding.commandId);
      if (!record || record.state !== "committed" || Rules.digest(record.claim) !== Rules.digest(claim) || Rules.digest(record.receipt) !== Rules.digest(value.receipt) || observed.historicalUnknownCommandIds.includes(claim.binding.commandId)) throw new Error("command_ledger.unavailable_consumption");
      const still = registered.owner!.resolveConsumed(ticket);
      if (this.closed || !still || Rules.digest(still) !== Rules.digest(value) || registered.consumed.has(claim.binding.commandId)) throw new Error("command_ledger.consumption_conflict");
      registered.consumed.set(claim.binding.commandId, { ticket, claim: value.claim, receipt: value.receipt });
    }));
  }
  async claim(input: ClientGatewayCommandClaim): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> { const claim = this.prepare(input); return await this.pipeline(() => this.claimStored(claim)); }
  private async claimStored(input: ClientGatewayCommandClaim, validateAdmission?: (sql: AutomationStudioSqlExecutor) => Promise<void>): Promise<{ sendAllowed: boolean; record: ClientGatewayCommandRecord }> {
    const claim = this.prepare(input), commandId = claim.binding.commandId;
    const outcome = await this.unitOfWork.runIdempotent({ ...this.mutation(claim, "claim", claim), ...(validateAdmission ? { validateAdmission } : {}) }, async context => {
      const claimedAt = context.changedAt, proofDigest = Rules.digest({ claim, claimedAt });
      await context.sql.run("insert into gateway_command_claims(command_id,claim_json,proof_digest,claimed_at_ms) values(?,?,?,?)", [commandId, JSON.stringify(claim), proofDigest, claimedAt]);
      return { commandId, operation: "claim" as const, proofDigest };
    });
    const record = await this.required(claim);
    await this.verifyReturned(claim, "claim", outcome.response);
    return { sendAllowed: !outcome.replayed && record.state === "pending", record };
  }
  async commitReceipt(input: ClientGatewayCommandClaim, inputReceipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> { const claim = this.prepare(input), receipt = structuredClone(inputReceipt); return await this.pipeline(() => this.commitStored(claim, receipt)); }
  private async commitStored(input: ClientGatewayCommandClaim, inputReceipt: ClientGatewayCommandReceipt): Promise<ClientGatewayCommandRecord> {
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
  async markUnknown(input: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> { const claim = this.prepare(input); return await this.pipeline(() => this.unknownStored(claim, reason)); }
  private async unknownStored(input: ClientGatewayCommandClaim, reason: ClientGatewayCommandUnknownReason): Promise<ClientGatewayCommandRecord> {
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
    return this.pipeline(() => this.lease.database.transaction(sql => this.readChecked(claim, sql)));
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
    const record = await this.lease.database.transaction(sql => this.readChecked(claim, sql)); if (!record) throw new Error("command_ledger.missing_claim"); return record;
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
  private runId(value: string): void { for (const id of [value, this.lease.projectId]) if (typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error("command_ledger.invalid_run_id"); }
  private pipeline<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error("command_ledger.closed");
    const promise = operation(); this.pipelines.add(promise);
    void promise.finally(() => this.pipelines.delete(promise)).catch(/* best-effort: caller owns the original pipeline rejection */ () => undefined);
    return promise;
  }
  private freeze<T>(value: T): T { if (value && typeof value === "object") { for (const nested of Object.values(value)) this.freeze(nested); Object.freeze(value); } return value; }
  private async inventory(sql: AutomationStudioSqlExecutor, table: string, key: string, where = "", limit = SCAN_LIMIT): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []; let cursor: string | null = null;
    for (let page = 0; page <= Math.ceil(limit / SCAN_PAGE); page++) {
      const found: Record<string, unknown>[] = await sql.all<Record<string, unknown>>(`select * from ${table} where (? is null or ${key}>? collate binary) ${where} order by ${key} collate binary limit ?`, [cursor, cursor, SCAN_PAGE]);
      if (!found.length) return rows;
      for (const row of found) { const id = row[key]; if (typeof id !== "string" || !id || cursor !== null && id <= cursor) throw new Error("command_ledger.invalid_inventory_key"); rows.push(row); if (rows.length > limit) throw new Error("command_ledger.scan_limit"); cursor = id; }
      if (found.length < SCAN_PAGE) return rows;
    }
    throw new Error("command_ledger.scan_exhausted");
  }
  private async scanRun(sql: AutomationStudioSqlExecutor, runId: string): Promise<AutomationStudioCommandRunObservation> {
    const rows = await this.inventory(sql, "gateway_command_claims", "command_id"), claims = new Map<string, ClientGatewayCommandClaim>(), records: ClientGatewayCommandRecord[] = [];
    for (const row of rows) {
      const claim = this.decode<ClientGatewayCommandClaim>(row.claim_json as string); this.prepare(claim);
      if (row.command_id !== claim.binding.commandId) throw new Error("command_ledger.corrupt_claim_key");
      const record = await this.readChecked(claim, sql); if (!record) throw new Error("command_ledger.missing_claim"); claims.set(claim.binding.commandId, claim);
      if (claim.binding.runId === runId) records.push(record);
    }
    const historicalUnknownCommandIds: string[] = [];
    for (const table of ["gateway_command_receipts", "gateway_command_unknowns"]) {
      for (const row of await this.inventory(sql, table, "command_id")) {
        const claim = claims.get(row.command_id as string); if (!claim) throw new Error("command_ledger.orphan_history");
        if (table === "gateway_command_unknowns" && claim.binding.runId === runId) historicalUnknownCommandIds.push(claim.binding.commandId);
      }
    }
    for (const row of await this.inventory(sql, "mutation_records", "mutation_id", "and (owner_kind='gateway_command' or operation_kind like 'gateway_command.%' or mutation_id like 'command.%')", SCAN_LIMIT * 3)) {
      const mutationId = row.mutation_id as string, match = /^(command\.[a-f0-9]{64})\.(claim|receipt|unknown)$/.exec(mutationId);
      if (!match || row.owner_kind !== "gateway_command" || row.owner_id !== match[1] || row.operation_kind !== `gateway_command.${match[2]}` || typeof row.request_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(row.request_digest)) throw new Error("command_ledger.invalid_mutation_inventory");
      if (row.status === "committed") { if (!claims.has(match[1]!)) throw new Error("command_ledger.orphan_mutation"); }
      else if (row.status !== "failed" || row.response_json !== null || typeof row.error_json !== "string" || Buffer.byteLength(row.error_json, "utf8") > 8192) throw new Error("command_ledger.invalid_mutation_status");
    }
    return this.freeze({ projectId: this.lease.projectId, runId, records, historicalUnknownCommandIds });
  }
}
