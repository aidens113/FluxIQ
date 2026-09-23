"use client";

// What the workspace does for the conversation overlay: open the thing a
// turn's attachment refers to.
//
// The attachment reference is Core's, and the panel does not invent a meaning
// for it. One prefix is understood -- `adaptation:<id>`, which the Adaptations
// view already owns a screen for -- and anything else is reported to the
// person rather than silently dropped, so a turn never points at something
// nobody can reach.
//
// Which thread was open is deliberately not remembered in the workspace's
// saved view state any more: the conversation is no longer a view instance, it
// is an overlay that opens on whichever thread is waiting on an answer, which
// is a better default than whichever thread was open last.

import { notifyGlobalAlert } from "../../../programs/components";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

const ADAPTATION_REF = /^adaptation:(?<adaptationId>[A-Za-z0-9._:-]{1,190})$/u;

export function useConversationWorkspaceNavigation(options: {
  selectedFlowId?: string;
  openAdaptation(flowId: string | undefined, adaptationId: string): void;
}) {
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

  return { openConversationAttachment };
}
