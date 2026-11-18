/**
 * Where a minted enrolment ticket routes: the workspace whose gateway minted
 * it and the environment it enrols. `release` lets go of what keeps that
 * gateway open until the ticket can no longer be presented; the route table
 * calls it exactly once.
 */
export type EnvironmentEnrolmentRoute = {
  workspaceId: string;
  environmentId: string;
  release(): void;
};

/** What looking a ticket up answers: never the hold, only where it routes. */
export type EnvironmentEnrolmentDestination = {
  workspaceId: string;
  environmentId: string;
};

/** Schedules `run` after `delayMs`; answers how to cancel it. */
export type EnvironmentEnrolmentTimer = (run: () => void, delayMs: number) => () => void;
