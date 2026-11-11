// One task's own settings, for a client that can carry them. Absent: the chat offers no
// control for them, and a task runs as the person's starting values say.
//
// Humanness is a whole number from 0 to 100: 0 is fastest, and higher adds human-like
// timing, click positions and the odd harmless misclick, for sites that limit robots.
// Robot checks always pause for the person, at any level. The level a run uses is the
// first of: the run's own option, the task's, the Flow's, the person's starting value,
// then 0. This port reads and sets the task's; `starting` is the person's starting
// value, which the client knows (the extension's `FluxIQSettings.humanness`).
//
// Core's calls behind it: `list-project-tasks` rows carry `humanness?`, and
// `update-task-settings { projectId, taskId, humanness: number | null }` sets or clears
// it. Core refuses a level out of range with a named error, which the client's adapter
// answers as a failed result whose `sentence` says it in the person's words; the
// control shows that sentence and goes back to what was saved.

import type { ChatResult } from "./result.ts";

/** The task a setting belongs to. */
export type ChatTaskRef = { projectId: string; taskId: string };

/** A task's humanness as read: its own level when it has one, and the person's starting value it uses otherwise. */
export type ChatTaskSettings = { humanness?: number; starting: number };

/** Sets a task's own humanness, or clears it with `null` so the task uses the starting value again. */
export type ChatSetHumannessRequest = { projectId: string; taskId: string; humanness: number | null };

/** Reads and sets a task's own settings. Requests never throw through a port. */
export type ChatTaskSettingsPort = {
  /** The task's humanness and the starting value. A task it cannot find is a failed read. */
  read(task: ChatTaskRef): Promise<ChatResult<ChatTaskSettings>>;
  /** Answers the task's own level as saved: absent once cleared. A level out of range is a failed result in the person's words. */
  setHumanness(request: ChatSetHumannessRequest): Promise<ChatResult<{ humanness?: number }>>;
};
