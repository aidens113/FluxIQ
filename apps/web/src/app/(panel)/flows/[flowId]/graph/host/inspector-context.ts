import { automationInspectorReferenceOptions, type InspectorPanelContext } from "../../../../../../features/automation-studio/inspector";
import type { AutomationSelection } from "../../../../../../features/automation-studio/shared/selection-contracts";

const noPipeline = Object.freeze({
  normalizationReviews: [], miningRuns: [], evidenceFacts: [], evidenceObservations: [],
  stateActionCorrelations: [], evidenceClaims: [], learnedTaskModels: [], policyProposals: [], replayResults: []
});
const noDependencies = Object.freeze({ dependencies: 0, usedBy: 0, availableUpgrades: 0 });

/**
 * What the step details beside the graph read. This page holds one Flow and its step types, and
 * nothing of recordings, runs or published versions, so those parts of the details stay empty
 * rather than guessed.
 */
export function graphInspectorContext(input: {
  selection: AutomationSelection | null;
  flow: unknown;
  node: unknown;
  definitions: readonly unknown[];
}): InspectorPanelContext | null {
  const { selection } = input;
  if (!selection) return null;
  return {
    selection,
    policy: null,
    flow: input.flow,
    node: input.node,
    recording: null,
    entry: null,
    signal: null,
    timelineEntries: [],
    flowPublicationCount: 0,
    flowDependencies: { ...noDependencies },
    referenceOptions: selection.kind === "editor-node"
      ? automationInspectorReferenceOptions({ flow: input.flow, nodeDefinitions: [...input.definitions], policies: [], pipelineArtifacts: noPipeline, signals: [] })
      : {},
    statePanel: null
  };
}
