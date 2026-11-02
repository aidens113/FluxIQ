import type { ExecutionAdmissionPersistence, StoredExecutionScope } from "../../../../../runtime/execution-admission/index.ts";
import { executionBinding, executionText } from "../../../../../runtime/execution-admission/validation/index.ts";
import { automationStudioMutationDigest as digest } from "../unit-of-work.ts";
import { mutateExecutionAdmission } from "./mutation.ts";
import type { ExecutionAdmissionStorageContext } from "./context.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
export async function openExecutionAdmissionScope(context: ExecutionAdmissionStorageContext, input: Parameters<ExecutionAdmissionPersistence["open"]>[0]): Promise<StoredExecutionScope> {
    const binding = executionBinding(input.binding);
    if (binding.projectId !== context.lease.projectId || input.baseline !== "complete" && input.baseline !== "unverified")
        throw new Error("execution_admission.invalid_scope_owner");
    const baselineProofDigest = executionText(input.baselineProofDigest, "baseline_proof");
    const identity = digest({ projectId: binding.projectId, ownerKey: binding.ownerKey, continuationKey: binding.continuationKey });
    const scopeId = `scope.${identity.slice(7)}`;
    await mutateExecutionAdmission(context, "open", scopeId, { binding, baseline: input.baseline, baselineProofDigest }, (snapshot, eventId) => {
        const previous = snapshot.rows.scopes.get(scopeId);
        const changedResources = previous && digest(previous.binding.resourceKeys) !== digest(binding.resourceKeys);
        const unlinked = snapshot.commands.some(command => !snapshot.rows.links.has(command.claim.binding.commandId));
        const baseline = input.baseline === "unverified" || previous?.baseline === "unverified" || changedResources || unlinked ? "unverified" : "complete";
        const value: ExecutionAdmissionRows["scopes"] = { scopeId, identity, binding, baseline, baselineProofDigest: previous?.baselineProofDigest ?? baselineProofDigest, revision: (previous?.revision ?? -1) + 1, proofEventId: eventId };
        return [{ table: "scopes", key: scopeId, value }];
    });
    return Object.freeze({ scopeId, binding });
}
