"use client";

// What the workspace does for the conversation view: remember which thread a
// tab was on, and open the thing a turn's attachment refers to.
//
// The attachment reference is Core's, and the panel does not invent a meaning
// for it. One prefix is understood -- `adaptation:<id>`, which the Adaptations
// view already owns a screen for -- and anything else is reported to the
// person rather than silently dropped, so a turn never points at something
// nobody can reach.

import { notifyGlobalAlert } from "../../../programs/components";
import { automationStudioObjectViewInstanceId, automationStudioViewId } from "../../views";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

type WorkspacePrefs = { viewStates?: Record<string, Record<string, unknown>> };
const ADAPTATION_REF = /^adaptation:(?<adaptationId>[A-Za-z0-9._:-]{1,190})$/u;

export function useConversationWorkspaceNavigation(options: {
  selectedFlowId?: string;
  updatePrefs(update: (current: WorkspacePrefs) => WorkspacePrefs, options?: { persist?: boolean }): void;
  openAdaptation(flowId: string | undefined, adaptationId: string): void;
}) {
  const selectConversation = useStableAutomationEvent((conversationId: string) => {
    options.updatePrefs((current) => {
      const instanceId = automationStudioObjectViewInstanceId(automationStudioViewId.conversation, options.selectedFlowId);
      const currentState = current.viewStates?.[instanceId] ?? {};
      if (currentState.selectedConversationId === conversationId) return current;
      return {
        ...current,
        viewStates: {
          ...current.viewStates,
          [instanceId]: { ...currentState, selectedConversationId: conversationId }
        }
      };
    }, { persist: true });
  });

  const openConversationAttachment = useStableAutomationEvent((attachment: { kind: string; ref: string }) => {
    const adaptationId = ADAPTATION_REF.exec(attachment.ref)?.groups?.adaptationId;
    if (adaptationId) {
      options.openAdaptation(options.selectedFlowId, adaptationId);
      return;
    }
    notifyGlobalAlert({
      tone: "info",
      title: "Nothing to open here",
      message: `This conversation refers to ${attachment.ref}, which has no screen in the panel yet.`
    });
  });

  return { openConversationAttachment, selectConversation };
}
