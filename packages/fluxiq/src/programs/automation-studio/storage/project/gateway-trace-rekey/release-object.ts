// Removes the files of the content objects a rekey batch released (a legacy
// event object, an unsealed artifact object replaced by its sealed copy), after
// the batch has committed (t745 u3b, u5). The batch released each object in its
// own transaction, deleting its row and recording a pending removal only when
// no reference at all named it, so an object another trace or owner still uses
// was never released. Draining removes each pending file and then its row. A
// file that cannot be removed keeps its pending row, so the next content store
// open retries it, and is named in the skips by what it was and the error's
// code, never by its id or path (for an unsealed object, its plain SHA-256).
import type { GatewayTraceRekeyContext, GatewayTraceRekeySkip } from "./context.ts";

/** How many of `released` the drain removed. */
export async function drainReleasedGatewayTraceObjects(context: GatewayTraceRekeyContext, released: readonly string[], what: string, skips: GatewayTraceRekeySkip[]): Promise<number> {
  if (released.length === 0) return 0;
  const drain = await context.content.drainPendingRemovals();
  let removed = 0;
  for (const objectId of released) {
    if (drain.removed.includes(objectId)) removed += 1;
    const failure = drain.failed.find((entry) => entry.objectId === objectId);
    if (failure) skips.push({ kind: "object", where: what, reason: `its file could not be removed (${failure.reason}); the next open retries it` });
  }
  return removed;
}
