// Whether a part may drive this project's page now. Nothing here is a new lock: the two
// things that already say who is driving are asked, and a part run takes part in both.
//
// **A host resource lease** is what a project build holds for all of its work, explorations
// and trials alike (`runtime/project-agents/dispatch/host-lease.ts`), and what makes an unleased
// command to its browser refused unsent (`host-resources/lease-scope.ts`). A person's part
// holds one too, from before it reads the page until it ends, so a second part is refused
// and a build's next brief waits behind it. A lease the scheduler holds refuses at once: it
// never waits, because a person and a build are both better told now. A build's call from
// inside its lease scope IS that run: it holds the page already. A host with no resources
// (`hostResources` absent) has nothing to lease, and only the sessions below can say.
//
// **The session gate** (`../../runtime-session/admission.ts`) is what refuses a second adaptive
// run, by reading the project's sessions. A person's plain Flow run holds no lease, so this is
// the only thing that can see it. Every active session counts here, not only adaptive ones:
// any of them may be driving the page. For a build, a session under a lease of its own kind
// does not count: it is this build's own, or on a resource that shares nothing with this one
// (`AutomationStudioHostResourcePort`'s obligation). A listing that fails refuses the part as
// `parts.unavailable`, as there: nothing can say the page is free, and nothing says another run
// has it either. The person reads that it could not be checked, the store's own message goes to
// the log, and the listing is read before the gate, whose every remaining refusal does mean a run.
//
// The session itself is written later, once the guard has passed, since a refused part leaves
// none. What stops two parts passing together in between is the lease.
//
// **A Flow run a person starts during a part** is refused at its start, in these same words:
// `admitAutomationStudioRuntimeSession` asks `../../runtime-session/page-held.ts` (the lease
// held, or a part run's session active) before it writes the run's session.
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioHostResourcePort } from "../../../../../runtime/automation-host/index.ts";
import { AutomationStudioHostLeaseScope, automationStudioProjectHostLeaseScope } from "../../../../../runtime/project-agents/index.ts";
import type { AutomationStudioPartCaller } from "../../../../../runtime/project-parts/index.ts";
import { admitAutomationStudioRuntimeSession, AUTOMATION_STUDIO_PAGE_HELD_MESSAGE } from "../../runtime-session/index.ts";
import type { AutomationStudioProjectPartRunRefusal } from "./types.ts";

const PROJECT_PART_RUN_IN_PROGRESS: AutomationStudioProjectPartRunRefusal = { ok: false, code: "part.run_in_progress", message: AUTOMATION_STUDIO_PAGE_HELD_MESSAGE };
const PROJECT_PART_PAGE_UNCHECKED: AutomationStudioProjectPartRunRefusal = { ok: false, code: "parts.unavailable", message: "FluxIQ could not check whether another run is using this page, so this part was not run and nothing changed. Try again." };

/** How long a port is given to grant a lease nothing holds, past which it is not going to. */
const LEASE_ASK_MS = 1_000;
const NOT_GRANTED = new Error("part.lease_not_granted");
/** Nothing is started by the gate: see the header. */
const NOTHING_STARTED = Object.freeze({}) as AutomationStudioRuntimeSession;

/** What a part run reads of who else is running. */
export type AutomationStudioProjectPartDrivingPorts = {
  /** The in-flight admissions of `admitAutomationStudioRuntimeSession`. */
  admissions: Set<string>;
  listRuntimeSessions(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
};

/** Runs `work` holding the host, or answers that another run does. */
export async function projectPartWhileDriving<T>(input: {
  hostResources: AutomationStudioHostResourcePort | undefined;
  holder: string;
  ports: AutomationStudioProjectPartDrivingPorts;
  projectId: string;
  caller: AutomationStudioPartCaller;
  work(): Promise<T>;
}): Promise<T | AutomationStudioProjectPartRunRefusal> {
  const guarded = async (): Promise<T | AutomationStudioProjectPartRunRefusal> => (await sessionsRefusal(input.ports, input.projectId, input.caller)) ?? await input.work();
  if (!input.hostResources || (input.caller === "build" && AutomationStudioHostLeaseScope.current())) return await guarded();
  const scope = automationStudioProjectHostLeaseScope(input.hostResources);
  const { held, waiting } = scope.scheduler.snapshot();
  if (held.length >= scope.scheduler.capacity || waiting.length > 0) return PROJECT_PART_RUN_IN_PROGRESS;
  // A port may hold back a grant with nothing held: no browser paired, or two it will not choose between.
  // That is not another run, and the guard's read of the page then decides, so the part goes on as it would with no lease to take.
  const asking = new AbortController();
  const timer = setTimeout(() => asking.abort(NOT_GRANTED), LEASE_ASK_MS);
  try {
    return await scope.run({ role: "part-run", briefId: input.holder }, async () => {
      clearTimeout(timer);
      return await guarded();
    }, { signal: asking.signal });
  } catch (error) {
    if (error === NOT_GRANTED) return await guarded();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Why the project's sessions keep this part from the page, or null when they leave it free. */
async function sessionsRefusal(ports: AutomationStudioProjectPartDrivingPorts, projectId: string, caller: AutomationStudioPartCaller): Promise<AutomationStudioProjectPartRunRefusal | null> {
  let listed: AutomationStudioRuntimeSession[];
  try {
    listed = await ports.listRuntimeSessions(projectId);
  } catch (error) {
    console.error(`A part was refused because project ${projectId}'s runs could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return PROJECT_PART_PAGE_UNCHECKED;
  }
  try {
    await admitAutomationStudioRuntimeSession({
      admissions: ports.admissions,
      listRuntimeSessions: async () => listed.filter((session) => caller === "person" || !underABuildsLease(session)).map(countsAsAdmitted),
      startRuntimeSession: async () => NOTHING_STARTED
    }, projectId, true);
    return null;
  } catch {
    return PROJECT_PART_RUN_IN_PROGRESS;
  }
}

/** The gate reads only adaptive sessions, by this mark; here every active one counts (header). */
function countsAsAdmitted(session: AutomationStudioRuntimeSession): AutomationStudioRuntimeSession {
  return { ...session, metadata: { ...session.metadata, adaptiveRuntime: true } };
}

function underABuildsLease(session: AutomationStudioRuntimeSession): boolean {
  const metadata = session.metadata ?? {};
  const partRun = metadata.partRun;
  const byBuild = typeof partRun === "object" && partRun !== null && !Array.isArray(partRun) && partRun.caller === "build";
  return byBuild || metadata.subflowTrial !== undefined || metadata.candidateTrial !== undefined || metadata.explorationAttempt !== undefined;
}
