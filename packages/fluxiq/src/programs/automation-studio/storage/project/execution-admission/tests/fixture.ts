import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutomationStudioProjectDatabasePool } from "../../../../../../framework/persistence/project/sql/index.ts";
import { AutomationStudioProjectExecutionAdmissionStore } from "../../../../../../framework/persistence/project/execution-admission/index.ts";
import { createExecutionAdmissionAuthority, type ExecutionAdmissionAssembly, type ExecutionScope, type ExecutionScopeBinding, type ExecutionScopeOwner } from "../../../../../../runtime/execution-admission/index.ts";
import { AdmissionTestSource } from "../../../../../../runtime/execution-admission/tests/source.ts";
export async function sqlAdmissionFixture(operation: (fixture: {
    root: string;
    pool: AutomationStudioProjectDatabasePool;
    store: AutomationStudioProjectExecutionAdmissionStore;
}) => Promise<void>): Promise<void> {
    const root = await mkdtemp(path.join(os.tmpdir(), "execution-admission-"));
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    const store = await AutomationStudioProjectExecutionAdmissionStore.open({ pool, projectId: "project.isolated" });
    try {
        await operation({ root, pool, store });
    }
    finally {
        await store.close();
        await pool.closeAll();
        const resolved = path.resolve(root);
        if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("execution-admission-"))
            throw new Error("Refusing cleanup outside owned admission fixture.");
        await rm(resolved, { recursive: true, force: true });
    }
}
export async function sqlAdmissionAuthority(store: AutomationStudioProjectExecutionAdmissionStore, options: {
    projectId?: string;
    continuation?: string;
    baseline?: "complete" | "unverified";
    resources?: string[];
    epoch?: string;
    series?: boolean;
    runId?: string;
    configure?: (assembly: ExecutionAdmissionAssembly, scope: ExecutionScope, source: AdmissionTestSource) => void;
} = {}) {
    const proof = Object.freeze({});
    const binding: ExecutionScopeBinding = { projectId: options.projectId ?? "project.isolated", ownerKey: "fixture.actual-owner", continuationKey: options.continuation ?? "flow.actual", resourceKeys: options.resources ?? ["fixture.actual-resource"], coverageEpoch: options.epoch ?? "epoch.actual" };
    const scopes: ExecutionScopeOwner = { readBinding: original => original === proof ? { binding, baseline: options.baseline ?? "complete", baselineProofDigest: "fixture.actual-fresh-isolated-resource" } : null };
    const assembly = createExecutionAdmissionAuthority({ persistence: store, scopes });
    const scope = await assembly.openScope(proof);
    const source = new AdmissionTestSource(scope, "fixture.actual-source", options.series ? { kind: "trial_series", seriesKey: "actual.stable-series" } : { kind: "ordinary" });
    source.delegatesTo.push(source.owner);
    options.configure?.(assembly, scope, source);
    const ports = assembly.registerSource(source);
    const origin = source.origin(undefined, options.runId);
    const grant = ports.issuer.fromOrdinaryAdmission(source.admit(origin));
    return { assembly, scope, source, ports, origin, grant, binding };
}
