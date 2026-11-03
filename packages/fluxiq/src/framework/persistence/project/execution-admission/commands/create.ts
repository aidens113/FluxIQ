import type { ExecutionEntry, ExecutionEntryBridge, ExecutionEntrySnapshot } from "../../../../../runtime/execution-admission/index.ts";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { automationStudioMutationDigest as digest } from "../../mutations/index.ts";
import { readExecutionAdmissionInventory } from "../inventory.ts";
import { executionAdmissionAncestors, inspectExecutionAdmission, requireActiveExecutionEntry } from "../state.ts";
import { executionAdmissionEventDigest } from "../proof.ts";
import { writeExecutionAdmissionEvent } from "../write.ts";
import { executionAdmissionEventValue } from "../codec.ts";
import type { ExecutionAdmissionCommandLink } from "./link.ts";
import type { ExecutionAdmissionStorageContext } from "../context.ts";
import type { ExecutionAdmissionSnapshot } from "../snapshot.ts";
import type { AutomationStudioSqlExecutor } from "../../sql/index.ts";
export function createExecutionAdmissionCommandLink(context: ExecutionAdmissionStorageContext, bridge: ExecutionEntryBridge, sourceOwner: object, assertOpen: () => void): ExecutionAdmissionCommandLink {
    const prepared = new WeakMap<ExecutionEntry, {
        sql: AutomationStudioSqlExecutor;
        snapshot: ExecutionAdmissionSnapshot;
        claimDigest: string;
        required: boolean;
    }>();
    const readOriginal = (entry: ExecutionEntry, active: boolean): ExecutionEntrySnapshot => {
        assertOpen();
        const snapshot = bridge.read(entry);
        if (snapshot.sourceOwner !== sourceOwner || active && (!snapshot.reservationActive || snapshot.lifecycle !== "open"))
            throw new Error("execution_admission.foreign_command_entry");
        return snapshot;
    };
    const link: ExecutionAdmissionCommandLink = {
        projectId: context.lease.projectId,
        assertOriginal(originalEntry) { readOriginal(originalEntry, false); },
        assertActive(originalEntry) {
            readOriginal(originalEntry, true);
        },
        async validate(sql, originalEntry, claim, required) {
            readOriginal(originalEntry, false);
            const snapshot = await readExecutionAdmissionInventory(context, sql);
            const original = readOriginal(originalEntry, false);
            const stored = snapshot.rows.entries.get(original.row.entryId);
            const linked = snapshot.rows.links.get(claim.binding.commandId);
            const owner = { projectId: claim.binding.projectId, runId: claim.binding.runId, flowId: claim.binding.flowId, invocationId: claim.binding.invocationId, attemptId: claim.binding.attemptId, effectOrdinal: claim.binding.effectOrdinal };
            if (!stored || digest(stored.row) !== digest(original.row) || stored.fenceGeneration !== original.fenceGeneration || claim.binding.projectId !== context.lease.projectId || original.row.origin.operationKey !== claim.binding.commandId || original.row.origin.runId !== owner.runId || original.row.origin.invocationId !== owner.invocationId || original.row.origin.attemptId !== owner.attemptId || original.row.origin.bindingDigest !== Rules.digest(owner))
                throw new Error("execution_admission.command_origin_conflict");
            if (linked) {
                if (linked.entryId !== original.row.entryId || linked.required !== required || linked.claimDigest !== Rules.digest(claim) || linked.fenceGeneration !== original.fenceGeneration)
                    throw new Error("execution_admission.command_replay_conflict");
                return;
            }
            if (snapshot.commands.some(command => command.claim.binding.commandId === claim.binding.commandId))
                throw new Error("execution_admission.cannot_relink_history");
            readOriginal(originalEntry, true);
            requireActiveExecutionEntry(snapshot, stored.row.entryId, original.fenceGeneration);
            const ancestors = executionAdmissionAncestors(snapshot, stored.row.entryId);
            if ([...snapshot.rows.facts.values()].some(fact => ancestors.some(ancestor => ancestor.row.entryId === fact.entryId) && (fact.evidence.kind === "interrupted" || fact.evidence.kind === "terminal_unknown" || fact.evidence.kind === "required_latched")))
                throw new Error("execution_admission.interrupted_command");
            const inspected = inspectExecutionAdmission(snapshot, stored.row.scopeId, new Set(ancestors.map(ancestor => ancestor.row.entryId)));
            if (inspected.state === "pending" || inspected.state === "required_latched")
                throw new Error("execution_admission.command_blocked");
            prepared.set(originalEntry, { sql, snapshot, claimDigest: Rules.digest(claim), required });
        },
        async insert(mutation, originalEntry, claim, required) {
            const plan = prepared.get(originalEntry);
            prepared.delete(originalEntry);
            const original = readOriginal(originalEntry, true);
            if (!plan || plan.sql !== mutation.sql || plan.claimDigest !== Rules.digest(claim) || plan.required !== required || mutation.mutationId !== `${claim.binding.commandId}.claim`)
                throw new Error("execution_admission.foreign_claim_transaction");
            const eventId = `link.${digest(claim.binding.commandId).slice(7)}`;
            const link = { commandId: claim.binding.commandId, entryId: original.row.entryId, scopeId: original.row.scopeId, rootId: original.row.rootId, required, fenceGeneration: original.fenceGeneration, originDigest: digest(original.row), claimDigest: Rules.digest(claim), proofEventId: eventId };
            const value = { eventId, mutationId: mutation.mutationId, ownerId: claim.binding.commandId, operation: "command_link" as const, request: { claimDigest: Rules.digest(claim) }, changes: [{ table: "links" as const, key: link.commandId, value: link }] };
            const event = executionAdmissionEventValue({ ...value, proofDigest: executionAdmissionEventDigest(value) });
            await writeExecutionAdmissionEvent(mutation.sql, event);
            return event.proofDigest;
        }
    };
    return Object.freeze(link);
}
