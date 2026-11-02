import type { AutomationStudioSqlExecutor } from "../database.ts";
import { automationStudioMutationDigest as digest } from "../unit-of-work.ts";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { executionRecord } from "../../../../../runtime/execution-admission/validation/index.ts";
import { executionAdmissionDecode, executionAdmissionEventValue, executionAdmissionRow } from "./codec.ts";
import { verifyExecutionAdmissionEvent } from "./proof.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
/** Checks the association sealed by the original gateway claim mutation response. */
export async function readExecutionCommandLinkProof(sql: AutomationStudioSqlExecutor, claim: ClientGatewayCommandClaim, expectedDigest: string): Promise<ExecutionAdmissionRows["links"]> {
    const raw = await sql.get<{
        data_json: string;
        proof_event_id: string;
        entry_id: string;
    }>("select * from execution_admission_command_links where command_id=?", [claim.binding.commandId]);
    if (!raw)
        throw new Error("execution_admission.missing_command_link");
    const link = executionAdmissionRow("links", executionAdmissionDecode(raw.data_json));
    const stored = await sql.get<{
        event_id: string;
        mutation_id: string;
        operation: string;
        request_json: string;
        changes_json: string;
        proof_digest: string;
    }>("select * from execution_admission_events where event_id=?", [raw.proof_event_id]);
    if (!stored)
        throw new Error("execution_admission.missing_command_proof");
    const request = executionRecord(executionAdmissionDecode(stored.request_json), ["ownerId", "value"], ["ownerId", "value"], "link_event_request");
    const event = executionAdmissionEventValue({ eventId: stored.event_id, mutationId: stored.mutation_id, ownerId: request.ownerId, operation: stored.operation, request: request.value, changes: executionAdmissionDecode(stored.changes_json), proofDigest: stored.proof_digest });
    if (event.operation !== "command_link" || event.ownerId !== claim.binding.commandId || event.proofDigest !== expectedDigest || event.changes.length !== 1 || event.changes[0]!.table !== "links" || event.changes[0]!.key !== claim.binding.commandId || digest(event.changes[0]!.value) !== digest(link) || raw.entry_id !== link.entryId || raw.proof_event_id !== link.proofEventId)
        throw new Error("execution_admission.corrupt_command_proof");
    await verifyExecutionAdmissionEvent(sql, event);
    const entryRaw = await sql.get<{
        data_json: string;
    }>("select data_json from execution_admission_entries where entry_id=?", [link.entryId]);
    if (!entryRaw)
        throw new Error("execution_admission.missing_command_entry");
    const entry = executionAdmissionRow("entries", executionAdmissionDecode(entryRaw.data_json));
    const owner = { projectId: claim.binding.projectId, runId: claim.binding.runId, flowId: claim.binding.flowId, invocationId: claim.binding.invocationId, attemptId: claim.binding.attemptId, effectOrdinal: claim.binding.effectOrdinal };
    if (link.commandId !== claim.binding.commandId || link.claimDigest !== Rules.digest(claim) || link.scopeId !== entry.row.scopeId || link.rootId !== entry.row.rootId || link.fenceGeneration !== entry.fenceGeneration || link.originDigest !== digest(entry.row) || entry.row.origin.operationKey !== link.commandId || entry.row.origin.runId !== owner.runId || entry.row.origin.invocationId !== owner.invocationId || entry.row.origin.attemptId !== owner.attemptId || entry.row.origin.bindingDigest !== Rules.digest(owner))
        throw new Error("execution_admission.command_provenance_conflict");
    return link;
}
