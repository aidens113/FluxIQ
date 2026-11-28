// The chat's `ChatTransport` over the panel's program API: the same Core
// endpoints the Studio's own conversation view reads and writes, reached
// through the same `ProgramCommandTransport`, so the widget is a second client
// of Core and not a second copy of the conversation.
//
// Ports this client can carry: the conversation, the activity, the change
// feed, Stop / Take over / Hand back, the recordings a person may attach, and
// whether a model key is enabled. Left absent, on purpose:
//
//   runs.openInstructions   the Studio shows a run's task instructions, not this chat
//   activity.setOverlay     the panel has no page overlay to expand or collapse

import type { ChatConversationPort, ChatOnScreen, ChatTransport } from "@fluxiq/ui-components";
import type { ConversationOnScreen } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { createProgramActivityPort, type ProgramActivityPort } from "../activity";
import { createChangesPort } from "./changes-port";
import { createComposedConversationPort } from "./composed-conversation-port";
import { createConversationPort } from "./conversation-port";
import { notifyKeysOnFailedSend } from "./notify-keys-on-failed-send";
import { createPanelConversationPort } from "./panel-conversation-port";
import { createModelsPort } from "./models-port";
import type { ProgramChatTransportOptions } from "./options";
import { createRecordingsPort } from "./recordings-port";
import { createRunPort } from "./run-port";
import { withOnScreen } from "./with-on-screen";

/** The chat's transport, whose activity port its host tells when the chat moves to another project (`followProject`). */
export type ProgramChatTransport = ChatTransport & { readonly activity: ProgramActivityPort };

export function createProgramChatTransport(api: ProgramCommandTransport, options: ProgramChatTransportOptions): ProgramChatTransport {
  return {
    conversation: withKeyRefresh(conversationFor(api, options), options),
    changes: createChangesPort(options),
    activity: createProgramActivityPort(api, { projectId: options.projectId, ...(options.activityTimers ? { timers: options.activityTimers } : {}), ...(options.changes ? { changes: options.changes } : {}) }),
    runs: createRunPort(api, options),
    recordings: createRecordingsPort(api, options),
    ...(options.secretKeys ? { models: createModelsPort(options.secretKeys) } : {}),
    ...(options.modelKeys ? { modelKeys: options.modelKeys } : {})
  };
}

function withKeyRefresh(conversation: ChatConversationPort, options: ProgramChatTransportOptions): ChatConversationPort {
  const { modelKeys } = options;
  return modelKeys ? notifyKeysOnFailedSend(conversation, () => modelKeys.notify()) : conversation;
}

// The panel's docked chat is project chats (in the person's own project when none is open), with the
// person's earlier chats that have no project listed beside them where they live.
function conversationFor(api: ProgramCommandTransport, options: ProgramChatTransportOptions): ChatConversationPort {
  const { panel } = options;
  if (!panel) return createConversationPort(api, options);
  const openProject = panel.openProject ?? (() => undefined);
  return createComposedConversationPort({
    panel: createPanelConversationPort(api, panel),
    // Each message keeps the page and selection it was written on, for the panel assistant it may be handed to.
    project: createConversationPort(withOnScreen(api, () => panel.onScreen()), {
      projectId: options.projectId,
      onScreen: () => conversationOnScreen(panel.onScreen()),
      ...(options.personProject ? { personProject: options.personProject } : {})
    }),
    openProject
  });
}

function conversationOnScreen(onScreen: ChatOnScreen): ConversationOnScreen {
  const { flowId, runId, recordingId } = onScreen;
  return { ...(flowId ? { flowId } : {}), ...(runId ? { runId } : {}), ...(recordingId ? { recordingId } : {}) };
}
