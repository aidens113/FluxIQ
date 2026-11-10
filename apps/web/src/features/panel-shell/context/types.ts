// What the person has open on the panel: the page, and what they picked on it.
// Pages publish it; the assistant dock sends it with every message so
// "rename this" means the Flow on screen.

export const PANEL_PAGES = ["home", "flows", "runs", "data", "security", "settings"] as const;

export type PanelPage = (typeof PANEL_PAGES)[number];

export type PanelContext = {
  page: PanelPage;
  projectId?: string;
  flowId?: string;
  stepNumbers?: readonly number[];
  nodeIds?: readonly string[];
  runId?: string;
  datasetId?: string;
  keyId?: string;
  folder?: string;
};

/** What a page picked, besides the page and the project the person chose in the top bar. */
export type PanelSelection = Omit<PanelContext, "page" | "projectId">;
