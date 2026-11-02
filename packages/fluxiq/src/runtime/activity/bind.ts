import { emitAutomationStudioActivity } from "./emit.ts";
import { automationStudioActivityStorage } from "./storage.ts";

/**
 * Names the run the current pending run scope belongs to, once its session is
 * admitted, and says it started. Nothing is emitted before this, and a scope
 * that is not a pending run is left alone.
 */
export function bindAutomationStudioActivityRun(runId: string): void {
  const frame = automationStudioActivityStorage.getStore();
  if (!frame || !frame.pending || frame.scope.kind !== "run" || !runId) return;
  frame.scope = { ...frame.scope, id: runId };
  frame.pending = false;
  emitAutomationStudioActivity({ phase: "running", label: "Run started", detail: { kind: "note", title: "Run started", status: "started", ref: runId } });
}
