import type { OutlineStep } from "../types/index.ts";

/** Every step of the outline, each before the steps inside it: its own block, then each arm's. */
export function outlineFlatSteps(steps: readonly OutlineStep[]): OutlineStep[] {
  return steps.flatMap((step) => [step, ...outlineFlatSteps(step.children ?? []), ...outlineFlatSteps((step.arms ?? []).flatMap((arm) => arm.steps))]);
}
