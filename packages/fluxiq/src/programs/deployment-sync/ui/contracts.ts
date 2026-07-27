export type DeploymentSyncPanel = "targets" | "artifacts" | "runs";

export type DeploymentSyncViewState = {
  activePanel: DeploymentSyncPanel;
  selectedTargetId?: string;
};
