import type { ProductionRun } from "../types";

export type ProductionRunnerStore = {
  listRuns(domainId?: string | null): Promise<ProductionRun[]>;
  saveRun(run: ProductionRun): Promise<ProductionRun>;
  loadRun(id: string): Promise<ProductionRun | null>;
};
