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
  updatedAtMs?: number;
};
