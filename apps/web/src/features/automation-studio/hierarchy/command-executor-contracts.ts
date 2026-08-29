import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationStudioFlowEntry } from "../model/local-mutations";
import type { AutomationHierarchyNode } from "./contracts";
import type { AutomationHierarchyDialogTransaction } from "./dialog-transaction";

export type CommandResult<T = unknown> = { ok: boolean; error?: string; payload?: T };
export type FlowDocument = Record<string, any> & { flowId: string; metadata?: Record<string, any> };
export type SubflowSummary = Record<string, any> & { subflowId: string; graphFlowId?: string };
export type ProjectArtifact = { taskId?: string } & Record<string, unknown>;
export type AutomationHierarchyInvalidationScope = "flow" | "subflow" | "summary";

export type AutomationHierarchyCommandPort = {
  createFlow(input: { projectId: string; authorizationPin: string; name: string; description: string }): Promise<CommandResult<{ flow?: FlowDocument }>>;
  saveFlow(input: { projectId: string; authorizationPin: string; flow: FlowDocument }): Promise<CommandResult<{ flow?: FlowDocument }>>;
  loadFlow(flowId: string): Promise<CommandResult<{ flow?: FlowDocument }>>;
  deleteFlow(flowId: string, authorizationPin: string): Promise<CommandResult>;
  createSubflow(input: { projectId: string; flowId: string; authorizationPin: string; name: string; role: string; parentCategoryId: string | null }): Promise<CommandResult<{ subflow?: SubflowSummary }>>;
  deleteSubflow(input: { projectId: string; flowId: string; subflowId: string; authorizationPin: string }): Promise<CommandResult>;
  deleteArtifact(input: { projectId: string; kind: "task" | "routine" | "config"; artifactId: string; deleteOwnedArtifacts: true; authorizationPin: string }): Promise<CommandResult>;
};

export type AutomationHierarchyCommandDependencies = {
  projectId: string | null;
  nodes: readonly AutomationHierarchyNode[];
  nodeById: ReadonlyMap<string, AutomationHierarchyNode>;
  canonicalFlowIds: ReadonlySet<string>;
  selection: AutomationSelection | null;
  projectTasks: readonly ProjectArtifact[];
  commands: AutomationHierarchyCommandPort;
  deleteRecordings(recordingIds: string[], authorizationPin: string): Promise<boolean>;
  findLocalFlow(flowId: string): FlowDocument | null;
  rememberFlow(flowId: string, flow: FlowDocument): void;
  commitSubflowChanged(flowId: string, subflowId: string | undefined): void;
  notifyChanged(scopes: AutomationHierarchyInvalidationScope[], resourceIds: string[]): void;
  openCreatedFlow(flowId: string): void;
  openCreatedSubflow(graphFlowId: string): void;
  closeDeletedViews(nodes: AutomationHierarchyNode[]): void;
  clearFlowDrafts(flowId: string): void;
  setSelection(selection: AutomationSelection | null): void;
  updateProjectFlows(update: (current: AutomationStudioFlowEntry[]) => AutomationStudioFlowEntry[]): void;
  updateCustomNodes(update: (current: AutomationHierarchyNode[]) => AutomationHierarchyNode[]): void;
  updateDeletedIds(update: (current: string[]) => string[]): void;
  now?(): number;
  createId?(): string;
};

export type AutomationHierarchyExecutionResult = { ok: true } | { ok: false; error: string };
export type AutomationHierarchyCommandExecutor = {
  execute(transaction: AutomationHierarchyDialogTransaction, dependencies: AutomationHierarchyCommandDependencies): Promise<AutomationHierarchyExecutionResult>;
};