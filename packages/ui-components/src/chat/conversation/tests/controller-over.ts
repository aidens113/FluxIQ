// Test support: a conversation controller over a fake `request`, the way the
// controller's tests were first written, carried through the conversation port.

import { conversationOver, type TestRequest } from "../../tests/message-transport.ts";
import { createConversationController, type ConversationController } from "../controller.ts";
import type { ConversationClock } from "../read/index.ts";

/** `createConversationController` over the old message shapes. */
export function controllerOver(request: TestRequest, onChange: () => void, clock?: ConversationClock): ConversationController {
  const conversation = conversationOver(request);
  return clock === undefined ? createConversationController(conversation, onChange) : createConversationController(conversation, onChange, clock);
}
