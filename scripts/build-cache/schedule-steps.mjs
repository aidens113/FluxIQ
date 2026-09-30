// Runs several registered steps through `runStep`, the way the root `build`
// and `check` scripts used to run them through pnpm.
//
// In order (the default), one after another with the caller's output: what
// `pnpm --filter a build && pnpm --filter b build` did. The first failure
// stops the list.
//
// In parallel, as `pnpm -r check` did: a step starts once every listed step of
// a workspace package it depends on has finished, at most `concurrency` at a
// time, so the peak load is what pnpm's topological run put on the machine.
// Each step's output is kept and handed to `onOutcome` whole when it finishes,
// so two compilers' diagnostics never interleave. After a failure no further
// step starts; the ones already running finish.

import { runStep } from "./run-step.mjs";
import { resolveStep } from "./workspace/index.mjs";

const CONCURRENCY = 4;

/**
 * @param {string[]} names registered step names
 * @param {{ parallel?: boolean, concurrency?: number, onOutcome?: (outcome: import("./run-step.mjs").StepOutcome) => void, repoRoot?: string, env?: NodeJS.ProcessEnv, steps?: object, stdio?: import("node:child_process").StdioOptions }} [options]
 * @returns {Promise<{ exitCode: number, outcomes: import("./run-step.mjs").StepOutcome[] }>} the first failing step's exit code, or 0
 */
export async function scheduleSteps(names, options = {}) {
  const onOutcome = options.onOutcome ?? (() => {});
  const resolved = names.map((name) => resolveStep(name, options));
  const outcomes = [];
  if (options.parallel !== true) {
    for (const step of resolved) {
      const outcome = await runStep(step, options);
      outcomes.push(outcome);
      onOutcome(outcome);
      if (outcome.exitCode !== 0) return { exitCode: outcome.exitCode, outcomes };
    }
    return { exitCode: 0, outcomes };
  }

  const waitsFor = new Map(
    resolved.map((step) => [step.name, resolved.filter((other) => other !== step && other.packageName !== null && step.dependencies.includes(other.packageName)).map((other) => other.name)])
  );
  const limit = options.concurrency ?? CONCURRENCY;
  const done = new Set();
  const running = new Map();
  let exitCode = 0;
  const pending = [...resolved];
  while (pending.length > 0 || running.size > 0) {
    while (exitCode === 0 && running.size < limit) {
      const index = pending.findIndex((step) => waitsFor.get(step.name).every((name) => done.has(name)));
      if (index === -1) break;
      const [step] = pending.splice(index, 1);
      running.set(
        step.name,
        runStep(step, { ...options, capture: "buffer" }).then((outcome) => ({ step, outcome }))
      );
    }
    if (running.size === 0) break;
    const { step, outcome } = await Promise.race(running.values());
    running.delete(step.name);
    done.add(step.name);
    outcomes.push(outcome);
    onOutcome(outcome);
    if (outcome.exitCode !== 0 && exitCode === 0) exitCode = outcome.exitCode;
  }
  return { exitCode, outcomes };
}

