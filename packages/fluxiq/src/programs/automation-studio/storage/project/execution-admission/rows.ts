import type { ExecutionEntryRow, ExecutionScopeBinding, VerifiedExecutionEvidence } from "../../../../../runtime/execution-admission/index.ts";
/** Materialized coverage rows; command outcome truth stays in the gateway journal. */
export interface ExecutionAdmissionRows {
    scopes: {
        scopeId: string;
        identity: string;
        binding: ExecutionScopeBinding;
        baseline: "complete" | "unverified";
        baselineProofDigest: string;
        revision: number;
        proofEventId: string;
    };
    entries: {
        row: ExecutionEntryRow;
        enteredLive: boolean;
        revision: number;
        fenceGeneration: string;
        active: boolean;
        closure: Extract<VerifiedExecutionEvidence, {
            kind: "coverage_complete";
        }> | null;
        frontierDigest: string | null;
        proofEventId: string;
    };
    fences: {
        resourceKey: string;
        revision: number;
        rootId: string | null;
        ownerIncarnation: string | null;
        fenceGeneration: string | null;
        proofEventId: string;
    };
    facts: {
        factId: string;
        entryId: string;
        evidence: Exclude<VerifiedExecutionEvidence, {
            kind: "coverage_complete";
        }>;
        proofEventId: string;
    };
    links: {
        commandId: string;
        entryId: string;
        scopeId: string;
        rootId: string;
        required: boolean;
        fenceGeneration: string;
        originDigest: string;
        claimDigest: string;
        proofEventId: string;
    };
}
