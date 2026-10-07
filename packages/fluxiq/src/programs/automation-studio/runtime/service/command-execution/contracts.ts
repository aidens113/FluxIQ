import type { AutomationStudioCommandRunPorts } from "../command-run/index.ts";

/** Actual stored-session/private-pool collaborators, never caller JSON. */
export type AutomationStudioCommandExecutionPorts = Omit<AutomationStudioCommandRunPorts, "executorOwner">;
