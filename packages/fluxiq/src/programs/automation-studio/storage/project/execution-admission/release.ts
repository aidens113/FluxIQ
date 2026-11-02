import type { ExecutionAdmissionPersistence } from "../../../../../runtime/execution-admission/index.ts";
import { executionText } from "../../../../../runtime/execution-admission/validation/index.ts";
import { mutateExecutionAdmission } from "./mutation.ts";
import { executionAdmissionTouches } from "./state.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
export async function releaseExecutionAdmission(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["release"]>[0]): Promise<void> {
    const rootId = executionText(input.rootId, "root");
    const ownerIncarnation = executionText(input.ownerIncarnation, "incarnation");
    await mutateExecutionAdmission(context, "release", rootId, { rootId, ownerIncarnation }, (snapshot, eventId) => {
        const root = snapshot.rows.entries.get(rootId);
        if (!root || root.row.parentId !== undefined || root.row.ownerIncarnation !== ownerIncarnation || !root.active)
            throw new Error("execution_admission.foreign_release");
        const changes = executionAdmissionTouches(snapshot, root, eventId).filter(change => change.table !== "fences");
        for (const resource of root.row.resourceKeys) {
            const fence = snapshot.rows.fences.get(resource);
            if (!fence || fence.rootId !== rootId || fence.ownerIncarnation !== ownerIncarnation || fence.fenceGeneration !== root.fenceGeneration)
                throw new Error("execution_admission.stale_release");
            changes.push({ table: "fences", key: resource, value: { ...fence, rootId: null, ownerIncarnation: null, fenceGeneration: null, revision: fence.revision + 1, proofEventId: eventId } });
        }
        changes.push({ table: "entries", key: rootId, value: { ...root, active: false, revision: root.revision + 1, proofEventId: eventId } });
        return changes;
    });
}
