import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandOutcome as Outcome, ClientGatewayDurableDispatch as Dispatch, type ClientGatewayCommandClaim, type ClientGatewayCommandLedgerLease, type ClientGatewayCommandOutcomeObserver } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionAdmissionProducer, ExecutionEntry, VerifiedExecutionEvidence } from "../../../../../runtime/execution-admission/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Ledger, type AutomationStudioCommandRunAdmission } from "../../../../../framework/persistence/project/command-ledger/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";
import type { ExecutionAdmissionCommandLink } from "../../../../../framework/persistence/project/execution-admission/index.ts";
/** One original gateway invocation. It owns no second journal or completion observer. */
export class AutomationStudioObservedCommandContext {
    private readonly observer: ClientGatewayCommandOutcomeObserver;
    private readonly claims = new Set<Promise<unknown>>();
    private readonly operations = new Set<Promise<unknown>>();
    private readonly leases = new Set<ClientGatewayCommandLedgerLease>();
    private revoked = false;
    private claimStarted = false;
    private resolved = false;
    private delivered = false;
    private terminal: Promise<void> | undefined;
    constructor(readonly context: Context, readonly required: boolean, private readonly ports: {
        readonly pool: AutomationStudioProjectDatabasePool;
        readonly entry: ExecutionEntry;
        readonly link: ExecutionAdmissionCommandLink;
        readonly producer: ExecutionAdmissionProducer;
        evidence(value: VerifiedExecutionEvidence): object;
        validate(): Promise<void>;
    }) {
        this.observer = { completed: proof => this.completed(this.observer, proof), uncertain: async (received) => {
                if (received !== context)
                    throw new Error("execution_admission.foreign_uncertainty");
                await this.uncertain(false);
            } };
        if (!required)
            Outcome.require(context, this.observer);
    }
    resolve(): Promise<ClientGatewayCommandLedgerLease> { return this.track(this.resolveStored()); }
    private async resolveStored(): Promise<ClientGatewayCommandLedgerLease> {
        this.assertLive();
        if (this.required || this.resolved)
            throw new Error("execution_admission.context_already_resolved");
        this.resolved = true;
        await this.ports.validate();
        this.assertLive();
        const store = await Ledger.open({ pool: this.ports.pool, projectId: Context.owner(this.context).projectId });
        let closing: Promise<void> | undefined;
        const close = () => closing ??= store.close().finally(() => this.leases.delete(lease));
        const exact = (claim: ClientGatewayCommandClaim) => {
            Rules.validateClaim(claim);
            const owner = Context.owner(this.context), actual = claim.binding;
            if (Object.keys(owner).some(key => actual[key as keyof typeof owner] !== owner[key as keyof typeof owner]))
                throw new Error("execution_admission.context_claim_conflict");
            return claim;
        };
        const lease: ClientGatewayCommandLedgerLease = { outcomeObserver: this.observer, ledger: {
                claim: claim => this.claim(store, exact(claim)),
                read: claim => store.read(exact(claim)),
                commitReceipt: (claim, receipt) => store.commitReceipt(exact(claim), receipt),
                markUnknown: (claim, reason) => store.markUnknown(exact(claim), reason)
            }, close };
        try {
            this.assertLive();
            store.bindExecutionAdmission(this.ports.link);
            this.leases.add(lease);
            return lease;
        }
        catch (error) {
            await close();
            throw error;
        }
    }
    claim(store: Ledger, claim: ClientGatewayCommandClaim, admission?: AutomationStudioCommandRunAdmission): ReturnType<Ledger["claimForExecution"]> {
        this.assertLive();
        this.claimStarted = true;
        const pending = (async () => {
            await this.ports.validate();
            this.assertLive();
            store.bindExecutionAdmission(this.ports.link);
            const result = await store.claimForExecution(claim, this.ports.entry, admission);
            if (result.sendAllowed) {
                try {
                    this.assertLive();
                    await this.ports.validate();
                    this.assertLive();
                }
                catch (error) {
                    await store.markUnknown(claim, "cancelled_before_send");
                    throw error;
                }
            }
            return result;
        })();
        this.claims.add(pending);
        void pending.then(() => this.claims.delete(pending), () => { /* best-effort: retire tracking; the original claim promise still rejects to its caller. */ this.claims.delete(pending); });
        return pending;
    }
    completed(observer: ClientGatewayCommandOutcomeObserver, originalProof: object): Promise<void> {
        // This read must precede every await, including ownership/database validation.
        const completion = Dispatch.readCompletionProof(originalProof, this.context, observer);
        this.assertLive();
        return this.track((async () => {
            await this.ports.validate();
            this.assertLive();
            Dispatch.readCompletionProof(originalProof, this.context, observer);
            await this.ports.producer.observe(this.ports.entry, this.ports.evidence({ kind: "command_delivery", commandId: completion.claim.binding.commandId, claimDigest: Rules.digest(completion.claim), receiptDigest: Rules.digest(completion.receipt) }));
            Dispatch.readCompletionProof(originalProof, this.context, observer);
            this.delivered = true;
            if (!this.required)
                await this.finish("settled", Rules.digest(completion.receipt), Rules.digest({ basis: "original_gateway_completion", commandId: completion.claim.binding.commandId }));
        })());
    }
    consumed(handlingDigest: string): Promise<void> {
        this.assertLive();
        if (!this.required || !this.delivered)
            throw new Error("execution_admission.unhandled_command");
        return this.track((async () => {
            const commandId = Rules.commandId(Context.owner(this.context));
            await this.ports.producer.observe(this.ports.entry, this.ports.evidence({ kind: "required_consumed", commandId, handlingDigest }));
            await this.finish("settled", handlingDigest, Rules.digest({ basis: "original_required_handling", commandId }));
        })());
    }
    uncertain(authenticRequiredWithdrawal: boolean): Promise<void> {
        this.revoked = true;
        this.terminal ??= this.track((async () => {
            await Promise.allSettled([...this.claims]);
            if (this.delivered && !this.required)
                return;
            if (!this.claimStarted && (!this.required || authenticRequiredWithdrawal)) {
                // Revocation happened synchronously before any claim; the sole gateway claims before send.
                await this.finish("unacted", Rules.digest({ context: Context.owner(this.context), basis: "revoked_before_claim" }), Rules.digest({ basis: "permanent_private_context_revocation" }));
            }
            else if (this.required) {
                await this.ports.producer.observe(this.ports.entry, this.ports.evidence({ kind: "required_latched", code: "required_command_outcome_unhandled" }));
            }
            else {
                await this.ports.producer.interrupted(this.ports.entry, "observer_failed");
            }
        })());
        return this.terminal;
    }
    async close(): Promise<void> {
        this.revoked = true;
        await Promise.allSettled([...this.operations]);
        await Promise.allSettled([...this.claims]);
        const results = await Promise.allSettled([...this.leases].map(lease => lease.close()));
        const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
        if (errors.length)
            throw new AggregateError(errors, "execution_admission.context_close_failed");
    }
    private finish(disposition: "unacted" | "settled", completionDigest: string, assessmentDigest: string): Promise<void> {
        return this.ports.producer.finish(this.ports.entry, this.ports.evidence({ kind: "coverage_complete", disposition, completionDigest, assessmentDigest }));
    }
    private assertLive(): void {
        if (this.revoked)
            throw new Error("execution_admission.context_revoked");
    }
    private track<T>(pending: Promise<T>): Promise<T> {
        this.operations.add(pending);
        void pending.then(() => this.operations.delete(pending), () => { /* best-effort: retire tracking; the original operation still reports its rejection. */ this.operations.delete(pending); });
        return pending;
    }
}
