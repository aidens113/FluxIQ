export type ProductionRunnerPanel = "runs" | "targets" | "history";

export type ProductionRunnerViewState = {
  activePanel: ProductionRunnerPanel;
  selectedRunId?: string;
};
