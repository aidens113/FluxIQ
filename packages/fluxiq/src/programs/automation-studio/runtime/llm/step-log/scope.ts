import { AsyncLocalStorage } from "node:async_hooks";
import { automationStudioLlmStepLogDirectory } from "./directory.ts";

/**
 * Which part of a build a step belongs to, as the build's phases set it.
 * `read` is the build's reading of its instructions, made outside any round.
 */
export type AutomationStudioLlmStepLogPhase = "explore" | "repair" | "test" | "read";

/**
 * Which build a step serves: the Flow's creation, or a re-author after a
 * playback run refuted its result. Each has its own cost ceiling. No part means
 * neither: a playback run, its result check and recovery, or the chat.
 */
export type AutomationStudioLlmStepLogPart = "creation" | "reauthor";

/**
 * Which pass of a repeat a test's call is (t195 w43): its number, the pass
 * count where the walker knows it before the pass (a list's rows; a repeat
 * while a check holds does not), and the label of the pass's row where the
 * list read named its rows, already screened as the judge's are. Never a row's
 * values. Live run `run-musp474o-e0ed7432` ran a repeated Confirm once per row
 * and no pass folder said which row it was on.
 */
export type AutomationStudioLlmStepLogPass = { pass: number; of?: number; row?: string };

/** The part, round and phase every step made inside a scope is written with, and the pass a test's call is on. */
export type AutomationStudioLlmStepLogContext = { round?: number; phase?: AutomationStudioLlmStepLogPhase; part?: AutomationStudioLlmStepLogPart; pass?: AutomationStudioLlmStepLogPass };

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
 * so the tool step writes which pass and row it was. With the step log off,
 * each just calls `fn`.
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
  current(): AutomationStudioLlmStepLogContext | undefined {
    return storage.getStore();
  }
};
