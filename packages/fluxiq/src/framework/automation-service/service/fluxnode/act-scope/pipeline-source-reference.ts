import type { AutomationStudioAnswerFirstTaskMemory, AutomationStudioAnswerFirstTaskMemoryStore } from "../../answer-first/task-memory/index.ts";
import { PipelineError } from "../../pipelines/index.ts";

/** Only immutable dataset metadata belongs in hot task memory; rows stay with their dataset owner. */
export function fluxNodePipelineSourceReference(input: {
  memory: Pick<AutomationStudioAnswerFirstTaskMemoryStore, "get" | "update">;
  projectId: string;
  taskId: string;
  flowId: string;
  scope: string;
}): { read: () => Promise<{ snapshotId: string; count: number } | undefined>; write: (reference: { snapshotId: string; count: number }) => Promise<void> } {
  return {
    read: async () => referenceOf(await input.memory.get(input.projectId, input.taskId, { scoped: true }), input.scope),
    write: async (reference) => {
      await input.memory.update(input.projectId, input.taskId, (current) => {
        const previous = referenceOf(current, input.scope);
        if (previous && (previous.snapshotId !== reference.snapshotId || previous.count !== reference.count)) throw new PipelineError("pipeline.source_snapshot_conflict", "This execution already owns another immutable source enumeration.");
        return { ...current, flowId: input.flowId, pipelineSourcesByScope: { ...current.pipelineSourcesByScope, [input.scope]: { ...reference } } };
      }, { scoped: true });
    }
  };
}

function referenceOf(memory: AutomationStudioAnswerFirstTaskMemory | undefined, scope: string): { snapshotId: string; count: number } | undefined {
  const scopes = memory?.pipelineSourcesByScope;
  if (scopes === undefined) return undefined;
  if (!scopes || typeof scopes !== "object" || Array.isArray(scopes)) throw unreadable();
  if (!Object.hasOwn(scopes, scope)) return undefined;
  const reference = scopes[scope];
  if (!reference || typeof reference.snapshotId !== "string" || reference.snapshotId.trim() === "" || !Number.isSafeInteger(reference.count) || reference.count < 0) throw unreadable();
  return { snapshotId: reference.snapshotId, count: reference.count };
}

function unreadable(): PipelineError {
  return new PipelineError("pipeline.source_snapshot_unreadable", "The stored immutable source reference is unreadable; it cannot be replaced by a new enumeration.");
}
