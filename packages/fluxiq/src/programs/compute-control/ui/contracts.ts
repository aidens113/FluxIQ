export type ComputeControlPanel = "nodes" | "commands" | "leases" | "capacity";

export type ComputeControlViewState = {
  activePanel: ComputeControlPanel;
  selectedComputeId?: string;
};
