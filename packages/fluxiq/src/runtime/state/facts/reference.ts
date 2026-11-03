import type { EvidenceReference } from "@fluxiq/contracts/recording";

export type StateFactReference = {
  snapshotId?: string;
  namespace: string;
  path: string;
  observedAt?: number;
  evidence?: EvidenceReference;
};
