import type { AutomationStudioLlmStepLogPhase } from "./phase.ts";
import type { AutomationStudioLlmStepLogPart } from "./part.ts";
import type { AutomationStudioLlmStepLogPass } from "./pass.ts";
import type { AutomationStudioLlmStepLogAgent } from "./agent.ts";
import type { AutomationStudioLlmStepLogContext } from "./context.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { automationStudioLlmStepLogDirectory } from "../directory.ts";

type Env = Readonly<Record<string, string | undefined>>;

const storage = new AsyncLocalStorage<AutomationStudioLlmStepLogContext>();

/** The current context with `patch`'s defined fields laid over it. */
function merged(patch: AutomationStudioLlmStepLogContext): AutomationStudioLlmStepLogContext {
  const next: AutomationStudioLlmStepLogContext = { ...storage.getStore() };
  if (patch.round !== undefined) next.round = patch.round;
  if (patch.phase !== undefined) next.phase = patch.phase;
  if (patch.part !== undefined) next.part = patch.part;
  return next;
}

/**
 * The build's part, round and phase, carried to the provider adapters and the
 * tool wrapper without threading them through every call between.
 *
 * Core's provider call knows its task but not which build or round it serves:
 * rounds and phases live in `flow-bootstrap/unfinished-build/phases.ts`, which
 * sets a scope around each round and each test; the build's caller sets the
 * part around the whole build with `within`. Both merge into the scope already
 * current. The test's walker sets `pass` around each call of a repeat's pass,
 * so the tool step writes which pass and row it was. A project build sets the
 * agent around each agent's work with `agent`, so every step says which agent
 * and brief made it. With the step log off, each just calls `fn`.
 */
export const automationStudioLlmStepLogScope = {
  /** `fn` under this round and phase, keeping the current part. */
  run<T>(context: { round: number; phase: AutomationStudioLlmStepLogPhase }, fn: () => T, env: Env = process.env): T {
    if (!automationStudioLlmStepLogDirectory(env)) return fn();
    return storage.run(merged({ round: context.round, phase: context.phase }), fn);
  },
  /** `fn` under the current scope with `patch` (a part, a phase) laid over it. */
  within<T>(patch: { part?: AutomationStudioLlmStepLogPart; phase?: AutomationStudioLlmStepLogPhase }, fn: () => T, env: Env = process.env): T {
    if (!automationStudioLlmStepLogDirectory(env)) return fn();
    return storage.run(merged({ ...(patch.part !== undefined ? { part: patch.part } : {}), ...(patch.phase !== undefined ? { phase: patch.phase } : {}) }), fn);
  },
  /** `fn` as one pass of a repeat (`../node-tools/replay-span.ts`): only the calls made inside it carry the pass. */
  pass<T>(pass: AutomationStudioLlmStepLogPass, fn: () => T, env: Env = process.env): T {
    if (!automationStudioLlmStepLogDirectory(env)) return fn();
    return storage.run({ ...merged({}), pass: { ...pass } }, fn);
  },
  /**
   * `fn` as the work of one agent, keeping the current part, round and phase.
   * The innermost agent wins whole: a supervisor inside a builder's scope
   * carries no brief id of the builder's.
   */
  agent<T>(agent: AutomationStudioLlmStepLogAgent, fn: () => T, env: Env = process.env): T {
    if (!automationStudioLlmStepLogDirectory(env)) return fn();
    const next: AutomationStudioLlmStepLogContext = { ...merged({}), role: agent.role };
    if (agent.briefId === undefined) delete next.briefId;
    else next.briefId = agent.briefId;
    return storage.run(next, fn);
  },
  current():AutomationStudioLlmStepLogContext | undefined {
    return storage.getStore();
  }
};
