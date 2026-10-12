import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";

// A run left `running` by a process that is gone (state-aware recovery plan,
// R5 sweep and C8).
//
// A run's session is written `running` before its Flow executes, and its
// outcome only when the run ends. When the process running it dies -- a crash,
// a kill, a host restart -- the session stays `running` for ever: it counts as
// active, holds the project's next adaptive run off, and tells a reader the run
// is still working. Nothing will ever end it, because nothing is running it.
//
// So the first time this service reads a project's runs, it ends every such
// run as interrupted, with its last lasting act `unknown` on the session and on
// the run detail: the run may have pressed something whose answer never came,
// and that is never read as "did not happen".
//
// A run left `queued` is swept the same way, under the same clearance. It is
// written `queued` before anything of it runs and `running` before its Flow
// executes, so it never acted, and its lasting act is `none`. Left alone it
// would count as active for ever and hold the project's next adaptive run off
// (`./admission.ts`).
//
// **Restart clearance is the process, never this service's own bookkeeping.**
// A run is swept only when it started before this process did. A run this
// process started is never swept, even when it looks abandoned -- a run whose
// executor threw is ended by `./ending.ts`, in the process that saw it throw --
// because the same process having consumed or lost track of something is not
// evidence that the process running it ended. On top of that, a run a live
// executor of this service owns is never touched, whenever it started (a
// parked run resumed here keeps its first start time).
//
// **What it is marked.** `interrupted`: neither a failure the run reported
// nor a success, and terminal (`./terminal-status.ts`), so a reader that ends,
// lists, repairs, reruns or promotes runs never takes it for either. The
// session and the run detail also say why in `metadata.interruption`.

/** The status an interrupted run ends with. */
export const AUTOMATION_STUDIO_INTERRUPTED_RUN_STATUS = "interrupted" satisfies AutomationStudioRuntimeSession["status"];

/** Where an interrupted run says so, on its session's metadata and its run detail's. */
export const AUTOMATION_STUDIO_RUN_INTERRUPTION_METADATA_KEY = "interruption";

/** The record of an interruption: closed fields only, no page data. */
export type AutomationStudioRunInterruption = {
  state: "interrupted";
  reason: "process_ended";
  at: number;
  /** The status the run was left in. */
  sessionStatus: "running" | "queued";
  /**
   * Whether the run's last lasting act took effect: never known for a run
   * left `running`; `none` for one left `queued`, which never acted.
   */
  lastingAct: "unknown" | "none";
  /** The node the run was at, when its trace says. */
  lastNodeId?: string;
};

/**
 * When this process started, in epoch milliseconds: the line between a run an
 * earlier process left and a run this one began.
 */
export const AUTOMATION_STUDIO_PROCESS_STARTED_AT = Math.floor(performance.timeOrigin);

/** The run sessions as the parked-run expiry reads and writes them; the sweep runs inside its reads. */
export type AutomationStudioRunSessionPorts = {
  read(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  list(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
  write(projectId: string, session: AutomationStudioRuntimeSession): Promise<void>;
};

export type AutomationStudioOrphanedRunSweepPorts = AutomationStudioRunSessionPorts & {
  /** Merged onto the stored detail, so only the interruption is added. */
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  /** Whether an executor of this service is running this run now. */
  runsLive(projectId: string, runId: string): boolean;
  now?: () => number;
  /** This process's start; a test sets it. */
  processStartedAt?: number;
};

const INTERRUPTED_MESSAGE = "The run was interrupted: the process running it ended before the run finished. Whether its last lasting act took effect is unknown.";
const INTERRUPTED_QUEUED_MESSAGE = "The run was interrupted before it started: the process that queued it ended. It took no action.";

export class AutomationStudioOrphanedRunSweep {
  private readonly swept = new Map<string, Promise<void>>();
  private failure: unknown;

  constructor(private readonly ports: AutomationStudioOrphanedRunSweepPorts) {}

  /** The session ports with the sweep in front: a project's sessions are read only once its orphans are ended. */
  get sessionPorts(): AutomationStudioRunSessionPorts {
    return {
      read: async (projectId, runId) => {
        await this.sweep(projectId);
        return await this.ports.read(projectId, runId);
      },
      list: async (projectId) => {
        await this.sweep(projectId);
        return await this.ports.list(projectId);
      },
      write: async (projectId, session) => await this.ports.write(projectId, session)
    };
  }

  /**
   * Ends the project's orphaned runs, once per project for the life of this
   * service. A sweep that fails is tried again on the next read; the read
   * itself goes on, since the session is only left as it already was.
   */
  sweep(projectId: string): Promise<void> {
    const running = this.swept.get(projectId);
    if (running) return running;
    const sweeping = this.sweepProject(projectId).catch((error: unknown) => {
      // The orphan stays `running`, as it was; the next read of the project tries again.
      this.failure = error;
      this.swept.delete(projectId);
    });
    this.swept.set(projectId, sweeping);
    return sweeping;
  }

  /** Why the last sweep that failed did, for a reader diagnosing a run still shown `running`. */
  get lastFailure(): unknown {
    return this.failure;
  }

  private async sweepProject(projectId: string): Promise<void> {
    const startedAt = this.ports.processStartedAt ?? AUTOMATION_STUDIO_PROCESS_STARTED_AT;
    for (const session of await this.ports.list(projectId)) {
      const leftAs = session.status;
      if (leftAs !== "running" && leftAs !== "queued") continue;
      if ((session.startedAt ?? session.queuedAt) >= startedAt) continue;
      if (this.ports.runsLive(projectId, session.runId)) continue;
      await this.interrupt(projectId, session, leftAs);
    }
  }

  private async interrupt(projectId: string, session: AutomationStudioRuntimeSession, leftAs: "running" | "queued"): Promise<void> {
    const at = (this.ports.now ?? Date.now)();
    const queued = leftAs === "queued";
    const lastNodeId = session.trace?.currentNodeId ?? session.trace?.attempts?.at(-1)?.nodeId;
    const interruption: AutomationStudioRunInterruption = {
      state: "interrupted",
      reason: "process_ended",
      at,
      sessionStatus: leftAs,
      lastingAct: queued ? "none" : "unknown",
      ...(lastNodeId ? { lastNodeId } : {})
    };
    const interrupted: AutomationStudioRuntimeSession = {
      ...session,
      status: AUTOMATION_STUDIO_INTERRUPTED_RUN_STATUS,
      finishedAt: at,
      trace: {
        attempts: [],
        values: {},
        effects: [],
        ...session.trace,
        status: "failed",
        startedAt: session.trace?.startedAt ?? session.startedAt ?? session.queuedAt,
        finishedAt: at,
        message: queued ? INTERRUPTED_QUEUED_MESSAGE : INTERRUPTED_MESSAGE
      },
      metadata: { ...(session.metadata ?? {}), [AUTOMATION_STUDIO_RUN_INTERRUPTION_METADATA_KEY]: interruption }
    };
    await this.ports.write(projectId, interrupted);
    const detail = runtimeSessionToFlowRunDetail(interrupted, projectId);
    await this.ports.saveFlowRunDetail({ ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_RUN_INTERRUPTION_METADATA_KEY]: interruption } });
  }
}
