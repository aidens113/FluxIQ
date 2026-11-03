// The capabilities Core runs itself when the chat chooses them.
//
// Each is a capability the panel also offers, run here instead so that every
// client -- the web panel, the paired extension, anything else that can post a
// turn -- gets the same thing done the same way, and a client whose own code
// cannot build a Flow (the extension) can still ask for one. The model is
// shown Core's descriptor for these ids, whatever a client sent under them
// (`vocabulary.ts`), so a client only has to name the id.

import { AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK } from "./answer-ask.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE } from "./create-here.ts";
import { AUTOMATION_STUDIO_CONVERSATION_DESCRIBE } from "./describe.ts";
import { AUTOMATION_STUDIO_CONVERSATION_EXPLORE } from "./explore.ts";
import { AUTOMATION_STUDIO_CONVERSATION_IMPROVE } from "./improve.ts";
import { AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW } from "./run-flow.ts";

export const AUTOMATION_STUDIO_CONVERSATION_COMMANDS: ReadonlyMap<string, AutomationStudioConversationCommand> = new Map(
  [
    AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE,
    AUTOMATION_STUDIO_CONVERSATION_DESCRIBE,
    AUTOMATION_STUDIO_CONVERSATION_EXPLORE,
    AUTOMATION_STUDIO_CONVERSATION_IMPROVE,
    AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW,
    AUTOMATION_STUDIO_CONVERSATION_ANSWER_ASK
  ].map((command) => [command.capability.id, command])
);
