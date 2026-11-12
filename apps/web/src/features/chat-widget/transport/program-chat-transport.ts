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
import { createProgramActivityPort } from "../activity";
import { createChangesPort } from "./changes-port";
import { createComposedConversationPort } from "./composed-conversation-port";
import { createConversationPort } from "./conversation-port";
import { createPanelConversationPort } from "./panel-conversation-port";
import { createModelsPort } from "./models-port";
import type { ProgramChatTransportOptions } from "./options";
import { createRecordingsPort } from "./recordings-port";
import { createRunPort } from "./run-port";

export function createProgramChatTransport(api: ProgramCommandTransport, options: ProgramChatTransportOptions): ChatTransport {
  return {
    conversation: conversationFor(api, options),
    changes: createChangesPort(options),
    activity: createProgramActivityPort(api, { projectId: options.projectId, ...(options.activityTimers ? { timers: options.activityTimers } : {}) }),
    runs: createRunPort(api, options),
    recordings: createRecordingsPort(api, options),
    ...(options.secretKeys ? { models: createModelsPort(options.secretKeys) } : {})
  };
}

// A panel chat is the person's own threads, joined by the open project's when the host says which is open.
function conversationFor(api: ProgramCommandTransport, options: ProgramChatTransportOptions): ChatConversationPort {
  const { panel } = options;
  if (!panel) return createConversationPort(api, options);
  const own = createPanelConversationPort(api, panel);
  if (!panel.openProject) return own;
  return createComposedConversationPort({
    panel: own,
    project: createConversationPort(api, { projectId: options.projectId, onScreen: () => conversationOnScreen(panel.onScreen()) }),
    openProject: panel.openProject
  });
}

function conversationOnScreen(onScreen: ChatOnScreen): ConversationOnScreen {
  const { flowId, runId, recordingId } = onScreen;
  return { ...(flowId ? { flowId } : {}), ...(runId ? { runId } : {}), ...(recordingId ? { recordingId } : {}) };
}
