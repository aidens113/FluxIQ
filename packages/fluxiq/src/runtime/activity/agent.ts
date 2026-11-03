import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientGatewayActivityAgent } from "@fluxiq/contracts/client-gateway";

// Which of a build's agents the current async context works for (the project
// supervisor, a subflow builder, a repair agent, the validator), so every
// activity event it reaches says so without a parameter threaded to it.
//
// A store of its own rather than a field on the unit-of-work frame: a run's
// frame is mutated in place when the run is bound (`./bind.ts`), and an agent
// frame must stay exactly what its caller set, however many runs and builds
// start inside it. Two agents working at once under `Promise.all` each see
// their own frame; the innermost frame wins.

const storage = new AsyncLocalStorage<Readonly<ClientGatewayActivityAgent>>();

/** Runs `fn` as the work of `agent`: every activity event it publishes, however deep, carries it. */
export function runWithAutomationStudioActivityAgent<T>(agent: ClientGatewayActivityAgent, fn: () => T): T {
  const frame: ClientGatewayActivityAgent = { role: agent.role };
  if (agent.briefId !== undefined) frame.briefId = agent.briefId;
  if (agent.subflowName !== undefined) frame.subflowName = agent.subflowName;
  return storage.run(Object.freeze(frame), fn);
}

/** The agent the current async context works for, or nothing outside every agent frame. */
export function currentAutomationStudioActivityAgent(): Readonly<ClientGatewayActivityAgent> | undefined {
  return storage.getStore();
}
