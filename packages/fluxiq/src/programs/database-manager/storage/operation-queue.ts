const databaseOperationLocks = new Map<string, Promise<void>>();

/**
 * Runs `operation` once every operation queued before it on the same database
 * file has settled, so one process never has two operations on a file at once.
 * The queue is per file path and lives for the process.
 */
export async function enqueueDatabaseOperation<TResult>(filePath: string, operation: () => Promise<TResult>): Promise<TResult> {
  // The operation before this one only has to have settled; its failure is its own caller's.
  const previous = (databaseOperationLocks.get(filePath) ?? Promise.resolve()).then(() => undefined, () => undefined);
  let release: () => void = () => undefined;
  const current = previous.then(() => new Promise<void>((resolve) => {
    release = resolve;
  }));
  databaseOperationLocks.set(filePath, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (databaseOperationLocks.get(filePath) === current) {
      databaseOperationLocks.delete(filePath);
    }
  }
}
