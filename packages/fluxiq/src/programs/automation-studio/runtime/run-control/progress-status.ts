// The one status a person is shown for a run, out of the nine the product
// promises -- Ready, Running, Waiting, Paused, Adapting, User action required,
// Completed, Failed, Stopped -- plus Interrupted: a run whose process ended
// while it was in flight. That is not Failed, because nobody knows whether its
// last act landed, and the person has to check the page before running again.
//
// The run's stored status is not enough on its own. A held run stays `running`
// in its record -- its admission, its lease and every reader that counts active
// runs depend on that -- so whether it is paused lives only in its live control.
// And a `waiting` run is two different things to a person: a run that parked on
// a question is waiting on *them*, while one waiting out a timer or an outside
// state is not.

import { automationStudioRunProgressStatus, type AutomationStudioRunProgressFacts, type AutomationStudioRunProgressStatus } from "../../../../runtime/run-control/index.ts";
import type { AutomationStudioRunControlSnapshot } from "./types.ts";

export { AUTOMATION_STUDIO_RUN_PROGRESS_STATUSES } from "../../../../runtime/run-control/index.ts";
export type { AutomationStudioRunProgressStatus } from "../../../../runtime/run-control/index.ts";
export type AutomationStudioRunProgress = {
  status: AutomationStudioRunProgressStatus;
  label: string;
  /** One sentence on what the person can do now, when there is something. */
  detail?: string;
};

const LABELS: Record<AutomationStudioRunProgressStatus, string> = {
  ready: "Ready",
  running: "Running",
  waiting: "Waiting",
  paused: "Paused",
  adapting: "Adapting",
  user_action_required: "User action required",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
  interrupted: "Interrupted"
};

type SessionFacts = AutomationStudioRunProgressFacts;

export function automationStudioRunProgress(session: SessionFacts, control: AutomationStudioRunControlSnapshot | null): AutomationStudioRunProgress {
  const status = automationStudioRunProgressStatus(session, control);
  const detail = progressDetail(status, control);
  return { status, label: LABELS[status], ...(detail ? { detail } : {}) };
}

function progressDetail(status: AutomationStudioRunProgressStatus, control: AutomationStudioRunControlSnapshot | null): string | undefined {
  if (status === "user_action_required" && control?.state === "paused") return "You have control of the page. Finish what you are doing in the browser, then select Continue.";
  if (status === "user_action_required") return "FluxIQ asked a question and is waiting for your answer.";
  if (status === "interrupted") return "FluxIQ stopped while this run was in progress. Check the page before running it again.";
  if (status === "paused") return "The run is held between steps. Resume it, or take control of the page.";
  if ((status === "running" || status === "adapting") && control?.state === "pause_requested") return "Pausing after the current step finishes.";
  return undefined;
}
