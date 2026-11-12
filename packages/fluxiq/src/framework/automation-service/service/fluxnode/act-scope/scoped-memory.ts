import type { AutomationStudioService } from "../../../service.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import type { FluxNodeRegistered } from "../pipeline/index.ts";

/** A pre-admission storage refusal. The caller must hold the execution owner while checking and launching. */
export async function fluxNodeScopedMemoryProblem(input: { service: AutomationStudioService; registered: FluxNodeRegistered; scope: string; taskKey?: string | undefined }): Promise<Error | undefined> {
  try {
    const { automationStudioAnswerFirstTaskMemoryOf } = await import("../../answer-first/task-memory/index.ts");
    const { automationStudioAnswerFirstTaskKey } = await import("../../answer-first/task-key/index.ts");
    const memory = automationStudioAnswerFirstTaskMemoryOf(input.service, { paths: input.service.projectPaths, projects: input.service.projects });
    // Pin status may change while the service is down; no variant may silently erase unreadable scope ownership.
    const keys = new Set([
      input.taskKey, fluxNodeCallerKey(input.registered), fluxNodeCallerKey({ ...input.registered, pinned: true }),
      fluxNodeCallerKey({ ...input.registered, explore: input.scope })
    ]);
    for (const callerKey of keys) if (callerKey !== undefined) await memory.get(input.registered.projectId, automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey }), { scoped: true });
    return undefined;
  } catch (cause) {
    return new Error("Core cannot read this execution's stored execution state. Repair its task memory before retrying.", { cause });
  }
}
