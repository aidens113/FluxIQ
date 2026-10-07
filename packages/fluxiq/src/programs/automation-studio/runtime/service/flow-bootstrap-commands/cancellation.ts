import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";

/** Active builds, including ones queued on a lock. Cancellation remains scoped to one operation. */
export class AutomationStudioBuildCancellation {
  private readonly active = new Map<string, Set<AbortController>>();
  private readonly scope = new AsyncLocalStorage<AbortController>();

  async run<T>(projectId: string, flowId: string, work: () => Promise<T>, parent?: AbortSignal): Promise<T> {
    const key = JSON.stringify([projectId, flowId]);
    const controller = new AbortController();
    const aborted = () => controller.abort(parent?.reason);
    if (parent?.aborted) aborted(); else parent?.addEventListener("abort", aborted, { once: true });
    const active = this.active.get(key) ?? new Set<AbortController>();
    active.add(controller); this.active.set(key, active);
    try {
      return await this.scope.run(controller, async () => {
        try { this.checkpoint(); const result = await work(); this.checkpoint(); return result; }
        catch (error) {
          if (!controller.signal.aborted) throw error;
          const cancelled = new DOMException("Build stopped. The Flow was not promoted.", "AbortError");
          // Preserve settled spend diagnostics when the interrupted loop supplied them.
          Object.assign(cancelled, { cause: error });
          throw cancelled;
        }
      });
    } finally {
      parent?.removeEventListener("abort", aborted);
      active.delete(controller);
      if (!active.size) this.active.delete(key);
    }
  }

  cancel(projectId: string, flowId: string): boolean {
    const active = this.active.get(JSON.stringify([projectId, flowId]));
    if (!active?.size) return false;
    for (const controller of active) controller.abort();
    return true;
  }

  signal(): AbortSignal | undefined { return this.scope.getStore()?.signal; }

  tool(execute: AutomationStudioLlmEvidenceLoopInput["executeTool"]): AutomationStudioLlmEvidenceLoopInput["executeTool"] {
    return async (call) => {
      this.checkpoint();
      const signal = this.signal();
      const result = await execute({ ...call, ...(signal ? { signal: AbortSignal.any([signal, ...(call.signal ? [call.signal] : [])]) } : {}) });
      this.checkpoint();
      return result;
    };
  }

  checkpoint(): void {
    if (this.signal()?.aborted) throw new DOMException("Build stopped. The Flow was not promoted.", "AbortError");
  }
}
