import type { ComputeCommand, ComputeLease, ComputeNode } from "../types";

export type ComputeControlStore = {
  listNodes(): Promise<ComputeNode[]>;
  saveNode(node: ComputeNode): Promise<ComputeNode>;
  listCommands(computeId?: string): Promise<ComputeCommand[]>;
  saveCommand(command: ComputeCommand): Promise<ComputeCommand>;
  listLeases(computeId?: string): Promise<ComputeLease[]>;
  saveLease(lease: ComputeLease): Promise<ComputeLease>;
};
