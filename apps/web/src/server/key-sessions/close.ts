import path from "node:path";
import { keySessionCompositions } from "./compositions";

/** Closes existing SDK stores for a drained root without opening a new composition. */
export async function closeKeySessionServices(fluxiqRoot: string): Promise<void> {
  const root = path.resolve(fluxiqRoot);
  for (const [key, pending] of keySessionCompositions) {
    const [entryRoot] = JSON.parse(key) as string[];
    if (entryRoot !== root) continue;
    const composition = await pending;
    await composition.store.close();
    keySessionCompositions.delete(key);
  }
}
