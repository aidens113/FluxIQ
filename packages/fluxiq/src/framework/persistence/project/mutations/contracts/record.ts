import type { AutomationStudioMutationRecordStatus } from "./record-status.ts";

export type AutomationStudioMutationRecord = {
  mutationId: string;
  operationKind: string;
  ownerKind: string;
  ownerId: string;
  requestDigest: string;
  status: AutomationStudioMutationRecordStatus;
  responseJson: string | null;
  errorJson: string | null;
  firstChangeSequence: number | null;
  lastChangeSequence: number | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  expiresAt: number | null;
};
