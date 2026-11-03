import type { ExecutionAdmissionPersistence } from "../../../../../runtime/execution-admission/index.ts";
import { executionEvidence, executionText } from "../../../../../runtime/execution-admission/validation/index.ts";
import { ClientGatewayCommandLedgerController as Rules } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { automationStudioMutationDigest as digest } from "../../../../../framework/persistence/project/mutations/index.ts";
import { mutateExecutionAdmission } from "./mutation.ts";
import { executionAdmissionTouches, requireActiveExecutionEntry } from "./state.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
export async function appendExecutionAdmissionEvidence(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["append"]>[0]): Promise<void> {
    const entryId = executionText(input.entryId, "entry");
    const evidence = executionEvidence(input.evidence);
    if (evidence.kind === "coverage_complete")
        throw new Error("execution_admission.finish_required");
    await mutateExecutionAdmission(context, "append", entryId, { entryId, evidence }, (snapshot, eventId) => {
        const entry = requireActiveExecutionEntry(snapshot, entryId);
        if (evidence.kind === "command_delivery" || evidence.kind === "required_consumed") {
            const link = snapshot.rows.links.get(evidence.commandId);
            const command = snapshot.commands.find(command => command.claim.binding.commandId === evidence.commandId);
            if (!link || link.entryId !== entryId || !command || command.state !== "committed" || !command.receipt)
                throw new Error("execution_admission.unverified_delivery");
            if (evidence.kind === "command_delivery" && (evidence.claimDigest !== Rules.digest(command.claim) || evidence.receiptDigest !== Rules.digest(command.receipt)))
                throw new Error("execution_admission.delivery_digest_conflict");
            if (evidence.kind === "required_consumed" && (!link.required || snapshot.historicalUnknownCommandIds.includes(link.commandId) || ![...snapshot.rows.facts.values()].some(fact => fact.entryId === entryId && fact.evidence.kind === "command_delivery" && fact.evidence.commandId === link.commandId)))
                throw new Error("execution_admission.unverified_consumption");
        }
        const factId = `fact.${digest({ entryId, evidence }).slice(7)}`;
        const changes = executionAdmissionTouches(snapshot, entry, eventId);
        changes.push({ table: "facts", key: factId, value: { factId, entryId, evidence, proofEventId: eventId } });
        changes.push({ table: "entries", key: entryId, value: { ...entry, revision: entry.revision + 1, proofEventId: eventId } });
        return changes;
    });
}
