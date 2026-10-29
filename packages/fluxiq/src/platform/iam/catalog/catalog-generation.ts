import type { IamActionCatalog } from "@fluxiq/contracts/iam";

/** What the generator returns: the catalog plus the two lists its callers report on. */
export type IamCatalogGeneration = {
  catalog: IamActionCatalog;
  /** Actions several endpoints (in different programs) share, with every program id. */
  sharedActions: Array<{ action: string; sources: string[] }>;
  /** Actions whose `resourceTypes` is a placeholder until the registration declares a resource. */
  undeclaredResources: string[];
};
