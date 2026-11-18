import path from "node:path";
import { createSqliteClientTrustRepository, type ClientTrustRepository } from "fluxiq/platform";
import { browserTrustRepositories } from "./repositories";

/** Called with the primary's resolved FluxIQ root, never a client-selected path. */
export function getBrowserTrustRepository(platformRoot: string): ClientTrustRepository {
  const root = path.resolve(platformRoot);
  let repository = browserTrustRepositories.get(root);
  if (!repository) {
    repository = createSqliteClientTrustRepository({ filePath: path.join(root, "platform", "browser-trust.sqlite") });
    browserTrustRepositories.set(root, repository);
  }
  return repository;
}
