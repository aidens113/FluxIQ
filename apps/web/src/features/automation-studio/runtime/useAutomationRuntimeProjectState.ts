"use client";

import type { AutomationStudioStores } from "../stores/studio-stores";
import {
  useAutomationProjectEntityCollection, useAutomationProjectEntityCollectionSetter,
  useAutomationProjectResource, useAutomationProjectResourceSetter
} from "../stores/use-project-data-resource";

const EMPTY_PIPELINE_ARTIFACTS = Object.freeze({
  normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [],
  stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: []
});
const EMPTY_GATEWAY_SNAPSHOT = Object.freeze({ enabled: false, sessions: [], pairings: [], auditLog: [] });
const runId = (value: any, index: number) => String(value?.runId ?? value?.id ?? `index:${index}`);

export function useAutomationRuntimeProjectState(stores: AutomationStudioStores) {
  const runtimeSessions = useAutomationProjectEntityCollection<any>(stores, "runs");
  const pipelineArtifacts = useAutomationProjectResource<any>(stores, "pipelineArtifacts", EMPTY_PIPELINE_ARTIFACTS);
  const gatewaySnapshot = useAutomationProjectResource<any>(stores, "gatewaySnapshot", EMPTY_GATEWAY_SNAPSHOT);
  return {
    runtimeSessions, setRuntimeSessions: useAutomationProjectEntityCollectionSetter(stores, "runs", runId),
    pipelineArtifacts, setPipelineArtifacts: useAutomationProjectResourceSetter<any>(stores, "pipelineArtifacts"),
    gatewaySnapshot, setGatewaySnapshot: useAutomationProjectResourceSetter<any>(stores, "gatewaySnapshot")
  };
}