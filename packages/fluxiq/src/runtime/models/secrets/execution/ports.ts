import type { ExecutionCallbackObservation } from "../../../execution-observation/index.ts";
import type { AutomationStudioSessionKeyPorts } from "../session-key.ts";

/** Internal native operations retain their actual owner and original model-facing shapes. */
export interface SessionProviderKeyExecutionPorts {
  readonly original: AutomationStudioSessionKeyPorts;
  matches(originalReceiver: unknown, originalCallback: object): boolean;
  isCompletedRefusal(error: unknown, originalReturned: Promise<unknown>): boolean;
  snapshot(observation: ExecutionCallbackObservation): ReturnType<AutomationStudioSessionKeyPorts["snapshot"]>;
  createSessionRevealAuthorization(input: Parameters<AutomationStudioSessionKeyPorts["createSessionRevealAuthorization"]>[0], observation: ExecutionCallbackObservation): ReturnType<AutomationStudioSessionKeyPorts["createSessionRevealAuthorization"]>;
  revealKeyWithAuthorization(input: Parameters<AutomationStudioSessionKeyPorts["revealKeyWithAuthorization"]>[0], observation: ExecutionCallbackObservation): ReturnType<AutomationStudioSessionKeyPorts["revealKeyWithAuthorization"]>;
  revokeRevealAuthorization(authorizationId: string, observation: ExecutionCallbackObservation): Promise<void>;
  unlockedSessionFor(userId: string, observation: ExecutionCallbackObservation): Promise<string | null>;
}
