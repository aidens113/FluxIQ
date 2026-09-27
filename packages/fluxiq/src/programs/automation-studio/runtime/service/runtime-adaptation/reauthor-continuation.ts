import type { AutomationStudioBootstrapAdaptation } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import {
  automationStudioLlmExecutionGrantRefusalCode,
  type AutomationStudioLlmExecutionGrantRefusalCode,
  type AutomationStudioRuntimeSessionGrant
} from "../../llm/index.ts";

type Binding = { executionDigest: string; settingsRevision: number };

export type AutomationStudioRuntimeReauthorGrantContinuation = (input: AutomationStudioRuntimeSessionGrant & {
  projectId: string;
  flowId: string;
  expectedPreviousBinding: Binding;
  appliedBinding: Binding;
}) => Promise<unknown>;

export async function applyAutomationStudioRuntimeReauthorAndContinueGrant(input: {
  projectId: string;
  flowId: string;
  adaptationId: string;
  actorId: string;
  expectedPreviousBinding: Binding;
  executionGrant: AutomationStudioRuntimeSessionGrant;
  withLock<T>(callback: () => Promise<T>): Promise<T>;
  loadAdaptation(): Promise<AutomationStudioBootstrapAdaptation | null>;
  apply(adaptation: AutomationStudioBootstrapAdaptation): Promise<AutomationStudioBootstrapAdaptation>;
  readAppliedBinding(): Promise<Binding>;
  continueGrant?: AutomationStudioRuntimeReauthorGrantContinuation | undefined;
}): Promise<{ replayReady: true } | { replayReady: false; code: AutomationStudioLlmExecutionGrantRefusalCode }> {
  return await input.withLock(async () => {
    const adaptation = await input.loadAdaptation();
    if (!adaptation) throw new Error(`Unknown Flow Bootstrap adaptation: ${input.adaptationId}`);
    if (adaptation.baseDependencyDigest !== input.expectedPreviousBinding.executionDigest
      || adaptation.baseSettingsRevision !== input.expectedPreviousBinding.settingsRevision) {
      throw new Error("The run-owned grant binding does not match this Flow Bootstrap adaptation.");
    }
    const applied = await input.apply(adaptation);
    try {
      const appliedBinding = await input.readAppliedBinding();
      if (!applied.application || !input.continueGrant) return { replayReady: false, code: "llm.execution_grant_no_longer_valid" };
      await input.continueGrant({ ...input.executionGrant, projectId: input.projectId, flowId: input.flowId, expectedPreviousBinding: input.expectedPreviousBinding, appliedBinding });
      return { replayReady: true };
    } catch (error) {
      return { replayReady: false, code: automationStudioLlmExecutionGrantRefusalCode(error) ?? "llm.execution_grant_no_longer_valid" };
    }
  });
}

export function automationStudioRuntimeReauthorContinuationDetail(input: {
  detail: AutomationStudioFlowRunDetail;
  applied: boolean;
  failure?: AutomationStudioLlmExecutionGrantRefusalCode | undefined;
}): AutomationStudioFlowRunDetail {
  if (!input.applied) return input.detail;
  const marker = input.detail.metadata?.resultReauthor;
  return {
    ...input.detail,
    metadata: {
      ...(input.detail.metadata ?? {}),
      resultReauthor: {
        ...(marker && typeof marker === "object" && !Array.isArray(marker) ? marker : {}),
        replayReady: !input.failure,
        ...(input.failure ? {
          code: input.failure,
          stage: "grant_continuation",
          retryable: false,
          providerInvocation: "not_attempted",
          providerResponse: "not_received"
        } : {})
      }
    }
  };
}
