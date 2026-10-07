import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";

/** Nominal scope only; the issuing controller's private registration grants authority. */
export class AutomationStudioCommandRunScope {
  private constructor() { Object.freeze(this); }
  static create(): AutomationStudioCommandRunScope { return new AutomationStudioCommandRunScope(); }
}
export type AutomationStudioCommandRunOwner = { projectId: string; runId: string; rootFlowId: string };
export type AutomationStudioCommandEffectProvenance = {
  scope: AutomationStudioCommandRunScope; consumer: object; invocationId: string; attemptId: string;
  nodeId: string; executingFlowId: string; executingFlowDigest: string; effectOrdinal: number;
};
/** Actual executor owns private capability/handled-witness registries; production issuer is not installed here. */
export type AutomationStudioCommandExecutorOwner = {
  inspectEffect(capability: object): AutomationStudioCommandEffectProvenance | null;
  authorizeHandling(consumer: object, capability: object, context: import("../../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandContext): object | null;
};
export type AutomationStudioCommandRunPorts = { pool?: AutomationStudioProjectDatabasePool; executorOwner?: AutomationStudioCommandExecutorOwner; getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> };
