// Step numbers: 1, 2, 3 at the top; 5.1, 5.2 inside step 5, its own block
// first and then each arm's steps, so every step has a number of its own. A
// heading that is not a step (the handler section, a part the start does not
// reach) has none, and its steps carry on the top-level count.
import type { OutlineStep } from "../types/index.ts";

/** Numbers every step in place. */
export function outlineNumber(steps: readonly OutlineStep[]): void {
  let top = 0;
  for (const step of steps) {
    if (step.kind !== "handlers" && step.kind !== "section") {
      top += 1;
      numberStep(step, String(top));
      continue;
    }
    step.number = "";
    for (const child of step.children ?? []) {
      top += 1;
      numberStep(child, String(top));
    }
  }
}

function numberStep(step: OutlineStep, number: string): void {
  step.number = number;
  const inside = [...(step.children ?? []), ...(step.arms ?? []).flatMap((arm) => arm.steps)];
  for (const [index, child] of inside.entries()) numberStep(child, `${number}.${index + 1}`);
}
