// Which of this instance's chat changes reach its client gateway: each project
// chat's, as its write commits (`AutomationStudioConversations.signals`). The
// signals are this runtime's own (one per runtime, so one per tenant on a
// hosted process), so another tenant's chats never reach this gateway at all.
//
// A person's panel thread is signalled on the same hub and is never handed on:
// no paired client may read one (the panel assistant's endpoints refuse the
// paired-client channel). Only the chat's id and project are handed on, never
// what was said; the gateway then decides, per paired person, whether they may
// read it (`client-gateway/service/project-focus/conversation-delivery.ts`).

import type { ClientGatewayConversationChanged } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioConversationSignalsPort } from "../../../../runtime/conversations/index.ts";

/** What the relay reads and where it hands each change. */
export type ProjectConversationRelayPorts = {
  /** This runtime's thread changes (`AutomationStudioConversations.signals`). */
  readonly signals: Pick<AutomationStudioConversationSignalsPort, "subscribe">;
  /** This instance's gateway (`ClientGatewayService.conversationPush.publish`). */
  readonly publish: (change: ClientGatewayConversationChanged) => void;
};

/** Hands `publish` each project chat's change by id and project; returns what stops it. */
export function relayProjectConversationChanges(ports: ProjectConversationRelayPorts): () => void {
  return ports.signals.subscribe((signal) => {
    if (signal.scope.kind !== "project") return;
    ports.publish({ conversationId: signal.conversationId, projectId: signal.scope.projectId });
  });
}
