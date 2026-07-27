export type DocsPanel = "sources" | "pages" | "generated";

export type DocsViewState = {
  activePanel: DocsPanel;
  selectedSourceId?: string;
  selectedPageId?: string;
};
