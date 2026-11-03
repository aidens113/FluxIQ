import type { FlowIdProjectRequest } from "./flow.ts";

export type FlowSubflowRequest = FlowIdProjectRequest & {
  subflowId: string;
};

export type MigrateLegacyFlowRepresentationRequest = FlowSubflowRequest & {
  authorizationPin: string;
  authSessionId?: string;
};

export type CreateFlowSubflowRequest = FlowIdProjectRequest & {
  name: string;
  description?: string;
  role?: string;
  parentCategoryId?: string | null;
  routeTags?: string[];
};

export type UpdateFlowSubflowRequest = FlowSubflowRequest & {
  expectedUpdatedAt?: number;
  name?: string;
  description?: string;
  role?: string;
  parentCategoryId?: string | null;
  routeTags?: string[];
  inputMapping?: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping?: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
  localInstructionIds?: string[];
  proposalModeOverride?: string | null;
  interventionModeOverride?: "fully_adaptive" | "manual_approval" | "no_llm_intervention" | null;
  graphFlowId?: string;
};

export type RenameFlowSubflowRequest = FlowSubflowRequest & {
  name: string;
};

export type DuplicateFlowSubflowRequest = FlowSubflowRequest & {
  name?: string;
};
