import { randomUUID } from "node:crypto";
import { AutomationStudioChannelScope } from "./channel-scope.ts";
import type { AutomationStudioRunEnvironment } from "./environment.ts";
import type { AutomationStudioVirtualClock } from "./virtual-clock.ts";

/** An offline environment: the channel scope its client sessions are attached under, beside the port itself. */
export type AutomationStudioScopedRunEnvironment = AutomationStudioRunEnvironment & {
  readonly kind: "trace" | "fixture";
  /** The scope `within` enters; attach this environment's client with `ClientGatewayService.attachScopedSession` under it. */
  readonly scopeId: string;
};

/**
 * An environment sealed to its own channel scope: time from a virtual clock,
 * and `within` running work inside `scopeId`, so the work sees and reaches only
 * the gateway sessions attached under that scope (a trace matcher in P4, a
 * scripted client in unit tests) and can never reach a live one. `random` and
 * `newRunId` default to the live ones; a caller that needs them reproducible
 * passes its own.
 */
export function createAutomationStudioScopedRunEnvironment(input: {
  kind: "trace" | "fixture";
  clock: AutomationStudioVirtualClock;
  scopeId?: string | undefined;
  random?: (() => number) | undefined;
  newRunId?: ((prefix: string) => string) | undefined;
}): AutomationStudioScopedRunEnvironment {
  const scopeId = input.scopeId ?? `channel.${input.kind}.${randomUUID()}`;
  if (!scopeId) throw new Error("channel_scope.scope_id_required");
  const clock = input.clock;
  const random = input.random ?? (() => Math.random());
  const newRunId = input.newRunId ?? ((prefix: string) => `${prefix}.${randomUUID()}`);
  return Object.freeze({
    kind: input.kind,
    scopeId,
    now: () => clock.now(),
    delay: (ms: number, signal?: AbortSignal) => clock.delay(ms, signal),
    random,
    newRunId,
    within: <T>(work: () => Promise<T>): Promise<T> => AutomationStudioChannelScope.run(scopeId, work)
  });
}
