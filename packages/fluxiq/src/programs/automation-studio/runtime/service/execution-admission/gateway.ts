import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { ConfiguredExecutionSource, ExecutionAdmissionAssembly, ExecutionEntry, ExecutionObservationContext, ExecutionOriginRecord, ExecutionScope, ExecutionScopeBinding, ExecutionSourcePorts, ExecutionSourceRegistration, VerifiedExecutionEvidence } from "../../../../../runtime/execution-admission/index.ts";
import type { ObservedGatewayBinding, ObservedGatewayProvenanceReader } from "../../../../../runtime/output-dispatch/admission/gateway/index.ts";
import type { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../framework/persistence/project/execution-admission/index.ts";
import type { AutomationStudioExecutionAdmissionPorts } from "./ports.ts";
import { AutomationStudioObservedCommandContext } from "./context.ts";
import type { AutomationStudioExecutionRootRuns } from "./run.ts";
/** Private backend-parent -> gateway delegation, retaining an original required Context. */
export class AutomationStudioObservedGatewaySource implements ConfiguredExecutionSource, ObservedGatewayBinding {
    readonly owner = Object.freeze({});
    private readonly origins = new WeakMap<object, ExecutionOriginRecord>();
    private readonly proofs = new WeakMap<object, {
        origin: object;
        value: VerifiedExecutionEvidence;
    }>();
    private readonly used = new WeakSet<object>();
    private readonly contexts = new WeakSet<Context>();
    private readonly completions = new WeakMap<Context, { parent: ExecutionObservationContext; entry: ExecutionEntry }>();
    private readonly active = new Set<AutomationStudioObservedCommandContext>();
    private readonly openings = new Set<Promise<unknown>>();
    private reader: ObservedGatewayProvenanceReader | undefined;
    private readProvenance: ObservedGatewayProvenanceReader["read"] | undefined;
    private sourcePorts: ExecutionSourcePorts | undefined;
    private registered = false;
    private closed = false;
    constructor(private readonly ports: {
        readonly assembly: ExecutionAdmissionAssembly;
        readonly scope: ExecutionScope;
        readonly binding: ExecutionScopeBinding;
        readonly store: AutomationStudioProjectExecutionAdmissionStore;
        readonly runs: AutomationStudioExecutionRootRuns;
        readonly collaborators: AutomationStudioExecutionAdmissionPorts;
        register(context: Context, binding: AutomationStudioObservedCommandContext): void;
    }) { }
    setProvenanceReader(originalReader: ObservedGatewayProvenanceReader): void {
        if (this.closed || this.registered || this.sourcePorts || this.reader || !originalReader || typeof originalReader.read !== "function")
            throw new Error("execution_admission.gateway_reader_rebound");
        this.reader = originalReader;
        this.readProvenance = originalReader.read;
    }
    registration(delegatesTo: readonly object[]): ExecutionSourceRegistration {
        if (this.closed || this.registered || !this.reader)
            throw new Error("execution_admission.gateway_not_configured");
        this.registered = true;
        return Object.freeze({ owner: this.owner, scope: this.ports.scope, sourceKey: "studio.gateway", rootPolicy: Object.freeze({ kind: "ordinary" as const }), delegatesTo: Object.freeze([...delegatesTo]),
            readOrigin: (original: object) => this.origins.get(original) ?? null,
            readOrdinaryAdmission: (_proof: object) => null,
            consumeEvidence: (origin: object, proof: object) => {
                const issued = this.proofs.get(proof);
                if (!issued || issued.origin !== origin)
                    return null;
                this.proofs.delete(proof);
                return issued.value;
            }
        });
    }
    connect(ports: ExecutionSourcePorts): void {
        if (this.closed || !this.registered || this.sourcePorts || !ports?.producer || !ports.issuer)
            throw new Error("execution_admission.gateway_ports_rebound");
        this.sourcePorts = ports;
    }
    bind(parent: ExecutionObservationContext, originalProvenance: object, existingContext?: Context): Promise<Context> {
        const pending = this.bindStored(parent, originalProvenance, existingContext);
        this.openings.add(pending);
        void pending.then(() => this.openings.delete(pending), () => { /* best-effort: retire tracking; bind still reports the original failure to its caller. */ this.openings.delete(pending); });
        return pending;
    }
    readCompletion(context: Context, parent: ExecutionObservationContext): ReturnType<NonNullable<ObservedGatewayBinding["readCompletion"]>> {
        const original = this.completions.get(context);
        const bridge = this.ports.assembly.entryBridge;
        if (this.closed || !original || original.parent !== parent || !bridge.matchesReservation(parent.parent, parent.reservation) || !bridge.matchesReservation(original.entry, parent.reservation)) return "unknown";
        const backend = bridge.read(parent.parent), child = bridge.read(original.entry);
        if (!backend.reservationActive || !child.reservationActive || backend.lifecycle === "blocked" || backend.lifecycle === "closed" || child.lifecycle === "blocked" || child.sourceOwner !== this.owner || backend.fenceGeneration !== child.fenceGeneration || backend.row.scopeId !== child.row.scopeId || backend.row.rootId !== child.row.rootId) return "unknown";
        return child.lifecycle === "closed" ? "settled" : "pending";
    }
    private async bindStored(parent: ExecutionObservationContext, originalProvenance: object, existingContext?: Context): Promise<Context> {
        this.assertOpen();
        const reader = this.reader!, source = this.sourcePorts!;
        const read = () => {
            this.readParent(parent);
            const value = this.readProvenance!.call(reader, originalProvenance, parent);
            if (!value)
                throw new Error("execution_admission.gateway_provenance_unverified");
            return value;
        };
        const owner = Object.freeze({ ...read() });
        if (this.used.has(originalProvenance) || existingContext && this.contexts.has(existingContext))
            throw new Error("execution_admission.gateway_context_rebound");
        this.used.add(originalProvenance);
        if (existingContext)
            this.contexts.add(existingContext);
        const required = existingContext !== undefined;
        const ownerKind = !required && this.ports.runs.readOwner(owner.runId, parent) ? "execution_root" : "runtime_session";
        if (required && (!this.ports.collaborators.requiredOwner.owns(existingContext) || Rules.digest(Context.owner(existingContext)) !== Rules.digest(owner)))
            throw new Error("execution_admission.foreign_required_context");
        await this.validateOwner(owner, parent, ownerKind);
        this.assertOpen();
        if (Rules.digest(read()) !== Rules.digest(owner))
            throw new Error("execution_admission.gateway_provenance_changed");
        const context = existingContext ?? Context.issue(owner);
        this.contexts.add(context);
        const origin = Object.freeze({});
        this.origins.set(origin, Object.freeze({ sourceKey: "studio.gateway", operationKey: Rules.commandId(owner), runId: owner.runId, invocationId: owner.invocationId, attemptId: owner.attemptId, bindingDigest: Rules.digest(owner) }));
        const entry = await source.producer.enter(parent, origin);
        this.assertOpen();
        const binding = new AutomationStudioObservedCommandContext(context, required, {
            pool: this.ports.collaborators.pool!, entry, link: this.ports.store.commandLink(this.ports.assembly.entryBridge, this.owner), producer: source.producer,
            evidence: value => {
                const proof = Object.freeze({});
                this.proofs.set(proof, { origin, value: Object.freeze({ ...value }) });
                return proof;
            },
            validate: async () => {
                this.assertOpen();
                this.readParent(parent);
            await this.validateOwner(owner, parent, ownerKind);
                await this.ports.store.validateOriginalEntry(this.ports.assembly.entryBridge, entry);
                this.assertOpen();
                this.readParent(parent);
            }
        });
        this.active.add(binding);
        this.ports.register(context, binding);
        this.completions.set(context, { parent, entry });
        return context;
    }
    async close(): Promise<void> {
        this.closed = true;
        await Promise.allSettled([...this.openings]);
        const results = await Promise.allSettled([...this.active].map(binding => binding.close()));
        this.active.clear();
        const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
        if (errors.length)
            throw new AggregateError(errors, "execution_admission.gateway_close_failed");
    }
    private readParent(parent: ExecutionObservationContext): void {
        const bridge = this.ports.assembly.entryBridge;
        if (!parent || !bridge.matchesReservation(parent.parent, parent.reservation))
            throw new Error("execution_admission.foreign_gateway_parent");
        const current = bridge.read(parent.parent);
        if (!current.reservationActive || current.lifecycle !== "open")
            throw new Error("execution_admission.gateway_parent_closed");
    }
    private async validateOwner(owner: ReturnType<typeof Context.owner>, parent: ExecutionObservationContext, ownerKind: "execution_root" | "runtime_session"): Promise<void> {
        if (owner.projectId !== this.ports.binding.projectId)
            throw new Error("execution_admission.gateway_project_conflict");
        if (ownerKind === "execution_root") {
            const observed = this.ports.runs.readOwner(owner.runId, parent);
            if (!observed)
                throw new Error("execution_admission.gateway_run_closed");
            if (owner.flowId !== observed.owner.flowId)
                throw new Error("execution_admission.gateway_flow_conflict");
            await this.ports.store.flowBinding(observed.owner.flowId);
            if (!this.ports.runs.readOwner(owner.runId, parent))
                throw new Error("execution_admission.gateway_run_closed");
            return;
        }
        const collaborators = this.ports.collaborators;
        const session = await collaborators.getRuntimeSession(owner.projectId, owner.runId);
        if (!session || session.schemaVersion !== "0.1" || session.projectId !== owner.projectId || session.runId !== owner.runId || session.flowId !== owner.flowId || session.flow?.flowId !== owner.flowId || !["queued", "running", "waiting"].includes(session.status) || session.finishedAt !== undefined)
            throw new Error("execution_admission.invalid_stored_session");
    }
    private assertOpen(): void {
        if (this.closed || !this.reader || !this.sourcePorts || !this.ports.collaborators.pool || this.ports.collaborators.pool.isClosing)
            throw new Error("execution_admission.gateway_unavailable");
    }
}
