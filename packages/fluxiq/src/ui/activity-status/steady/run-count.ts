// One step count for one run (t753). A Flow made of parts runs each part as a
// Flow of its own inside the step that calls it, and each part counts its own
// steps (Core's executor numbers every graph it runs): the status read "Step 2
// of 3", then "Step 1 of 5" for the part's first step, then "Step 3 of 3". The
// count a run first says is its count; a step that says another is one of a
// part's own, and the run is still on the step that called it, so that step's
// number stays up. A new run -- a test starting or ending, a repaired Flow run
// again -- counts afresh. Pure.

/** A step as the status counts it. */
export type RunStep = { readonly index: number; readonly count: number };

/** What the run's count makes of a step row. */
export type CountedStep = {
  /** The step the status shows: the row's own, or the run's step that called the part it belongs to. */
  readonly step: RunStep;
  /** The row is one of a part's own steps, not one of the run's. */
  readonly inner: boolean;
};

export class RunCount {
  private outer: RunStep | null = null;
  private fresh = true;

  /** A new run begins with the next step: it counts afresh. */
  restart(): void {
    this.outer = null;
    this.fresh = true;
  }

  /** Folds one step row in. */
  observe(step: RunStep): CountedStep {
    if (this.fresh || this.outer === null || step.count === this.outer.count) {
      this.fresh = false;
      this.outer = step;
      return { step, inner: false };
    }
    return { step: this.outer, inner: true };
  }
}
