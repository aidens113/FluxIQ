import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";

/** The scope a build's work runs in: its own controller, and the Flow it is registered under. */
type AutomationStudioBuildCancellationScope = {
  controller: AbortController;
  key: string;
};

/**
 * Active builds, including ones queued on a lock. Cancellation remains scoped to one operation.
 *
 * **A tree of scopes (t534).** The project supervisor runs a Flow's build in
 * one scope and each builder it dispatches in a child scope (`child`): the
 * parent's abort aborts every child, a child ending -- done, stopped on its own
 * signal, failed -- never aborts its parent or a sibling, and cancelling the
 * Flow (`cancel`) aborts the whole tree, since every child is registered under
 * the Flow its parent was.
 */
export class AutomationStudioBuildCancellation {
  private readonly active = new Map<string, Set<AbortController>>();
  private readonly scope = new AsyncLocalStorage<AutomationStudioBuildCancellationScope>();

  async run<T>(projectId: string, flowId: string, work: () => Promise<T>, parent?: AbortSignal): Promise<T> {
    return await this.enter(JSON.stringify([projectId, flowId]), work, parent);
  }

  /**
   * Run `work` in a child of the current scope, registered under the same
   * Flow. It is aborted when the current scope is, when the Flow is cancelled,
   * or when `stop` aborts; `stop` aborting stops this child alone. Its ending,
   * however it ends, leaves the current scope running. Only inside a build.
   */
  async child<T>(work: () => Promise<T>, stop?: AbortSignal): Promise<T> {
    const current = this.scope.getStore();
    if (!current) throw new Error("A child build scope opens only inside a running build.");
    const parent = stop ? AbortSignal.any([current.controller.signal, stop]) : current.controller.signal;
    return await this.enter(current.key, work, parent);
  }

  private async enter<T>(key: string, work: () => Promise<T>, parent?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const aborted = () => controller.abort(parent?.reason);
    if (parent?.aborted) aborted(); else parent?.addEventListener("abort", aborted, { once: true });
    const active = this.active.get(key) ?? new Set<AbortController>();
    active.add(controller); this.active.set(key, active);
    try {
      return await this.scope.run({ controller, key }, async () => {
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

  signal(): AbortSignal | undefined { return this.scope.getStore()?.controller.signal; }

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
