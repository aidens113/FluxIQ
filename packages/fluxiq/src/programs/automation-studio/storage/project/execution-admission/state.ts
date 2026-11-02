import type { ExecutionInspection } from "../../../../../runtime/execution-admission/index.ts";
import { automationStudioMutationDigest as digest } from "../unit-of-work.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
import type { ExecutionAdmissionSnapshot } from "./snapshot.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export function executionAdmissionAncestors(snapshot: ExecutionAdmissionSnapshot, entryId: string): ExecutionAdmissionRows["entries"][] {
    const result: ExecutionAdmissionRows["entries"][] = [];
    let current = snapshot.rows.entries.get(entryId);
    if (!current)
        throw new Error("execution_admission.missing_entry");
    while (current) {
        if (result.some(item => item.row.entryId === current!.row.entryId) || result.length >= 256)
            throw new Error("execution_admission.invalid_ancestry");
        result.push(current);
        current = current.row.parentId === undefined ? undefined : snapshot.rows.entries.get(current.row.parentId);
    }
    return result;
}
export function requireActiveExecutionEntry(snapshot: ExecutionAdmissionSnapshot, entryId: string, fenceGeneration?: string): ExecutionAdmissionRows["entries"] {
    const chain = executionAdmissionAncestors(snapshot, entryId);
    const entry = chain[0]!;
    const root = chain.at(-1)!;
    if (root.row.entryId !== entry.row.rootId || !root.active || chain.some(item => item.closure !== null) || fenceGeneration !== undefined && root.fenceGeneration !== fenceGeneration)
        throw new Error("execution_admission.inactive_entry");
    for (const resource of root.row.resourceKeys) {
        const fence = snapshot.rows.fences.get(resource);
        if (!fence || fence.rootId !== root.row.entryId || fence.ownerIncarnation !== root.row.ownerIncarnation || fence.fenceGeneration !== root.fenceGeneration)
            throw new Error("execution_admission.stale_fence");
    }
    return entry;
}
export function inspectExecutionAdmission(snapshot: ExecutionAdmissionSnapshot, scopeId: string, ignored = new Set<string>()): ExecutionInspection {
    const scope = snapshot.rows.scopes.get(scopeId);
    if (!scope)
        throw new Error("execution_admission.missing_scope");
    const resources = new Set(scope.binding.resourceKeys);
    for (const entry of snapshot.rows.entries.values())
        if (entry.row.scopeId === scopeId)
            for (const resource of entry.row.resourceKeys)
                resources.add(resource);
    const relevant = [...snapshot.rows.entries.values()].filter(entry => entry.row.scopeId === scopeId || entry.row.resourceKeys.some(resource => resources.has(resource)));
    const selected = new Set(relevant.map(entry => entry.row.entryId));
    const facts = [...snapshot.rows.facts.values()].filter(fact => selected.has(fact.entryId));
    const blockers: Array<{
        entryId: string;
        code: string;
    }> = [];
    let state: ExecutionInspection["state"] = "clear";
    const mark = (value: ExecutionInspection["state"], entryId: string, code: string) => {
        const rank = { clear: 0, unverified: 1, pending: 2, required_latched: 3 };
        if (rank[value] > rank[state])
            state = value;
        blockers.push({ entryId, code });
    };
    const relatedScopes = new Set([scopeId, ...relevant.map(entry => entry.row.scopeId)]);
    for (const related of relatedScopes)
        if (snapshot.rows.scopes.get(related)?.baseline !== "complete")
            mark("unverified", related, "baseline_unverified");
    for (const fact of facts) {
        if (fact.evidence.kind === "required_latched")
            mark("required_latched", fact.entryId, "required_latched");
        if (fact.evidence.kind === "terminal_unknown")
            mark("pending", fact.entryId, "terminal_unknown");
        if (fact.evidence.kind === "returned_unverified")
            mark("unverified", fact.entryId, "completion_unverified");
    }
    for (const entry of relevant) {
        if (ignored.has(entry.row.entryId))
            continue;
        if (entry.closure === null) {
            const own = facts.filter(fact => fact.entryId === entry.row.entryId);
            const unsupported = own.some(fact => fact.evidence.kind === "returned_unverified");
            const interrupted = own.some(fact => fact.evidence.kind === "interrupted");
            mark(unsupported && !interrupted ? "unverified" : "pending", entry.row.entryId, unsupported && !interrupted ? "completion_unverified" : "coverage_open");
        }
    }
    for (const fence of snapshot.rows.fences.values())
        if (resources.has(fence.resourceKey) && fence.rootId !== null && !ignored.has(fence.rootId))
            mark("pending", fence.rootId, "reservation_active");
    for (const command of snapshot.commands) {
        const id = command.claim.binding.commandId;
        const link = snapshot.rows.links.get(id);
        if (!link) {
            mark(command.state === "committed" && !snapshot.historicalUnknownCommandIds.includes(id) ? "unverified" : "pending", id, "command_history_unlinked");
        }
        else if (selected.has(link.entryId) && snapshot.historicalUnknownCommandIds.includes(id)) {
            if (link.required || snapshot.rows.entries.get(link.entryId)?.closure?.disposition !== "unacted")
                mark(link.required ? "required_latched" : "pending", link.entryId, "command_historical_unknown");
        }
    }
    const generation = digest({ scopes: [...snapshot.rows.scopes], entries: [...snapshot.rows.entries], fences: [...snapshot.rows.fences], facts: [...snapshot.rows.facts], links: [...snapshot.rows.links], commands: snapshot.commands, unknowns: snapshot.historicalUnknownCommandIds });
    return Object.freeze({ state, generation, blockers: Object.freeze(blockers.slice(0, 64).map(blocker => Object.freeze(blocker))) });
}
export function executionAdmissionTouches(snapshot: ExecutionAdmissionSnapshot, entry: ExecutionAdmissionRows["entries"], eventId: string): ExecutionAdmissionEvent["changes"] {
    const scope = snapshot.rows.scopes.get(entry.row.scopeId);
    if (!scope)
        throw new Error("execution_admission.missing_scope");
    const changes: ExecutionAdmissionEvent["changes"] = [{ table: "scopes", key: scope.scopeId, value: { ...scope, revision: scope.revision + 1, proofEventId: eventId } }];
    for (const resource of entry.row.resourceKeys) {
        const fence = snapshot.rows.fences.get(resource);
        if (!fence)
            throw new Error("execution_admission.missing_fence");
        changes.push({ table: "fences", key: resource, value: { ...fence, revision: fence.revision + 1, proofEventId: eventId } });
    }
    return changes;
}
export function executionAdmissionFrontier(snapshot: ExecutionAdmissionSnapshot, entryId: string): string {
    const entry = snapshot.rows.entries.get(entryId);
    if (!entry)
        throw new Error("execution_admission.missing_entry");
    const children = [...snapshot.rows.entries.values()].filter(child => child.row.parentId === entryId).sort((a, b) => a.row.entryId.localeCompare(b.row.entryId));
    const facts = [...snapshot.rows.facts.values()].filter(fact => fact.entryId === entryId).sort((a, b) => a.factId.localeCompare(b.factId));
    const links = [...snapshot.rows.links.values()].filter(link => link.entryId === entryId).sort((a, b) => a.commandId.localeCompare(b.commandId));
    const commands = links.map(link => ({ command: snapshot.commands.find(command => command.claim.binding.commandId === link.commandId), historicalUnknown: snapshot.historicalUnknownCommandIds.includes(link.commandId) }));
    return digest({ row: entry.row, children, facts, links, commands });
}
