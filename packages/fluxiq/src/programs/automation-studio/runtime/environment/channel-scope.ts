import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientGatewayChannelScopeSource } from "../../../../client-gateway/service/channel-scope/index.ts";

const scopes = new AsyncLocalStorage<string>();

/**
 * The channel scope an environment's work runs in, held in an async-context
 * scope for the whole of that work, so every gateway command it issues and
 * every session list it reads is bounded by it: Core's client gateway reads it
 * from `AutomationStudioChannelScope.gatewaySource`, as it reads the host lease
 * (`../project-agents/host-resources/lease-scope.ts`). Work a scope outlives --
 * a promise left running -- keeps the scope.
 */
export class AutomationStudioChannelScope {
  /** What the host hands the client gateway as its `channelScope` source. */
  static readonly gatewaySource: ClientGatewayChannelScopeSource = Object.freeze({
    current: (): string | undefined => scopes.getStore()
  });

  /** The scope the calling async context runs in, or nothing outside any scope (live). */
  static current(): string | undefined {
    return scopes.getStore();
  }

  /** Runs `work` inside `scopeId`; a scope entered inside another replaces it for that work. */
  static run<T>(scopeId: string, work: () => Promise<T>): Promise<T> {
    if (typeof scopeId !== "string" || !scopeId) throw new Error("channel_scope.scope_id_required");
    return scopes.run(scopeId, work);
  }
}
