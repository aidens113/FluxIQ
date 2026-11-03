import type { AutomationStudioSqlExecutor } from "../sql/index.ts";
import { automationStudioMutationDigest as digest } from "../mutations/index.ts";
import { executionAdmissionDecode, executionAdmissionEventValue } from "./codec.ts";
import { readExecutionAdmissionInventory } from "./inventory.ts";
import { executionAdmissionEventDigest } from "./proof.ts";
import { writeExecutionAdmissionEvent } from "./write.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
import type { ExecutionAdmissionSnapshot } from "./snapshot.ts";
export async function mutateExecutionAdmission(context: ExecutionAdmissionStorageContext, operation: Exclude<ExecutionAdmissionEvent["operation"], "command_link">, ownerId: string, input: unknown, plan: (snapshot: ExecutionAdmissionSnapshot, eventId: string, sql: AutomationStudioSqlExecutor) => ExecutionAdmissionEvent["changes"] | Promise<ExecutionAdmissionEvent["changes"]>): Promise<ExecutionAdmissionEvent> {
    const request = executionAdmissionDecode(JSON.stringify(input), 16 * 1024 * 1024);
    const key = digest({ operation, ownerId, request }).slice(7);
    const mutationId = `execution.${key}`;
    const eventId = `coverage.${key}`;
    let event: ExecutionAdmissionEvent | undefined;
    await context.unitOfWork.runIdempotent({ mutationId, ownerKind: "execution_admission", ownerId, operationKind: `execution_admission.${operation}`, requestDigest: digest({ operation, request }), validateAdmission: async (sql) => {
            const snapshot = await readExecutionAdmissionInventory(context, sql);
            if (snapshot.events.has(eventId))
                return;
            const changes = await plan(snapshot, eventId, sql);
            const value = { eventId, mutationId, ownerId, operation, request, changes };
            event = executionAdmissionEventValue({ ...value, proofDigest: executionAdmissionEventDigest(value) });
        } }, async (mutation) => {
        if (!event)
            throw new Error("execution_admission.missing_mutation_plan");
        await writeExecutionAdmissionEvent(mutation.sql, event);
        return { eventId, operation, proofDigest: event.proofDigest };
    });
    return await context.lease.database.transaction(async (sql) => {
        const snapshot = await readExecutionAdmissionInventory(context, sql);
        const recorded = snapshot.events.get(eventId);
        if (!recorded)
            throw new Error("execution_admission.missing_mutation_result");
        return recorded;
    });
}
