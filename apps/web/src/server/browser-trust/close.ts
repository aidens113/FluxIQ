import path from "node:path";
import { browserTrustRepositories } from "./repositories";

/** Called only after workspace gateways have drained; opens nothing. */
export async function closeBrowserTrustRepository(platformRoot: string): Promise<void> {
  const root = path.resolve(platformRoot);
  const repository = browserTrustRepositories.get(root);
  if (!repository) return;
  try {
    await repository.close();
  } finally {
    browserTrustRepositories.delete(root);
  }
}
