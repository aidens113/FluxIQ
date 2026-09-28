// Starting a thread.
//
// The chat window is the product's channel to the person, and until Core
// registered `open-conversation` on 2026-09-28 only Core could open one: a run,
// a build or a node spoke first, or nobody spoke at all. A person who wanted to
// begin the conversation had no way to, and the composer they were looking at
// was disabled for a reason that was never their fault.
//
// It is declared here rather than excused because it is not plumbing. "Start a
// thread about this Flow" is a thing a person asks for in exactly those words,
// and the capability catalog is what the model reads to know it can.
//
// Core continues a subject's open thread when there is one, so asking twice
// leaves one thread rather than two, and asking with nothing selected opens the
// project's own thread rather than being refused.

import { startConversation } from "../../turn-commands";
import { automationStudioViewId } from "../../../views";
import { definePanelCapability, panelCapabilityResult, type PanelCapability } from "../contract";
import { PROJECT } from "./argument";
import { str } from "./value";

const SUBJECT_KINDS = ["project", "flow", "build", "run"] as const;

type ConversationSubjectKind = (typeof SUBJECT_KINDS)[number];

/**
 * What the thread is about. Both halves are needed together or neither is used:
 * a kind without an id narrows nothing, and Core refuses half a subject rather
 * than quietly ignoring it. Anything unrecognised falls back to the project,
 * which is what someone with nothing selected means.
 */
function subject(args: Parameters<typeof str>[0]): { subjectKind: ConversationSubjectKind; subjectId: string } | null {
  const kind = str(args, "subjectKind");
  const id = str(args, "subjectId");
  if (!id) return null;
  const matched = SUBJECT_KINDS.find((candidate) => candidate === kind);
  return matched ? { subjectKind: matched, subjectId: id } : null;
}

export const CONVERSATION_CAPABILITIES: readonly PanelCapability[] = [
  definePanelCapability({
    id: "conversation.start",
    title: "Start a conversation",
    summary: "Opens a thread you can write in, about the project or about one Flow, run or build.",
    group: "Conversation",
    phrases: ["start a conversation", "open a thread", "new thread", "talk about this", "start a chat"],
    control: { view: automationStudioViewId.flowEditor, label: "Write to FluxIQ" },
    endpoints: ["open-conversation"],
    arguments: [
      PROJECT,
      { name: "subjectKind", kind: "text", describe: "What it is about: the project, a flow, a run or a build.", required: false },
      { name: "subjectId", kind: "id", describe: "The id of that flow, run or build. Left out, the thread is about the project.", required: false },
      { name: "title", kind: "text", describe: "A short name for the thread.", required: false }
    ],
    consequences: ["create_new"],
    invoke: async (context, args) => panelCapabilityResult(
      await startConversation(context.transport, {
        projectId: str(args, "projectId"),
        ...(subject(args) ?? {}),
        ...(str(args, "title") ? { title: str(args, "title") } : {})
      }),
      "Opened a thread.",
      "The thread could not be opened."
    )
  })
];
