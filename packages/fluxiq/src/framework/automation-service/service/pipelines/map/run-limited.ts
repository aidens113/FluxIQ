/**
 * Runs `work` for each index below `count`, at most `limit` at once, and returns the
 * results by index. The first failure stops new work from starting; the work already
 * running finishes, and then that failure is thrown.
 */
export async function runLimited<T>(count: number, limit: number, work: (index: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < count) {
      const index = next;
      next += 1;
      try {
        results[index] = await work(index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), count) }, worker));
  if (failure !== undefined) throw failure.error;
  return results;
}
