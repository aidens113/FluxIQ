import type { ClientGatewayTimerSource } from "../types.ts";

/**
 * Where the gateway reads the channel scope a command is dispatched in, the
 * way it reads the host lease (`../host-lease/source.ts`): from the async
 * context of the caller. A scope is a sealed channel to the sessions attached
 * under its id (an offline trial's recorded client, a unit test's scripted
 * one); outside any scope the caller is live. The host wires its scope here;
 * the gateway never imports it.
 */
export type ClientGatewayChannelScopeSource = {
  /** The scope the dispatching async context runs in, or `undefined` outside any scope (live). */
  current(): string | undefined;
  /**
   * The timer source of the dispatching scope (traces and offline trials, P4,
   * "Virtual clock"): a command dispatched inside a scope that has one waits
   * for its answer, its durable answer and its reconcile answer on it, read
   * once as the command is dispatched, so an offline run's deadlines run out
   * in that scope's own time. `undefined`, or no `timers` at all: the
   * gateway's own waits, as for every live command.
   */
  timers?(): ClientGatewayTimerSource | undefined;
};
