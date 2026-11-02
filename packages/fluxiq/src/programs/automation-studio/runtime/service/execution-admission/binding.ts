import type { ExecutionScopeAttestor, ExecutionScopeBinding, ExecutionScopeOwner } from "../../../../../runtime/execution-admission/index.ts";
import { executionBinding, executionRecord, executionText, isExecutionCapability } from "../../../../../runtime/execution-admission/validation/index.ts";
import { ClientGatewayCommandLedgerController as Rules } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { AutomationStudioProjectExecutionAdmissionStore } from "../../../storage/project/execution-admission/index.ts";
type ScopeRecord = NonNullable<ReturnType<ExecutionScopeOwner["readBinding"]>>;

/** Persisted Flow identity plus an optional original, trusted resource owner. */
export class AutomationStudioExecutionScopeOwner implements ExecutionScopeOwner {
    private constructor(readonly binding: ExecutionScopeBinding, readonly proof: object = Object.freeze({}), private readonly attested?: () => ScopeRecord) { }
    static async open(store: AutomationStudioProjectExecutionAdmissionStore, flowId: string, attest?: ExecutionScopeAttestor["attest"]): Promise<AutomationStudioExecutionScopeOwner> {
        const anchor = await store.flowBinding(flowId);
        const attestation = attest ? await attest(anchor) : null;
        if (attestation === null) return new AutomationStudioExecutionScopeOwner(anchor);
        const selected = executionRecord(attestation, ["owner", "proof"], ["owner", "proof"], "scope_attestation");
        const owner = selected.owner, proof = selected.proof;
        if (!isExecutionCapability(owner) || !isExecutionCapability(proof)) throw new Error("execution_admission.invalid_scope_attestation");
        const original = Reflect.get(owner, "readBinding") as ExecutionScopeOwner["readBinding"] | undefined;
        if (typeof original !== "function") throw new Error("execution_admission.invalid_scope_attestation");
        const read = original.bind(owner);
        const initial = readAttestation(read(proof), anchor);
        const snapshot = JSON.stringify(initial);
        return new AutomationStudioExecutionScopeOwner(initial.binding, proof, () => {
            const current = readAttestation(read(proof), anchor);
            if (JSON.stringify(current) !== snapshot) throw new Error("execution_admission.scope_attestation_changed");
            return current;
        });
    }
    readBinding(originalProof: object) {
        if (originalProof !== this.proof) return null;
        return this.attested ? this.attested() : Object.freeze({ binding: this.binding, baseline: "unverified" as const, baselineProofDigest: Rules.digest({ binding: this.binding, basis: "persisted_flow_resource_unverified" }) });
    }
}

function readAttestation(value: ReturnType<ExecutionScopeOwner["readBinding"]>, anchor: ExecutionScopeBinding): ScopeRecord {
    const row = executionRecord(value, ["binding", "baseline", "baselineProofDigest"], ["binding", "baseline", "baselineProofDigest"], "scope_attestation");
    const binding = executionBinding(row.binding);
    if (binding.projectId !== anchor.projectId || binding.ownerKey !== anchor.ownerKey || binding.continuationKey !== anchor.continuationKey || binding.coverageEpoch !== anchor.coverageEpoch) throw new Error("execution_admission.scope_anchor_changed");
    if (row.baseline !== "complete" && row.baseline !== "unverified") throw new Error("execution_admission.invalid_baseline");
    return Object.freeze({ binding, baseline: row.baseline, baselineProofDigest: executionText(row.baselineProofDigest, "baseline_proof") });
}
