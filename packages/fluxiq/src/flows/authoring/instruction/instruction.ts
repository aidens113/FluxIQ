import type { JsonObject } from "../../../core/index.ts";
import type { ExecutableDefinitionStatus } from "../../executable/index.ts";
import type { InstructionScope } from "./scope.ts";
import type { InstructionTag } from "./tag.ts";
import type { InstructionRequirement } from "./requirement.ts";

export type FlowInstruction = {
  schemaVersion: "0.1";
  instructionId: string;
  title: string;
  body: string;
  scope: InstructionScope;
  priority: number;
  status: ExecutableDefinitionStatus;
  requirement: InstructionRequirement;
  tags?: InstructionTag[];
  sourceActorId?: string;
  linkedRunIds?: string[];
  linkedAdaptationIds?: string[];
  linkedRecordingIds?: string[];
  linkedSubflowIds?: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};
