import type { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioCommandExecutionController } from "../command-execution/index.ts";
import type { ExecutionScopeAttestor } from "../../../../../runtime/execution-admission/index.ts";
/** Original service collaborators; absence of a pool never creates an observed continuation. */
export interface AutomationStudioExecutionAdmissionPorts {
    readonly pool?: AutomationStudioProjectDatabasePool;
    readonly requiredOwner: AutomationStudioCommandExecutionController;
    readonly scopeAttestor?: ExecutionScopeAttestor;
    getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
}
