import { drainState } from "./drain-state";

/** The refusal a program call gets while the server drains: an HTTP 503 with the code a client can act on. */
export type ProgramDrainRefusal = {
  status: 503;
  retryAfterSeconds: number;
  body: { ok: false; error: string; errorCode: "server.draining" };
};

/**
 * The endpoints that start new work: a build, a run, a trial or a client-side
 * action. Reads and the ones that wind work down (cancel, pause, stop, answer)
 * are never listed, so a draining server still lets people see and stop what
 * is running.
 */
const STARTS_WORK: ReadonlySet<string> = new Set([
  "start-runtime-session",
  "run-runtime-session",
  "resume-runtime-session",
  "append-turn",
  "generate-flow-bootstrap-adaptation",
  "start-client-recording",
  "execute-client-action",
]);

const RETRY_AFTER_SECONDS = 30;

/**
 * A refusal when the server is draining and this call would start work, else
 * null. Only Automation Studio registers these endpoints.
 */
export function programDrainRefusal(programId: string, endpoint: string): ProgramDrainRefusal | null {
  if (programId !== "automation-studio" || !STARTS_WORK.has(endpoint) || !drainState.isDraining()) return null;
  return {
    status: 503,
    retryAfterSeconds: RETRY_AFTER_SECONDS,
    body: {
      ok: false,
      error: "The server is restarting and is not starting new builds or runs; try again in a moment.",
      errorCode: "server.draining",
    },
  };
}
