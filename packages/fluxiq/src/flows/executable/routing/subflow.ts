import type { ExecutableDefinitionStatus } from "../definition-status.ts";

export type ExecutableSubflowTarget = {
  subflowId: string;
  status: ExecutableDefinitionStatus;
};
