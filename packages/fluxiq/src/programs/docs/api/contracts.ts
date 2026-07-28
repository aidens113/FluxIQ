import type { DocumentationPageContent, DocumentationSource, DocsSnapshot } from "../types";

export const DOCS_ENDPOINTS = {
  snapshot: "snapshot",
  rebuild: "rebuild",
  getPage: "get-page",
  registerSource: "register-source"
} as const;

export type DocsSnapshotResponse = DocsSnapshot;

export type DocsPageRequest = {
  pageId: string;
};

export type DocsPageResponse = DocumentationPageContent | null;

export type RegisterDocsSourceRequest = DocumentationSource;
