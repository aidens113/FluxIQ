import type { IdentityAccessSnapshot } from "../types";

export const IDENTITY_ACCESS_ENDPOINTS = {
  snapshot: "snapshot"
} as const;

export type IdentityAccessSnapshotResponse = IdentityAccessSnapshot;
