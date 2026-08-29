import {
  loadAutomationGraphDraft,
  removeAutomationGraphDraft,
  removeAutomationGraphOperationDraft,
  saveAutomationGraphDraft,
  saveAutomationGraphOperationDraft,
  type AutomationGraphDraftRecord,
  type AutomationGraphOperationDraftRecord
} from "../../graph/draft-store";

export type AutomationFlowDraftRepository = {
  loadSnapshot<TGraph>(projectId: string, flowId: string): AutomationGraphDraftRecord<TGraph> | null;
  saveSnapshot<TGraph>(record: AutomationGraphDraftRecord<TGraph>): boolean;
  removeSnapshot(projectId: string, flowId: string): void;
  saveOperations<TOperation>(record: AutomationGraphOperationDraftRecord<TOperation>): Promise<boolean>;
  removeOperations(projectId: string, flowId: string): Promise<void>;
};

export function createBrowserAutomationFlowDraftRepository(): AutomationFlowDraftRepository {
  return {
    loadSnapshot: loadAutomationGraphDraft,
    saveSnapshot: saveAutomationGraphDraft,
    removeSnapshot: removeAutomationGraphDraft,
    saveOperations: saveAutomationGraphOperationDraft,
    removeOperations: removeAutomationGraphOperationDraft
  };
}
