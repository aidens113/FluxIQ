import type { ExecutionAdmissionPersistence } from "../../../../runtime/execution-admission/index.ts";
import { executionEvidence, executionText } from "../../../../runtime/execution-admission/validation/index.ts";
import { mutateExecutionAdmission } from "./mutation.ts";
import { executionAdmissionFrontier, executionAdmissionTouches, requireActiveExecutionEntry } from "./state.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
export async function finishExecutionAdmission(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["finish"]>[0]): Promise<void> {
    const entryId = executionText(input.entryId, "entry");
    const evidence = executionEvidence(input.evidence);
    if (evidence.kind !== "coverage_complete")
        throw new Error("execution_admission.completion_required");
    await mutateExecutionAdmission(context, "finish", entryId, { entryId, evidence }, (snapshot, eventId) => {
        const entry = requireActiveExecutionEntry(snapshot, entryId);
        const descendants = new Set([entryId]);
        for (let pass = 0; pass < 256; pass++) {
            const size = descendants.size;
            for (const child of snapshot.rows.entries.values())
                if (child.row.parentId !== undefined && descendants.has(child.row.parentId))
                    descendants.add(child.row.entryId);
            if (descendants.size === size)
                break;
            if (pass === 255)
                throw new Error("execution_admission.frontier_overflow");
        }
        for (const childId of descendants)
            if (childId !== entryId && snapshot.rows.entries.get(childId)?.closure === null)
                throw new Error("execution_admission.children_unfinished");
        const facts = [...snapshot.rows.facts.values()].filter(fact => descendants.has(fact.entryId));
        if (facts.some(fact => fact.evidence.kind === "terminal_unknown" || fact.evidence.kind === "required_latched" || fact.evidence.kind === "returned_unverified"))
            throw new Error("execution_admission.terminal_or_unverified");
        for (const link of snapshot.rows.links.values()) {
            if (!descendants.has(link.entryId))
                continue;
            const command = snapshot.commands.find(command => command.claim.binding.commandId === link.commandId);
            if (!command || command.state === "pending")
                throw new Error("execution_admission.command_still_running");
            const historicalUnknown = snapshot.historicalUnknownCommandIds.includes(link.commandId);
            if (link.required && (historicalUnknown || command?.state !== "committed" || !facts.some(fact => fact.entryId === link.entryId && fact.evidence.kind === "required_consumed" && fact.evidence.commandId === link.commandId)))
                throw new Error("execution_admission.required_not_consumed");
            const unacted = link.entryId === entryId ? evidence.disposition === "unacted" : snapshot.rows.entries.get(link.entryId)?.closure?.disposition === "unacted";
            if (command?.state !== "committed" || historicalUnknown) {
                if (link.required || !unacted)
                    throw new Error("execution_admission.command_unsettled");
            }
            else if (!facts.some(fact => fact.entryId === link.entryId && fact.evidence.kind === "command_delivery" && fact.evidence.commandId === link.commandId)) {
                throw new Error("execution_admission.delivery_unobserved");
            }
        }
        const frontierDigest = executionAdmissionFrontier(snapshot, entryId);
        const changes = executionAdmissionTouches(snapshot, entry, eventId);
        changes.push({ table: "entries", key: entryId, value: { ...entry, closure: evidence, frontierDigest, revision: entry.revision + 1, proofEventId: eventId } });
        return changes;
    });
}
