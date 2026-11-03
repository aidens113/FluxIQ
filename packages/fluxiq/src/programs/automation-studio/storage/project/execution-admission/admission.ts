import { randomUUID } from "node:crypto";
import type { ExecutionAdmissionPersistence } from "../../../../../runtime/execution-admission/index.ts";
import { executionRecord, executionText } from "../../../../../runtime/execution-admission/validation/index.ts";
import { automationStudioMutationDigest as digest } from "../../../../../framework/persistence/project/mutations/index.ts";
import { executionAdmissionEntry } from "./codec.ts";
import { mutateExecutionAdmission } from "./mutation.ts";
import { executionAdmissionAncestors, executionAdmissionTouches, inspectExecutionAdmission, requireActiveExecutionEntry } from "./state.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export async function reserveExecutionAdmission(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["reserve"]>[0]): Promise<{
    fenceGeneration: string;
}> {
    const root = executionAdmissionEntry(input.root);
    const ordinaryCallKey = executionText(input.ordinaryCallKey, "ordinary_call");
    const policy = executionRecord(input.policy, ["kind", "seriesKey"], ["kind"], "root_policy");
    if (root.parentId !== undefined || root.rootId !== root.entryId || policy.kind !== "ordinary" && policy.kind !== "trial_series" || policy.kind === "ordinary" && policy.seriesKey !== undefined || policy.kind === "trial_series" && root.seriesKey !== executionText(policy.seriesKey, "series"))
        throw new Error("execution_admission.invalid_root_policy");
    const event = await mutateExecutionAdmission(context, "reserve", root.entryId, { root, ordinaryCallKey, policy }, (snapshot, eventId) => {
        const scope = snapshot.rows.scopes.get(root.scopeId);
        if (!scope || snapshot.rows.entries.has(root.entryId) || digest(root.resourceKeys) !== digest(scope.binding.resourceKeys))
            throw new Error("execution_admission.invalid_root");
        const inspection = inspectExecutionAdmission(snapshot, root.scopeId);
        if (inspection.state === "pending" || inspection.state === "required_latched")
            throw new Error("execution_admission.execution_blocked");
        const priorLive = [...snapshot.rows.entries.values()].some(entry => entry.row.scopeId === root.scopeId && entry.row.parentId === undefined && entry.row.sourceKey === root.sourceKey && entry.row.seriesKey === root.seriesKey && entry.enteredLive);
        if (policy.kind === "trial_series" && priorLive && inspection.state !== "clear")
            throw new Error("execution_admission.retest_unverified");
        const fenceGeneration = randomUUID();
        const stored: ExecutionAdmissionRows["entries"] = { row: root, enteredLive: false, revision: 0, fenceGeneration, active: true, closure: null, frontierDigest: null, proofEventId: eventId };
        const changes: ExecutionAdmissionEvent["changes"] = [{ table: "entries", key: root.entryId, value: stored }, { table: "scopes", key: scope.scopeId, value: { ...scope, revision: scope.revision + 1, proofEventId: eventId } }];
        for (const resource of root.resourceKeys) {
            const existing = snapshot.rows.fences.get(resource);
            if (existing?.rootId !== undefined && existing.rootId !== null)
                throw new Error("execution_admission.resource_reserved");
            changes.push({ table: "fences", key: resource, value: { resourceKey: resource, revision: (existing?.revision ?? -1) + 1, rootId: root.entryId, ownerIncarnation: root.ownerIncarnation, fenceGeneration, proofEventId: eventId } });
        }
        return changes;
    });
    const stored = event.changes.find(change => change.table === "entries" && change.key === root.entryId)?.value as ExecutionAdmissionRows["entries"] | undefined;
    if (!stored)
        throw new Error("execution_admission.missing_reservation_result");
    return Object.freeze({ fenceGeneration: stored.fenceGeneration });
}
export async function enterExecutionAdmission(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["enter"]>[0]): Promise<void> {
    const entry = executionAdmissionEntry(input.entry);
    const fenceGeneration = executionText(input.fenceGeneration, "fence");
    if (entry.parentId === undefined)
        throw new Error("execution_admission.parent_required");
    await mutateExecutionAdmission(context, "enter", entry.entryId, { entry, fenceGeneration }, (snapshot, eventId) => {
        const parent = requireActiveExecutionEntry(snapshot, entry.parentId!, fenceGeneration);
        if (snapshot.rows.entries.has(entry.entryId) || parent.row.rootId !== entry.rootId || parent.row.scopeId !== entry.scopeId || parent.row.ownerIncarnation !== entry.ownerIncarnation || digest(parent.row.resourceKeys) !== digest(entry.resourceKeys) || entry.seriesKey !== undefined)
            throw new Error("execution_admission.parent_conflict");
        const ancestors = executionAdmissionAncestors(snapshot, parent.row.entryId);
        if ([...snapshot.rows.facts.values()].some(fact => ancestors.some(ancestor => ancestor.row.entryId === fact.entryId) && (fact.evidence.kind === "interrupted" || fact.evidence.kind === "terminal_unknown" || fact.evidence.kind === "required_latched")))
            throw new Error("execution_admission.interrupted_parent");
        const inspection = inspectExecutionAdmission(snapshot, entry.scopeId, new Set(ancestors.map(ancestor => ancestor.row.entryId)));
        if (inspection.state === "pending" || inspection.state === "required_latched")
            throw new Error("execution_admission.child_blocked");
        const changes = executionAdmissionTouches(snapshot, parent, eventId);
        for (const ancestor of ancestors)
            changes.push({ table: "entries", key: ancestor.row.entryId, value: { ...ancestor, enteredLive: true, revision: ancestor.revision + 1, proofEventId: eventId } });
        changes.push({ table: "entries", key: entry.entryId, value: { row: entry, enteredLive: true, revision: 0, fenceGeneration, active: true, closure: null, frontierDigest: null, proofEventId: eventId } });
        return changes;
    });
}
