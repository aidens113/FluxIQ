import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";

/** The service's own session ports, as a build's trial environment binds them (`trial-ports/environment.ts`: `openSession`, `writeSession`). */
export type AutomationStudioAnswerFirstSessionPorts = {
  openSession(input: { runId: string; metadata: JsonObject }): Promise<AutomationStudioRuntimeSession>;
  writeSession(session: AutomationStudioRuntimeSession): Promise<void>;
};
