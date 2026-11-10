import type { FluxNodeCost, FluxNodeRunPathKind, FluxNodeRunResult } from "@fluxiq/contracts/fluxnode";

const RANK: Readonly<Record<FluxNodeRunPathKind, number>> = Object.freeze({ replayed: 0, repaired: 1, explored: 2 });

/** What a pipeline run's mapped calls cost, summed, and the furthest any of them had to go to get its result. */
export class PipelineSpend {
  private cost: FluxNodeCost = { calls: 0, tokens: 0, usd: 0 };
  private furthest: FluxNodeRunPathKind = "replayed";

  add(called: FluxNodeRunResult): void {
    this.cost = { calls: this.cost.calls + called.cost.calls, tokens: this.cost.tokens + called.cost.tokens, usd: this.cost.usd + called.cost.usd };
    if (RANK[called.path] > RANK[this.furthest]) this.furthest = called.path;
  }

  get total(): FluxNodeCost {
    return { ...this.cost };
  }

  /** `replayed` when every call was (and when none was made, since nothing was explored); else the furthest path. */
  get path(): FluxNodeRunPathKind {
    return this.furthest;
  }
}
