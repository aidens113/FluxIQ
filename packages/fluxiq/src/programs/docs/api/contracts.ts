import type { DocsSnapshot } from "../types";

export const DOCS_ENDPOINTS = {
  snapshot: "snapshot"
} as const;

export type DocsSnapshotResponse = DocsSnapshot;
