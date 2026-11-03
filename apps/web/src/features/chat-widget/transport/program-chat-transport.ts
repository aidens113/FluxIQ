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

import type { ChatTransport } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { createProgramActivityPort } from "../activity";
import { createChangesPort } from "./changes-port";
import { createConversationPort } from "./conversation-port";
import { createModelsPort } from "./models-port";
import type { ProgramChatTransportOptions } from "./options";
import { createRecordingsPort } from "./recordings-port";
import { createRunPort } from "./run-port";

export function createProgramChatTransport(api: ProgramCommandTransport, options: ProgramChatTransportOptions): ChatTransport {
  return {
    conversation: createConversationPort(api, options),
    changes: createChangesPort(options),
    activity: createProgramActivityPort(api, { projectId: options.projectId, ...(options.activityTimers ? { timers: options.activityTimers } : {}) }),
    runs: createRunPort(api, options),
    recordings: createRecordingsPort(api, options),
    ...(options.secretKeys ? { models: createModelsPort(options.secretKeys) } : {})
  };
}
