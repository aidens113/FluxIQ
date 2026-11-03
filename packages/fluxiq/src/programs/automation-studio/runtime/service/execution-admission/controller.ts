import { ClientGatewayCommandContext as Context, type ClientGatewayCommandClaim, type ClientGatewayCommandLedgerLease, type ClientGatewayCommandOutcomeObserver } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { createExecutionAdmissionAuthority, type ExecutionScopeAttestor } from "../../../../../runtime/execution-admission/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore as Store } from "../../../../../framework/persistence/project/execution-admission/index.ts";
import type { AutomationStudioProjectCommandLedgerStore, AutomationStudioCommandRunAdmission } from "../../../../../framework/persistence/project/command-ledger/index.ts";
import type { AutomationStudioExecutionAdmissionContinuation } from "./continuation.ts";
import type { AutomationStudioExecutionAdmissionPorts } from "./ports.ts";
import type { AutomationStudioExecutionAdmissionOptions } from "./options.ts";
import type { AutomationStudioExecutionCommandBridge } from "./command-bridge.ts";
import type { AutomationStudioExecutionConsumptionReader } from "./consumption-reader.ts";
import { AutomationStudioExecutionScopeOwner } from "./binding.ts";
import { AutomationStudioExecutionRootRuns } from "./run.ts";
import { AutomationStudioObservedGatewaySource } from "./gateway.ts";
import type { AutomationStudioObservedCommandContext } from "./context.ts";
/** Service-owned lifetime for real SQL continuations and original ordinary Contexts. */
export class AutomationStudioExecutionAdmissionController implements AutomationStudioExecutionCommandBridge {
    private readonly contexts = new WeakMap<Context, AutomationStudioObservedCommandContext>();
    private readonly continuations = new Set<AutomationStudioExecutionAdmissionContinuation>();
    private readonly openings = new Set<Promise<unknown>>();
    private readonly consumption: AutomationStudioExecutionConsumptionReader;
    private readonly attestScope: ExecutionScopeAttestor["attest"] | undefined;
    private closed = false;
    private closing: Promise<void> | undefined;
    constructor(private readonly ports: AutomationStudioExecutionAdmissionPorts) {
        const attestor = ports.scopeAttestor;
        this.attestScope = attestor?.attest.bind(attestor);
        this.consumption = ports.requiredOwner.bindExecutionAdmissionBridge(this);
    }
    open(options: AutomationStudioExecutionAdmissionOptions): Promise<AutomationStudioExecutionAdmissionContinuation> {
        this.assertOpen();
        const pending = this.openStored(options);
        this.openings.add(pending);
        void pending.then(() => this.openings.delete(pending), () => { /* best-effort: retire tracking; the original opening reports its rejection. */ this.openings.delete(pending); });
        return pending;
    }
    owns(context: Context): boolean { return this.contexts.get(context)?.required === false; }
    resolve(context: Context): Promise<ClientGatewayCommandLedgerLease> {
        this.assertOpen();
        const binding = this.contexts.get(context);
        if (!binding || binding.required)
            throw new Error("execution_admission.foreign_ordinary_context");
        return binding.resolve();
    }
    claim(context: Context, store: AutomationStudioProjectCommandLedgerStore, claim: ClientGatewayCommandClaim, admission: AutomationStudioCommandRunAdmission) {
        const binding = this.contexts.get(context);
        if (!binding)
            return undefined;
        this.assertOpen();
        if (!binding.required || !this.ports.requiredOwner.owns(context))
            throw new Error("execution_admission.foreign_required_context");
        return binding.claim(store, claim, admission);
    }
    completed(context: Context, observer: ClientGatewayCommandOutcomeObserver, originalProof: object): Promise<void> {
        return this.contexts.get(context)?.completed(observer, originalProof) ?? Promise.resolve();
    }
    uncertain(context: Context, withdrawn: boolean): Promise<void> {
        return this.contexts.get(context)?.uncertain(withdrawn) ?? Promise.resolve();
    }
    consumed(context: Context, originalProof: object): Promise<void> {
        const binding = this.contexts.get(context);
        if (!binding)
            return Promise.resolve();
        const witness = this.consumption.read(originalProof, context);
        if (!witness || !binding.required || !this.ports.requiredOwner.owns(context))
            throw new Error("execution_admission.foreign_consumption");
        return binding.consumed(witness.handlingDigest);
    }
    close(): Promise<void> {
        this.closed = true;
        this.closing ??= (async () => {
            await Promise.allSettled([...this.openings]);
            const results = await Promise.allSettled([...this.continuations].map(continuation => continuation.close()));
            const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
            if (errors.length)
                throw new AggregateError(errors, "execution_admission.controller_close_failed");
        })();
        return this.closing;
    }
    private async openStored(options: AutomationStudioExecutionAdmissionOptions): Promise<AutomationStudioExecutionAdmissionContinuation> {
        const store = await Store.open({ pool: this.ports.pool!, projectId: options.projectId });
        try {
            const owner = await AutomationStudioExecutionScopeOwner.open(store, options.flowId, this.attestScope);
            const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes: owner });
            const scope = await assembly.openScope(owner.proof);
            this.assertOpen();
            const runs = new AutomationStudioExecutionRootRuns(store, assembly.entryBridge, owner.binding);
            const gateway = new AutomationStudioObservedGatewaySource({ assembly, scope, binding: owner.binding, store, runs, collaborators: this.ports, register: (context, binding) => {
                    if (this.contexts.has(context))
                        throw new Error("execution_admission.context_rebound");
                    this.contexts.set(context, binding);
                } });
            let closing: Promise<void> | undefined;
            const continuation: AutomationStudioExecutionAdmissionContinuation = Object.freeze({ assembly, scope, binding: owner.binding, gateway,
                issueOrdinaryRunBinding: (originalRoot: Parameters<AutomationStudioExecutionRootRuns["issue"]>[0]) => runs.issue(originalRoot),
                readOrdinaryRunBinding: runs.readOrdinaryRunBinding.bind(runs),
                close: () => closing ??= (async () => {
                    runs.close();
                    const results = await Promise.allSettled([gateway.close()]);
                    try {
                        await store.close();
                    }
                    catch (error) {
                        results.push({ status: "rejected", reason: error });
                    }
                    this.continuations.delete(continuation);
                    const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
                    if (errors.length)
                        throw new AggregateError(errors, "execution_admission.continuation_close_failed");
                })()
            });
            this.continuations.add(continuation);
            return continuation;
        }
        catch (error) {
            try {
                await store.close();
            }
            catch (cleanupError) {
                throw new AggregateError([error, cleanupError], "execution_admission.open_cleanup_failed");
            }
            throw error;
        }
    }
    private assertOpen(): void {
        if (this.closed || !this.ports.pool || this.ports.pool.isClosing)
            throw new Error("execution_admission.storage_unavailable");
    }
}
