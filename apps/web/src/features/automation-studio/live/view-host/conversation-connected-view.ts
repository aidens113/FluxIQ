// The conversation view's connector.
//
// It lives in its own module rather than beside the other twelve because
// `canonical-connected-views.tsx` is already at its one-component-per-file
// ceiling: a connector is a PascalCase export in a `.tsx` file, so the audit
// counts each of them as a component. A connector needs no JSX, so this is a
// `.ts` module and the ceiling stays where it is.

import { automationEntityScope } from "../../stores";
import { automationStudioViewId } from "../../views";
import type { AutomationCanonicalConnectorScope } from "./canonical-connected-views";
import { selectAutomationConnectorFlow } from "./canonical-connected-views";
import { createAutomationDirectViewConnector } from "./direct-view-connector";

const selectionScopes = () => ["selection", "state-open", "preview"] as const;
const selectedFlowScopes = () => [automationEntityScope("flows"), "resource:snapshot"] as const;

export const AutomationConversationConnectedView = createAutomationDirectViewConnector({
  id: automationStudioViewId.conversation,
  placeholder: (scope: AutomationCanonicalConnectorScope) => ({ projectId: scope.projectId, flow: null }) as any,
  projectScopes: selectedFlowScopes,
  selectionScopes,
  activationKey: (state, scope: AutomationCanonicalConnectorScope) =>
    selectAutomationConnectorFlow(state, scope, automationStudioViewId.conversation).flow?.flowId ?? "none",
  selectModel: (state, scope: AutomationCanonicalConnectorScope) => {
    const prefs = scope.getWorkspacePrefs();
    const flow = selectAutomationConnectorFlow(state, scope, automationStudioViewId.conversation).flow;
    const saved = prefs.viewStates?.[scope.viewInstanceId ?? automationStudioViewId.conversation];
    return {
      flow,
      projectId: scope.projectId,
      ...(saved && typeof saved.selectedConversationId === "string"
        ? { requestedConversationId: saved.selectedConversationId }
        : {})
    } as any;
  }
});
