"use client";

// The canonical entry point for the conversation view.
//
// It does one thing: bind the commands to the transport and hand them to the
// content component. The split is the panel's own convention -- every Studio
// view has an `XView` that reads its commands from a hook and an
// `XViewContent` that takes them as props -- and it exists so the content can
// be mounted in a test with doubles for every call.

import { useConversationCommands } from "../conversation-host";
import { ConversationViewContent, type ConversationViewProps } from "./ConversationViewContent";

export function ConversationView(props: ConversationViewProps) {
  const commands = useConversationCommands();
  return <ConversationViewContent {...props} commands={commands} />;
}
