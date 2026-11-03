import { randomUUID } from "node:crypto";
import type { ExecutionAdmissionPersistence, ExecutionEntry, ExecutionEntryBridge, ExecutionScopeBinding } from "../../../../runtime/execution-admission/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../sql/index.ts";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../migrations/index.ts";
import { AutomationStudioProjectUnitOfWork, automationStudioMutationDigest as digest } from "../mutations/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../migrations/index.ts";
import { AutomationStudioProjectCommandLedgerStore, AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION } from "../command-ledger/index.ts";
import { AUTOMATION_STUDIO_EXECUTION_ADMISSION_MIGRATION } from "./migration.ts";
import { openExecutionAdmissionScope } from "./scope.ts";
import { reserveExecutionAdmission, enterExecutionAdmission } from "./admission.ts";
import { appendExecutionAdmissionEvidence } from "./evidence.ts";
import { finishExecutionAdmission } from "./finish.ts";
import { releaseExecutionAdmission } from "./release.ts";
import { readExecutionAdmissionInventory } from "./inventory.ts";
import { inspectExecutionAdmission, requireActiveExecutionEntry } from "./state.ts";
import { createExecutionAdmissionCommandLink } from "./commands/index.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
import type { ExecutionAdmissionCommandLink } from "./commands/index.ts";
import { executionText } from "../../../../runtime/execution-admission/validation/index.ts";
/** Real project coverage persistence, sharing the existing journal and UnitOfWork. */
export class AutomationStudioProjectExecutionAdmissionStore implements ExecutionAdmissionPersistence {
    private readonly pipelines = new Set<Promise<unknown>>();
    private readonly links = new WeakMap<object, {
        bridge: ExecutionEntryBridge;
        link: ExecutionAdmissionCommandLink;
    }>();
    private closed = false;
    private closing: Promise<void> | undefined;
    private constructor(private readonly context: ExecutionAdmissionStorageContext) { }
    static async open(input: {
        pool: AutomationStudioProjectDatabasePool;
        projectId: string;
    }): Promise<AutomationStudioProjectExecutionAdmissionStore> {
        const lease = await input.pool.acquire(input.projectId);
        let unitOfWork: AutomationStudioProjectUnitOfWork | undefined;
        let commands: AutomationStudioProjectCommandLedgerStore | undefined;
        try {
            await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: [...AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION, AUTOMATION_STUDIO_EXECUTION_ADMISSION_MIGRATION] }).migrate();
            unitOfWork = await AutomationStudioProjectUnitOfWork.open(input);
            commands = await AutomationStudioProjectCommandLedgerStore.open(input);
            return new AutomationStudioProjectExecutionAdmissionStore({ lease, unitOfWork, commands });
        }
        catch (error) {
            const cleanup = await Promise.allSettled([commands?.close(), unitOfWork?.close(), lease.release()]);
            const failures = cleanup.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
            if (failures.length)
                throw new AggregateError([error, ...failures], "execution_admission.open_cleanup_failed");
            throw error;
        }
    }
    open(input: Parameters<ExecutionAdmissionPersistence["open"]>[0]) { return this.pipeline(() => openExecutionAdmissionScope(this.context, input)); }
    inspect(scopeId: string): ReturnType<ExecutionAdmissionPersistence["inspect"]> {
        executionText(scopeId, "scope");
        return this.pipeline(async () => {
            try {
                return await this.context.lease.database.transaction(async (sql) => inspectExecutionAdmission(await readExecutionAdmissionInventory(this.context, sql), scopeId));
            }
            catch {
                return Object.freeze({ state: "unverified" as const, generation: "inventory-unverified", blockers: Object.freeze([Object.freeze({ entryId: scopeId, code: "inventory_unverified" })]) });
            }
        });
    }
    reserve(input: Parameters<ExecutionAdmissionPersistence["reserve"]>[0]) { return this.pipeline(() => reserveExecutionAdmission(this.context, input)); }
    enter(input: Parameters<ExecutionAdmissionPersistence["enter"]>[0]) { return this.pipeline(() => enterExecutionAdmission(this.context, input)); }
    append(input: Parameters<ExecutionAdmissionPersistence["append"]>[0]) { return this.pipeline(() => appendExecutionAdmissionEvidence(this.context, input)); }
    finish(input: Parameters<ExecutionAdmissionPersistence["finish"]>[0]) { return this.pipeline(() => finishExecutionAdmission(this.context, input)); }
    release(input: Parameters<ExecutionAdmissionPersistence["release"]>[0]) { return this.pipeline(() => releaseExecutionAdmission(this.context, input)); }
    commandLink(bridge: ExecutionEntryBridge, sourceOwner: object): ExecutionAdmissionCommandLink {
        this.assertOpen();
        const previous = this.links.get(sourceOwner);
        if (previous && previous.bridge !== bridge)
            throw new Error("execution_admission.bridge_rebound");
        if (previous)
            return previous.link;
        const link = createExecutionAdmissionCommandLink(this.context, bridge, sourceOwner, () => this.assertOpen());
        this.links.set(sourceOwner, { bridge, link });
        return link;
    }
    validateOriginalEntry(bridge: ExecutionEntryBridge, original: ExecutionEntry): Promise<void> {
        return this.pipeline(() => this.context.lease.database.transaction(async (sql) => {
            bridge.read(original);
            const snapshot = await readExecutionAdmissionInventory(this.context, sql);
            const current = bridge.read(original);
            const entry = requireActiveExecutionEntry(snapshot, current.row.entryId, current.fenceGeneration);
            if (!current.reservationActive || current.lifecycle !== "open" || digest(entry.row) !== digest(current.row))
                throw new Error("execution_admission.entry_owner_changed");
        }));
    }
    flowBinding(flowId: string): Promise<ExecutionScopeBinding> {
        executionText(flowId, "flow");
        return this.pipeline(() => this.context.lease.database.transaction(async (sql) => {
            const flow = await sql.get<{
                flow_id: string;
                status: string;
                deleted_at_ms: number | null;
            }>("select flow_id,status,deleted_at_ms from flows where flow_id=?", [flowId]);
            if (!flow || flow.flow_id !== flowId || flow.status === "deleted" || flow.deleted_at_ms !== null)
                throw new Error("execution_admission.persisted_flow_required");
            const snapshot = await readExecutionAdmissionInventory(this.context, sql);
            const projectId = this.context.lease.projectId;
            const identity = digest({ projectId, ownerKey: "studio.flow", continuationKey: flowId });
            const prior = snapshot.rows.scopes.get(`scope.${identity.slice(7)}`);
            return Object.freeze({ projectId, ownerKey: "studio.flow", continuationKey: flowId, resourceKeys: Object.freeze([`project-unknown.${digest(projectId).slice(7)}`]), coverageEpoch: prior?.binding.coverageEpoch ?? randomUUID() });
        }));
    }
    close(): Promise<void> {
        this.closed = true;
        this.closing ??= (async () => {
            await Promise.allSettled([...this.pipelines]);
            const results = await Promise.allSettled([this.context.commands.close(), this.context.unitOfWork.close(), this.context.lease.release()]);
            const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map(result => result.reason);
            if (errors.length)
                throw new AggregateError(errors, "execution_admission.close_failed");
        })();
        return this.closing;
    }
    private assertOpen(): void {
        if (this.closed)
            throw new Error("execution_admission.closed");
    }
    private pipeline<T>(operation: () => Promise<T>): Promise<T> {
        this.assertOpen();
        const promise = operation();
        this.pipelines.add(promise);
        void promise.then(() => this.pipelines.delete(promise), () => { /* best-effort: retire tracking; the original storage promise still reports its failure. */ this.pipelines.delete(promise); });
        return promise;
    }
}
