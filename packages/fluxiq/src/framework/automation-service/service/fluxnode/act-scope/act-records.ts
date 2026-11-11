// The act record of a FluxNode run that can be resumed, held until its resume (t909; `./act-scope.ts`).
//
// A task keeps one act record, its latest attempt's (`../../answer-first/task-memory/task-acts.ts`), and a
// FluxNode's runs share one task. So a run that ended `budget_out` or `waiting_for_person`, and then another
// run of the same FluxNode, leaves the task holding the other run's record; the resume, scoped to the first
// run, would find nothing of its own and press again what the first run landed. So the record a resumable
// run ends with is held here, by its scope, and put back as the task's record just before its resume's
// attempt opens, which then carries it (`../../answer-first/attempt/opening.ts`).
//
// Held in memory, as the resume handle that can continue it is (`../run-registry.ts`): a handle does not
// outlive a restart, and neither does this. A record whose attempt ran under another scope is never held
// or put back for this one.
//
// **The task memory is reached by a dynamic import**, as the pins reach it (`../pin/pins.ts`): a static one
// would close a module cycle through the result checks.

import type { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioAnswerFirstTaskActs, AutomationStudioAnswerFirstTaskMemory, AutomationStudioAnswerFirstTaskMemoryStore } from "../../answer-first/task-memory/index.ts";

/** Where a run's acts are kept: its project, and its attempt's task key (`../caller-key.ts`). */
export type FluxNodeActRecordAt = { projectId: string; taskKey: string };

export class FluxNodeActRecords {
  private readonly held = new Map<string, AutomationStudioAnswerFirstTaskActs>();

  constructor(private readonly service: AutomationStudioService) {}

  /** After a run that can be resumed: holds the task's record when it is this run's own. */
  async keep(at: FluxNodeActRecordAt, scope: string): Promise<void> {
    const { kept } = await this.read(at);
    if (kept?.acts && scopeOf(kept, kept.acts.attemptId) === scope) this.held.set(keyOf(at, scope), structuredClone(kept.acts));
  }

  /** Before a run's attempt opens: puts back the record held for its scope where the task now holds another execution's. */
  async restore(at: FluxNodeActRecordAt, scope: string): Promise<void> {
    const key = keyOf(at, scope);
    const ours = this.held.get(key);
    if (!ours) return;
    this.held.delete(key);
    const { kept, memory, taskId } = await this.read(at);
    if (kept?.acts && scopeOf(kept, kept.acts.attemptId) === scope) return;
    await memory.update(at.projectId, taskId, (current) => ({ ...current, acts: structuredClone(ours) }));
  }

  private async read(at: FluxNodeActRecordAt): Promise<{ kept: AutomationStudioAnswerFirstTaskMemory | undefined; memory: AutomationStudioAnswerFirstTaskMemoryStore; taskId: string }> {
    const [{ automationStudioAnswerFirstTaskMemoryOf }, { automationStudioAnswerFirstTaskKey }] = await Promise.all([import("../../answer-first/task-memory/index.ts"), import("../../answer-first/task-key/index.ts")]);
    const memory = automationStudioAnswerFirstTaskMemoryOf(this.service, { paths: this.service.projectPaths, projects: this.service.projects });
    const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: at.taskKey });
    return { kept: await memory.get(at.projectId, taskId), memory, taskId };
  }
}

function scopeOf(kept: AutomationStudioAnswerFirstTaskMemory, attemptId: string): string | undefined {
  return kept.attempts.find((attempt) => attempt.attemptId === attemptId)?.caller?.actScope;
}

function keyOf(at: FluxNodeActRecordAt, scope: string): string {
  return JSON.stringify([at.projectId, at.taskKey, scope]);
}
