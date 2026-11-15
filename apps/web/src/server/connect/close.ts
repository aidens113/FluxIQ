import path from "node:path";
import { connectCompositions } from "./compositions";

/** Called after request drain; opens no repository during shutdown. */
export async function closeConnectServices(platformRoot: string): Promise<void> {
  const root = path.resolve(platformRoot);
  const closed = await Promise.allSettled([...connectCompositions].filter(([, composition]) => composition.root === root).map(async ([key, composition]) => {
    try {
      await composition.repository.close();
    } finally {
      connectCompositions.delete(key);
    }
  }));
  const failures = closed.filter((result) => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Connect authorities could not all close cleanly.");
}
