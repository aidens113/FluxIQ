// A FluxNode's options (plan, N4-N7), every one optional. A run request may override
// them; `resolveFluxNodeOptions` fills what neither says with Core's defaults.

import { z } from "zod";
import { humannessSchema } from "../../humanness/index.ts";

/** The standing floor of retries per step: the first attempt plus 3. A caller may raise it, never lower it. */
export const FLUXNODE_MIN_RETRIES = 3;

/** The budget a run gets when nothing says otherwise, in dollars. A caller may set more. */
export const FLUXNODE_DEFAULT_BUDGET_USD = 5;

/**
 * When the judge runs, after the type and the developer's check: `auto` only when
 * there is no check, `always`, or `off`.
 */
export const FLUXNODE_JUDGE_MODES = Object.freeze(["auto", "always", "off"] as const);

export type FluxNodeJudgeMode = (typeof FLUXNODE_JUDGE_MODES)[number];

/**
 * How a run starts: `auto` replays the learned Flow, repairs it, and explores on when
 * repair cannot fix it; `explore` starts fresh while keeping the old Flow. Replay
 * only is a budget of 0, not a mode.
 */
export const FLUXNODE_RUN_MODES = Object.freeze(["auto", "explore"] as const);

export type FluxNodeRunMode = (typeof FLUXNODE_RUN_MODES)[number];

/**
 * - `retries`: retries per step, at least 3, at most 100;
 * - `judge`: see `FLUXNODE_JUDGE_MODES`;
 * - `budgetUsd`: the run's whole allowance in dollars, at least 0; 0 means replay
 *   only, ending at budget out with the best partial result and a resume handle;
 * - `model`: the model id to use, such as "claude-haiku-5-5";
 * - `mode`: see `FLUXNODE_RUN_MODES`;
 * - `timeoutMs`: the longest the run may take, at most 7 days;
 * - `humanness`: an integer 0 to 100, how human the run's input looks; 0 (the default) is today's path.
 */
export const fluxNodeOptionsSchema = z
  .object({
    retries: z.number().int().min(FLUXNODE_MIN_RETRIES, `retries is at least ${FLUXNODE_MIN_RETRIES}: the first attempt plus 3 is the floor on every step.`).max(100),
    judge: z.enum(FLUXNODE_JUDGE_MODES),
    budgetUsd: z.number().finite().nonnegative().max(100_000),
    model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u, "A model id is 1 to 128 of letters, digits, \".\", \"_\", \":\", \"/\" and \"-\"."),
    mode: z.enum(FLUXNODE_RUN_MODES),
    timeoutMs: z.number().int().positive().max(7 * 24 * 60 * 60 * 1000),
    humanness: humannessSchema
  })
  .partial()
  .strict();

export type FluxNodeOptions = z.infer<typeof fluxNodeOptionsSchema>;

/** Every option settled: `model` and `timeoutMs` stay absent when nothing set them. */
export type FluxNodeResolvedOptions = {
  retries: number;
  judge: FluxNodeJudgeMode;
  budgetUsd: number;
  mode: FluxNodeRunMode;
  model?: string;
  timeoutMs?: number;
  humanness?: number;
};

/** The run's options: each override wins over the declaration, and Core's defaults fill the rest. */
export function resolveFluxNodeOptions(declared: FluxNodeOptions | undefined, overrides: FluxNodeOptions | undefined): FluxNodeResolvedOptions {
  const resolved: FluxNodeResolvedOptions = {
    retries: Math.max(FLUXNODE_MIN_RETRIES, overrides?.retries ?? declared?.retries ?? FLUXNODE_MIN_RETRIES),
    judge: overrides?.judge ?? declared?.judge ?? "auto",
    budgetUsd: overrides?.budgetUsd ?? declared?.budgetUsd ?? FLUXNODE_DEFAULT_BUDGET_USD,
    mode: overrides?.mode ?? declared?.mode ?? "auto"
  };
  const model = overrides?.model ?? declared?.model;
  if (model !== undefined) resolved.model = model;
  const timeoutMs = overrides?.timeoutMs ?? declared?.timeoutMs;
  if (timeoutMs !== undefined) resolved.timeoutMs = timeoutMs;
  const humanness = overrides?.humanness ?? declared?.humanness;
  if (humanness !== undefined) resolved.humanness = humanness;
  return resolved;
}
