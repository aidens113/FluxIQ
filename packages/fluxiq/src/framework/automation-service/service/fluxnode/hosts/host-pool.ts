import type { ClientGatewayService } from "../../../../../client-gateway/index.ts";
import { AutomationStudioHostLeaseScope, AutomationStudioHostResourceScheduler } from "../../../../../runtime/project-agents/host-resources/index.ts";
import { createFluxNodeManagedHostPort } from "./managed-host-port.ts";

/** The run owns one managed browser until all its work has finished. */
export class FluxNodeHostPool {
  private readonly scope: AutomationStudioHostLeaseScope;
  private readonly unsubscribe: () => void;
  private readonly stopping = new AbortController();
  private readonly running = new Set<Promise<unknown>>();
  private closing: Promise<void> | undefined;

  constructor(private readonly options: { gateway: ClientGatewayService; domainId: string; capacity: number }) {
    const scheduler = new AutomationStudioHostResourceScheduler(createFluxNodeManagedHostPort({ sessions: () => options.gateway.snapshot().sessions, domainId: options.domainId, capacity: options.capacity }));
    this.scope = new AutomationStudioHostLeaseScope(scheduler);
    this.unsubscribe = options.gateway.onEvent(() => scheduler.retryWaiting());
  }

  get domainId(): string { return this.options.domainId; }

  run<T>(runId: string, projectId: string, signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const inherited = AutomationStudioHostLeaseScope.current();
    if (inherited && this.scope.scheduler.isCurrent(inherited)) throw new Error("managed_host.nested_lease: A pipeline controller must not hold a browser while its child calls acquire one.");
    const combined = AbortSignal.any([signal, this.stopping.signal]);
    const running = this.scope.run({ role: "fluxnode-run", briefId: runId }, async (lease) => {
      if (lease.sessionId === undefined) throw new Error("managed_host.lease_session_missing");
      const release = this.options.gateway.managedHosts.bindRun({ runId, projectId, domainId: this.options.domainId, sessionId: lease.sessionId,
        lease: { ...lease, sessionId: lease.sessionId }, isCurrent: () => !combined.aborted && this.scope.scheduler.isCurrent(lease) });
      try {
        combined.throwIfAborted();
        return await work(combined);
      } finally {
        release();
      }
    }, { signal: combined });
    this.running.add(running);
    void running.finally(() => this.running.delete(running)).catch(/* best-effort: the leaf caller awaits the original run; this only removes its tracking entry */ () => undefined);
    return running;
  }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.stopping.abort(new Error("The managed host pool is closing."));
      this.unsubscribe();
      // Every leaf caller still receives its own outcome. Shutdown waits for
      // their cleanup, including owner release, before the instance can close.
      await Promise.allSettled([...this.running]);
    })();
  }
}
