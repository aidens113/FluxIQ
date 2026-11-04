import type { SubflowLastingClass } from "../../types.ts";

/** What a person can press after a run. Each is shown only where it makes sense. */
export type RunResultHooks = {
  tryAgain(): void;
  ask(): void;
  /** Allow these classes for this run once, and run again. */
  allow(classes: readonly SubflowLastingClass[]): void;
  /** Go ahead although it will do its acts again, and run again. */
  goAhead(): void;
};
