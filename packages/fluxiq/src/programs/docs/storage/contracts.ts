import type { DocumentationPage, DocumentationSource } from "../types";

export type DocsStore = {
  listSources(): Promise<DocumentationSource[]>;
  saveSource(source: DocumentationSource): Promise<DocumentationSource>;
  listPages(sourceId?: string): Promise<DocumentationPage[]>;
  savePage(page: DocumentationPage): Promise<DocumentationPage>;
};
