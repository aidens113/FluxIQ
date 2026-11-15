const state = globalThis as typeof globalThis & { __fluxiqConnectAccountQueues?: Map<string, Promise<void>> };
const queues = state.__fluxiqConnectAccountQueues ??= new Map<string, Promise<void>>();

/** One process owns the hosted gateway. Serialize consent across that account's tenant gateways. */
export async function serializeConnectAccount<T>(root: string, userId: string, operation: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([root, userId]);
  const previous = queues.get(key) ?? Promise.resolve();
  const result = previous.then(operation);
  // Caller observes rejection; the queue tail must permit a later fresh consent attempt.
  const tail = result.then(() => undefined, () => undefined);
  queues.set(key, tail);
  try {
    return await result;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
}
