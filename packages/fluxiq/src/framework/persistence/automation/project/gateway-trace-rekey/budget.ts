// How far one rekey run may go (t745 design note D5): rows per batch and an
// optional limit on the batches of all passes together. Tests set the limit to
// stop a run part way; the next protected open resumes from the rows still in
// an old form. Once the limit is reached `stopped` is set and every later pass
// does nothing.
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 500;

export class GatewayTraceRekeyBudget {
  readonly batchSize: number;
  private readonly maxBatches: number;
  private used = 0;
  private reachedLimit = false;

  constructor(options: { batchSize?: number; maxBatches?: number } = {}) {
    this.batchSize = boundedInteger(options.batchSize ?? DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE, "batchSize");
    this.maxBatches = options.maxBatches === undefined ? Number.POSITIVE_INFINITY : boundedInteger(options.maxBatches, 1, Number.MAX_SAFE_INTEGER, "maxBatches");
  }

  /** Batches run so far, by every pass. */
  get batches(): number {
    return this.used;
  }

  /** Whether the limit stopped the run before it reached the last row. */
  get stopped(): boolean {
    return this.reachedLimit;
  }

  /** Claims one batch; false (and stopped from then on) when the limit is reached. */
  take(): boolean {
    if (this.reachedLimit || this.used >= this.maxBatches) {
      this.reachedLimit = true;
      return false;
    }
    this.used += 1;
    return true;
  }
}

function boundedInteger(value: number, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Gateway trace rekey ${label} must be an integer from ${min} to ${max}.`);
  return value;
}
