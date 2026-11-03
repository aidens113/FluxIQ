import type { ExecutionEntry, ExecutionEntryBridge, ExecutionObservationContext, ExecutionScopeBinding } from "../../../../../runtime/execution-admission/index.ts";
import type { OrdinaryExecutionRunBinding, OrdinaryExecutionRunBindingReader } from "../../../../../runtime/output-dispatch/admission/gateway/index.ts";
import type { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../framework/persistence/project/execution-admission/index.ts";
/** Original roots and private proofs, never copied bridge snapshots or caller run IDs. */
export class AutomationStudioExecutionRootRuns implements OrdinaryExecutionRunBindingReader {
    private readonly proofs = new WeakMap<object, {
        root: ExecutionEntry;
        binding: OrdinaryExecutionRunBinding;
    }>();
    private readonly roots = new Map<string, object>();
    private closed = false;
    constructor(private readonly store: AutomationStudioProjectExecutionAdmissionStore, private readonly bridge: ExecutionEntryBridge, private readonly binding: ExecutionScopeBinding) { }
    async issue(originalRoot: ExecutionEntry): Promise<object> {
        this.assertOpen();
        const before = this.bridge.read(originalRoot);
        if (before.row.parentId !== undefined || before.row.entryId !== before.row.rootId)
            throw new Error("execution_admission.original_root_required");
        await this.store.validateOriginalEntry(this.bridge, originalRoot);
        const anchored = await this.store.flowBinding(this.binding.continuationKey);
        this.assertOpen();
        const root = this.bridge.read(originalRoot);
        if (!root.reservationActive || root.lifecycle !== "open" || root.row.scopeId !== before.row.scopeId || root.fenceGeneration !== before.fenceGeneration || anchored.projectId !== this.binding.projectId || anchored.continuationKey !== this.binding.continuationKey)
            throw new Error("execution_admission.root_owner_changed");
        const previous = this.roots.get(root.row.entryId);
        if (previous)
            return previous;
        const proof = Object.freeze({});
        const binding: OrdinaryExecutionRunBinding = Object.freeze({ kind: "execution_root", owner: Object.freeze({ projectId: this.binding.projectId, runId: root.row.entryId, flowId: this.binding.continuationKey }) });
        this.proofs.set(proof, { root: originalRoot, binding });
        this.roots.set(root.row.entryId, proof);
        return proof;
    }
    readOrdinaryRunBinding(originalProof: object, parent: ExecutionObservationContext): OrdinaryExecutionRunBinding | null {
        if (this.closed)
            return null;
        const original = this.proofs.get(originalProof);
        if (!original || !this.bridge.matchesReservation(original.root, parent.reservation) || !this.bridge.matchesReservation(parent.parent, parent.reservation))
            return null;
        const root = this.bridge.read(original.root), current = this.bridge.read(parent.parent);
        if (!root.reservationActive || !current.reservationActive || root.lifecycle !== "open" || current.lifecycle !== "open" || root.row.entryId !== current.row.rootId || root.row.scopeId !== current.row.scopeId || root.row.ownerIncarnation !== current.row.ownerIncarnation || root.fenceGeneration !== current.fenceGeneration)
            return null;
        return original.binding;
    }
    readOwner(runId: string, parent: ExecutionObservationContext): OrdinaryExecutionRunBinding | null {
        const proof = this.roots.get(runId);
        return proof ? this.readOrdinaryRunBinding(proof, parent) : null;
    }
    close(): void {
        this.closed = true;
        this.roots.clear();
    }
    private assertOpen(): void {
        if (this.closed)
            throw new Error("execution_admission.runs_closed");
    }
}
