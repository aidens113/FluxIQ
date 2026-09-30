// Runs an async job for every item, at most `limit` at a time: what a restore
// uses to copy thousands of output files without doing them one by one, and
// without opening thousands of file handles at once.
//
// After the first job that throws, no further job starts; the ones already
// running are awaited, so nothing is still writing when the caller handles
// the failure, and then that first error is thrown.

/**
 * @template T
 * @param {readonly T[]} items
 * @param {number} limit at least 1
 * @param {(item: T, index: number) => Promise<void>} job
 * @returns {Promise<void>}
 */
export async function forEachLimited(items, limit, job) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`forEachLimited: limit must be a positive integer, not ${limit}`);
  let next = 0;
  let failure = null;
  async function worker() {
    while (failure === null && next < items.length) {
      const index = next;
      next += 1;
      try {
        await job(items[index], index);
      } catch (error) {
        failure ??= { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure !== null) throw failure.error;
}
