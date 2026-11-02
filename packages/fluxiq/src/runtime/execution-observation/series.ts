import type { ExecutionScope } from "../execution-admission/index.ts";
import type { ExecutionRetrySeries } from "./contracts/index.ts";

type Series = { readonly owner: ExecutionRetrySeriesOwner; readonly scope: ExecutionScope; readonly branches: Map<number, ExecutionRetrySeries> };

/** Original engine arrival identities stay private and survive only their own retries. */
export class ExecutionRetrySeriesOwner {
  private static readonly issued = new WeakMap<object, Series>();
  private readonly originals = new WeakMap<object, ExecutionRetrySeries>();

  constructor(private readonly scope: ExecutionScope) {}

  forInvocation(original: object): ExecutionRetrySeries {
    let series = this.originals.get(original);
    if (!series) {
      series = Object.freeze({}) as ExecutionRetrySeries;
      ExecutionRetrySeriesOwner.issued.set(series, { owner: this, scope: this.scope, branches: new Map() });
      this.originals.set(original, series);
    }
    return series;
  }

  forEffect(series: ExecutionRetrySeries, ordinal: number): ExecutionRetrySeries {
    const actual = ExecutionRetrySeriesOwner.issued.get(series);
    if (actual?.owner !== this || !Number.isSafeInteger(ordinal) || ordinal < 0) throw new Error("execution_observation.foreign_retry_series");
    let branch = actual.branches.get(ordinal);
    if (!branch) {
      branch = this.forInvocation(Object.freeze({}));
      actual.branches.set(ordinal, branch);
    }
    return branch;
  }

  static require(series: ExecutionRetrySeries, scope: ExecutionScope): void {
    if (this.issued.get(series)?.scope !== scope) throw new Error("execution_observation.foreign_retry_series");
  }
}
