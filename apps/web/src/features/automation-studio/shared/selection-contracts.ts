import type { NodeStatePhase } from "fluxiq/automation-studio";
import type { AutomationNodeParameter, AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";

export type AutomationSelection =
  | { kind: "workspace"; id: "clients" | "runs" }
  | { kind: "flow"; id: string }
  | { kind: "policy"; id: string }
  | { kind: "node"; id: string }
  | { kind: "editor-node"; id: string; flowId?: string; node: { label: string; nodeType: string; family: string; description: string; customDescription?: string; nodeDefinitionId?: string; icon?: string; inputs: AutomationNodePort[]; outputs: AutomationNodePort[]; parameters: AutomationNodeParameter[]; parameterValues: JsonObject; metadata?: JsonObject; privileged?: boolean; actionTypes?: string[] } }
  | { kind: "editor-mode"; id: string; flowId?: string; editor: "flow" | "routine"; label: string; description: string; sections: Array<{ title: string; rows: Array<[string, string]> }> }
  | { kind: "recording"; id: string }
  | { kind: "timeline"; id: string }
  | { kind: "signal"; id: string }
  | { kind: "state"; id: string; nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; recordingId?: string; proposalId?: string; timelineEntryId?: string; stateSnapshotId?: string; stateRef?: string };
