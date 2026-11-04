// The latest act record per Flow, beside the Flow (t861; plan D6).
//
// **Why it outlives the attempt.** An attempt presses things, and the first real run of
// its Flow then starts from the top. The person asked once. So the record stays with the
// Flow until one run has carried it.
//
// **Consumed once (`forRun`).** The first run after the attempt takes every act that
// happened and is not yet carried, and those acts are marked carried under that run,
// before it starts, so a second run started at once finds nothing. A later deliberate run
// acts normally: a person asking again means it. A new landing of the same act is a new
// thing to carry, told by its time.
//
// **A run that ended without success carried nothing.** A first run that stopped at a
// step before the act, or was cancelled, did not finish the one thing the person asked,
// and running it again is that same ask rather than a new one: giving it up there would
// press on the second try what the attempt already pressed. So what such a run took goes
// back. A run still going keeps what it took, and only a run that reads success spends it.
//
// **Reading is not writing.** With no record there is no file, and a run costs one read:
// the options a run gets are then exactly what they always were. With no data root the
// record lives in memory for this service.
//
// **A record it cannot read refuses one run.** It may hold exactly what must not be done
// again, so reading it as absent is the one wrong answer. The run does not start and says
// why; the file is moved aside, so the person who runs it again has been told, and that
// run goes ahead, as a later deliberate run always does.

import { rename } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { parseAutomationStudioAttemptActRecordData, type AutomationStudioAttemptActEntry, type AutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstRunActsUnreadable } from "./unreadable.ts";

const STORE_FILE = "attempt-acts.json";
/** How a run ends without having done what was asked (`../../runtime-session/terminal-status.ts` names the rest). */
const ENDED_WITHOUT_SUCCESS: ReadonlySet<string> = new Set(["failed", "cancelled", "interrupted"]);
const KIND = "attempt_run_acts";

/** One landing carried into one run. */
type Carried = { act: string; at: number; runId: string };

/** What sits beside the Flow. */
type Stored = { kind: typeof KIND; schemaVersion: 1; projectId: string; flowId: string; record: AutomationStudioAttemptActRecordData; carried: Carried[] };

export class AutomationStudioAnswerFirstRunActStore {
  private readonly memory = new Map<string, Stored>();
  /** Per Flow, the work under way here: one take or save at a time, so two runs never both take an act. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly paths: Pick<AutomationStudioProjectPaths, "root">, private readonly flows: Pick<AutomationStudioFlowPaths, "flowDirectory">, private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">) {}

  /** The record as it stands, or none. Throws `AutomationStudioAnswerFirstRunActsUnreadable` where one is there and cannot be read. */
  async get(projectId: string, flowId: string): Promise<AutomationStudioAttemptActRecordData | undefined> {
    return structuredClone((await this.stored(projectId, flowId))?.record);
  }

  /** Replaces the Flow's record, keeping which of its landings a run already carried. */
  async save(projectId: string, flowId: string, record: AutomationStudioAttemptActRecordData): Promise<void> {
    await this.queued(projectId, flowId, async () => {
      const landed = new Set(record.acts.map(landingOf));
      // A new attempt's record replaces one nobody can read, which has nothing to keep.
      const carried = ((await this.read(projectId, flowId)).stored?.carried ?? []).filter((item) => landed.has(`${item.act}@${item.at}`));
      await this.write({ kind: KIND, schemaVersion: 1, projectId, flowId, record, carried });
    });
  }

  /**
   * What a run starting now must not do again, taken once (header); none where nothing is left to carry. A run asking
   * again by its own id is given the same. `runStatus` reads an earlier run's status, none where it has no session:
   * absent, or with no session to read, what that run took stays taken.
   */
  async forRun(projectId: string, flowId: string, runId: string, runStatus?: (runId: string) => Promise<string | undefined>): Promise<AutomationStudioAttemptActRecordData | undefined> {
    return await this.queued(projectId, flowId, async () => {
      const held = await this.storedForRun(projectId, flowId);
      if (!held) return undefined;
      const kept = await this.stillCarried(held.carried, runId, runStatus);
      const others = new Set(kept.filter((carried) => carried.runId !== runId).map((carried) => `${carried.act}@${carried.at}`));
      const taken = held.record.acts.filter((act) => stands(act) && !others.has(landingOf(act)));
      const already = new Set(kept.map((carried) => `${carried.act}@${carried.at}`));
      const fresh = taken.filter((act) => !already.has(landingOf(act))).map((act) => ({ act: act.id, at: act.at, runId }));
      // A run that cannot say it took them does not start: a later run would take them again.
      if (fresh.length > 0 || kept.length !== held.carried.length) await this.write({ ...held, carried: [...kept, ...fresh] });
      return taken.length > 0 ? structuredClone({ ...held.record, acts: taken }) : undefined;
    });
  }

  /** What stays taken: all but what an earlier run took that ended without success (header). */
  private async stillCarried(carried: readonly Carried[], runId: string, runStatus: ((runId: string) => Promise<string | undefined>) | undefined): Promise<Carried[]> {
    if (!runStatus) return [...carried];
    const ended = new Map<string, boolean>();
    for (const other of new Set(carried.map((item) => item.runId))) if (other !== runId) ended.set(other, ENDED_WITHOUT_SUCCESS.has((await runStatus(other)) ?? ""));
    return carried.filter((item) => !ended.get(item.runId));
  }

  private async stored(projectId: string, flowId: string): Promise<Stored | undefined> {
    const read = await this.read(projectId, flowId);
    if (read.unreadable) throw read.unreadable;
    return read.stored;
  }

  /** What is there, or that something is and cannot be read (header). */
  private async read(projectId: string, flowId: string): Promise<{ stored?: Stored; unreadable?: AutomationStudioAnswerFirstRunActsUnreadable }> {
    if (!this.paths.root) {
      const held = this.memory.get(JSON.stringify([projectId, flowId]));
      return held ? { stored: held } : {};
    }
    let value: JsonObject;
    try {
      value = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    } catch (error) {
      return { unreadable: new AutomationStudioAnswerFirstRunActsUnreadable(flowId, error) };
    }
    if (Object.keys(value).length === 0) return {};
    const stored = readStored(value, projectId, flowId);
    return stored ? { stored } : { unreadable: new AutomationStudioAnswerFirstRunActsUnreadable(flowId) };
  }

  /** What a run reads: a record it cannot read is moved aside and refuses this one run (header). */
  private async storedForRun(projectId: string, flowId: string): Promise<Stored | undefined> {
    const read = await this.read(projectId, flowId);
    if (!read.unreadable) return read.stored;
    await rename(this.file(projectId, flowId), `${this.file(projectId, flowId)}.unreadable`);
    throw read.unreadable;
  }

  private async write(stored: Stored): Promise<void> {
    if (!this.paths.root) {
      this.memory.set(JSON.stringify([stored.projectId, stored.flowId]), structuredClone(stored));
      return;
    }
    await this.projects.ensureProjectStructure(stored.projectId);
    await new ProgramJsonStore<JsonObject>(this.file(stored.projectId, stored.flowId), () => ({})).write(stored as unknown as JsonObject);
  }

  private async queued<T>(projectId: string, flowId: string, work: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([projectId, flowId]);
    const running = (this.queues.get(key) ?? Promise.resolve()).then(work, work);
    this.queues.set(key, running.then(() => undefined, () => undefined));
    return await running;
  }

  private file(projectId: string, flowId: string): string { return path.join(this.flows.flowDirectory(projectId, flowId), STORE_FILE); }
}

/** An act that happened or may have, and that a refusal may rest on. */
function stands(act: AutomationStudioAttemptActEntry): boolean {
  return !act.undeclared && (act.state === "landed" || act.state === "may_have_landed");
}

function landingOf(act: AutomationStudioAttemptActEntry): string {
  return `${act.id}@${act.at}`;
}

function readStored(value: JsonObject, projectId: string, flowId: string): Stored | undefined {
  if (value.kind !== KIND || value.schemaVersion !== 1 || value.projectId !== projectId || value.flowId !== flowId || !Array.isArray(value.carried)) return undefined;
  const carried = value.carried as unknown[];
  if (!carried.every((item) => typeof item === "object" && item !== null && typeof (item as Carried).act === "string" && typeof (item as Carried).at === "number" && typeof (item as Carried).runId === "string")) return undefined;
  const record = parseAutomationStudioAttemptActRecordData(value.record);
  return record.ok ? { kind: KIND, schemaVersion: 1, projectId, flowId, record: record.data, carried: carried as Carried[] } : undefined;
}
