import path from "node:path";
import { keySessionCompositions } from "./compositions";

/** Closes existing SDK stores for a drained root without opening a new composition. */
export async function closeKeySessionServices(fluxiqRoot: string): Promise<void> {
  const root = path.resolve(fluxiqRoot);
  const closing: Promise<void>[] = [];
  for (const [key, pending] of keySessionCompositions) {
    const [entryRoot] = JSON.parse(key) as string[];
    if (entryRoot !== root) continue;
    closing.push((async () => {
      try {
        const composition = await pending;
        await composition.store.close();
      } finally {
        keySessionCompositions.delete(key);
      }
    })());
  }
  const outcomes = await Promise.allSettled(closing);
  const failures = outcomes.filter((outcome) => outcome.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), "Key authorities could not all close cleanly.");
}
