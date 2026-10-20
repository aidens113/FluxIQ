import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientGatewayChannelScopeSource } from "../../../../client-gateway/service/channel-scope/index.ts";
import type { ClientGatewayTimerSource } from "../../../../client-gateway/service/index.ts";

/** What one scope's work carries: the scope id, and the timer source its deadlines run on (none: the gateway's own). */
type ScopeFrame = {
  readonly scopeId: string;
  readonly timers: ClientGatewayTimerSource | undefined;
};

const scopes = new AsyncLocalStorage<ScopeFrame>();

/**
 * The channel scope an environment's work runs in, held in an async-context
 * scope for the whole of that work, so every gateway command it issues and
 * every session list it reads is bounded by it: Core's client gateway reads it
 * from `AutomationStudioChannelScope.gatewaySource`, as it reads the host lease
 * (`../project-agents/host-resources/lease-scope.ts`). Work a scope outlives --
 * a promise left running -- keeps the scope.
 *
 * A scope may also carry its environment's timer source (traces and offline
 * trials, P4, "Virtual clock"): the gateway's answer, durable and reconcile
 * waits for a command sent inside it then run on that source, so an offline
 * run's deadlines fire in its virtual time. Live work carries none.
 */
export class AutomationStudioChannelScope {
  /** What the host hands the client gateway as its `channelScope` source. */
  static readonly gatewaySource: ClientGatewayChannelScopeSource = Object.freeze({
    current: (): string | undefined => scopes.getStore()?.scopeId,
    timers: (): ClientGatewayTimerSource | undefined => scopes.getStore()?.timers
  });

  /** The scope the calling async context runs in, or nothing outside any scope (live). */
  static current(): string | undefined {
    return scopes.getStore()?.scopeId;
  }

  /**
   * Runs `work` inside `scopeId`, its gateway waits on `timers` when given; a
   * scope entered inside another replaces it, timers included, for that work.
   */
  static run<T>(scopeId: string, work: () => Promise<T>, timers?: ClientGatewayTimerSource): Promise<T> {
    if (typeof scopeId !== "string" || !scopeId) throw new Error("channel_scope.scope_id_required");
    return scopes.run({ scopeId, timers }, work);
  }
}
