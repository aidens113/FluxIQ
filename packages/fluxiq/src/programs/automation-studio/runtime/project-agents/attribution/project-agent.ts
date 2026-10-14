import type { ClientGatewayActivityAgent } from "@fluxiq/contracts/client-gateway";
import { runWithAutomationStudioActivityAgent } from "../../activity/index.ts";
import { automationStudioLlmStepLogScope } from "../../llm/step-log/index.ts";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Runs `fn` as the work of one of a project build's agents, so both records of
 * the build say which agent did it: every activity event the work reaches
 * carries `agent` (the chat puts a builder's steps under its subflow), and
 * every step-log folder it writes carries `role` and `briefId` in `meta.json`
 * and in `index.md`.
 *
 * The one place both are set: `llm/` imports nothing from `activity/`, so
 * neither store can set the other. The innermost agent wins in both, and two
 * agents under `Promise.all` each keep their own. `env` is the step log's (its
 * scope is a no-op with the step log off), for tests.
 */
export function withAutomationStudioProjectAgent<T>(agent: ClientGatewayActivityAgent, fn: () => T, env?: Env): T {
  const stepLogAgent = agent.briefId === undefined ? { role: agent.role } : { role: agent.role, briefId: agent.briefId };
  return runWithAutomationStudioActivityAgent(agent, () => automationStudioLlmStepLogScope.agent(stepLogAgent, fn, env));
}
