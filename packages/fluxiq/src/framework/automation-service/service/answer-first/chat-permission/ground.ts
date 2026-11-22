// What a build's permission gate is told about its chat (t976): every answer the person gives and
// every gated class a run met that nobody foresaw, kept beside the Flow as they happen; and, for a
// build that does not start itself (a legacy, candidate or project build), where its start comes
// from (`startFrom`): the chat's held answer and the classes the task needs. An answer-first
// attempt starts itself (`./start.ts`) and never reads `startFrom`.
//
// **One question per build, however many gates.** A project build gives every brief a gate of its
// own from this same ground, so the first gate to start asks, and every other gate waits for that
// start, then holds the chat's answer and asks nothing.
//
// A write that fails costs the chat that record and nothing else: the person is asked again at the
// next start, the safe side of a permission.

import type { AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioFlowBootstrapPermissionHeard, AutomationStudioFlowBootstrapStartPermission, AutomationStudioFlowBootstrapStartRequest } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { automationStudioAnswerFirstChatInstruction } from "./instruction-key.ts";
import { automationStudioAnswerFirstChatStartRequest } from "./start-request.ts";
import { automationStudioAnswerFirstChatPermissionOf } from "./store-of.ts";

export function automationStudioAnswerFirstChatPermissionGround(input: {
  owner: object;
  stores: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> };
  projectId: string;
  flowId: string;
  instructionText: string;
  /** What the chat's reading declared the task will cause (`runtime/conversations/instructions/acts.ts`); absent when it declared nothing. */
  taskActs?: readonly string[] | undefined;
  /** A non-chat legacy entry may relocate its existing instruction read to the start. Chat invocations declare a list and never call this. */
  instructionClasses?: (() => Promise<readonly string[]>) | undefined;
}): {
  heard: (answer: AutomationStudioFlowBootstrapPermissionHeard) => Promise<void>;
  unforeseen: (classes: readonly AutomationStudioActionConsequence[]) => Promise<void>;
  startFrom: () => Promise<AutomationStudioFlowBootstrapStartRequest>;
  started: (start: AutomationStudioFlowBootstrapStartPermission, request: AutomationStudioFlowBootstrapStartRequest) => Promise<void>;
} {
  const chat = automationStudioAnswerFirstChatPermissionOf(input.owner, input.stores);
  const instruction = automationStudioAnswerFirstChatInstruction(input.instructionText);
  // The first gate's start, which every later gate of this build waits for (header).
  let first: Promise<void> | undefined;
  let firstDone: () => void = () => undefined;
  const request = async () => {
    const start = await automationStudioAnswerFirstChatStartRequest({ chat, projectId: input.projectId, flowId: input.flowId, instruction, taskActs: input.taskActs });
    return start.classes === undefined && input.instructionClasses ? { ...start, classes: await input.instructionClasses() } : start;
  };
  return {
    heard: async (answer) => {
      try {
        await chat.heard(input.projectId, input.flowId, answer);
      } catch {
        /* best-effort: an unwritten answer means the person is asked again at the next start. */
      }
    },
    unforeseen: async (classes) => {
      try {
        await chat.needs(input.projectId, input.flowId, instruction, classes);
      } catch {
        /* best-effort: an unwritten class is met unforeseen again and recorded then. */
      }
    },
    startFrom: async () => {
      if (!first) {
        first = new Promise<void>((resolve) => {
          firstDone = resolve;
        });
        return { ...(await request()), ask: true };
      }
      await first;
      return { ...(await request()), ask: false };
    },
    started: async (_start, asked) => {
      try {
        if (asked.classes?.length) await chat.needs(input.projectId, input.flowId, instruction, asked.classes);
      } catch {
        /* best-effort: the next start takes the classes from the chat's reading again. */
      }
      if (asked.ask) firstDone();
    }
  };
}
