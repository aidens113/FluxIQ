// Which controls a task's details draw. Each follows the port: a method the client does not
// supply is a control that is not drawn. Add budget and Run again are the answer turn's own.

import type { ChatTaskOutcome } from "../../../chat/ports/index.ts";
import type { TaskSummary, TasksPort } from "../port.ts";
import { waitingReason } from "./waiting.ts";

export type TaskActions = { carryOn: boolean; openInChat: boolean; rename: boolean; remove: boolean };

/** `canOpenInChat`: the client can open a task's chat. */
export function taskActions(task: TaskSummary, latest: ChatTaskOutcome, port: TasksPort, canOpenInChat: boolean): TaskActions {
  return {
    carryOn: port.carryOn !== undefined && waitingReason(latest.attempt) === "interrupted",
    openInChat: canOpenInChat && task.conversationId !== undefined,
    rename: port.rename !== undefined,
    remove: port.remove !== undefined
  };
}
