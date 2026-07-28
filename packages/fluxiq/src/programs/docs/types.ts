export type DocumentationSource = {
  id: string;
  title: string;
  rootDir: string;
  scope: "framework" | "domain" | "program";
  domainId?: string | null;
};

export type DocumentationPage = {
  id: string;
  sourceId: string;
  title: string;
  path: string;
  routePath?: string;
  updatedAtMs?: number;
};

export type DocumentationPageContent = DocumentationPage & {
  markdown: string;
  html: string;
};

export type DocsSnapshot = {
  sources: DocumentationSource[];
  pages: DocumentationPage[];
  generatedAtMs: number;
  warnings: string[];
};
