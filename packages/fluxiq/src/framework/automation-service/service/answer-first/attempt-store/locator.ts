// Where a project's attempts are (t869): an attempt's Flow, and the Flows a chat thread's attempts
// are on. The attempts themselves stay per Flow (`./store.ts`), and a person asks by thread or by
// attempt, so this is what joins the two.
//
// **An attempt is noted when it is saved, a thread when the command starts one**, before the
// attempt runs, so a thread lists its attempt from the attempt's first saved row.
//
// **A thread holds a Flow from when it was noted until another thread takes that Flow.** A saved
// Flow can be picked up from a new thread, and a Flow runs one attempt at a time, so that is enough
// to tell the card in one thread from the card in the other.
//
// **Strict on read, and a save mends it**, as `./store.ts` is: a file that is there and does not
// read says so, and the next write keeps it aside as `.unreadable` and starts again, because the
// attempt being noted must not be lost to a file nobody can read. The attempts it named stay
// readable by Flow. With no data root it lives in memory for this service.

import { rename } from "node:fs/promises";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstAttemptLocatorUnreadable } from "./locator-unreadable.ts";

const KIND = "answer_first_attempt_locator";
/** The most entries of each kind kept per project, oldest dropped: an attempt that old is still readable by Flow. */
const KEPT = 5_000;

type AttemptSpot = { attemptId: string; flowId: string };
type ThreadFlow = { conversationId: string; flowId: string; sinceMs: number };
type Stored = { kind: typeof KIND; schemaVersion: 1; projectId: string; attempts: AttemptSpot[]; threads: ThreadFlow[] };

/** A Flow a thread holds, the time it held it from and, where another thread took it, until. */
export type AutomationStudioAnswerFirstThreadFlow = { flowId: string; sinceMs: number; untilMs?: number };

export class AutomationStudioAnswerFirstAttemptLocator {
  private readonly memory = new Map<string, Stored>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly noted = new Set<string>();

  constructor(private readonly paths: Pick<AutomationStudioProjectPaths, "root">, private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">) {}

  /** The Flow an attempt is on, or none. Throws `AutomationStudioAnswerFirstAttemptLocatorUnreadable` where the file is there and cannot be read. */
  async flowOfAttempt(projectId: string, attemptId: string): Promise<string | undefined> {
    return (await this.read(projectId))?.attempts.find((spot) => spot.attemptId === attemptId)?.flowId;
  }

  /** The Flows a thread holds, oldest first. Throws as `flowOfAttempt` does. */
  async flowsOfConversation(projectId: string, conversationId: string): Promise<AutomationStudioAnswerFirstThreadFlow[]> {
    const threads = (await this.read(projectId))?.threads ?? [];
    const held: AutomationStudioAnswerFirstThreadFlow[] = [];
    threads.forEach((thread, at) => {
      if (thread.conversationId !== conversationId) return;
      const taken = threads.slice(at + 1).find((later) => later.flowId === thread.flowId && later.conversationId !== conversationId);
      const flow: AutomationStudioAnswerFirstThreadFlow = { flowId: thread.flowId, sinceMs: thread.sinceMs };
      if (taken) flow.untilMs = taken.sinceMs;
      held.push(flow);
    });
    return held;
  }

  /** The thread that holds a Flow now (the latest to note it), or none. Throws as `flowOfAttempt` does. */
  async conversationOfFlow(projectId: string, flowId: string): Promise<string | undefined> {
    return (await this.read(projectId))?.threads.filter((thread) => thread.flowId === flowId).at(-1)?.conversationId;
  }

  /** Notes which Flow an attempt is on. It writes once per attempt: an attempt's row is saved many times. */
  async noteAttempt(projectId: string, attemptId: string, flowId: string): Promise<void> {
    const key = JSON.stringify([projectId, attemptId]);
    if (this.noted.has(key)) return;
    await this.changed(projectId, (stored) => {
      if (stored.attempts.some((spot) => spot.attemptId === attemptId)) return false;
      stored.attempts.push({ attemptId, flowId });
      return true;
    });
    this.noted.add(key);
  }

  /** Notes that this thread holds this Flow from now, unless it already does. */
  async noteConversation(projectId: string, conversationId: string, flowId: string): Promise<void> {
    await this.changed(projectId, (stored) => {
      if (stored.threads.filter((thread) => thread.flowId === flowId).at(-1)?.conversationId === conversationId) return false;
      stored.threads.push({ conversationId, flowId, sinceMs: Date.now() });
      return true;
    });
  }

  private async changed(projectId: string, change: (stored: Stored) => boolean): Promise<void> {
    const work = () => this.applied(projectId, change);
    const running = (this.queues.get(projectId) ?? Promise.resolve()).then(work, work);
    this.queues.set(projectId, running.then(() => undefined, () => undefined));
    await running;
  }

  private async applied(projectId: string, change: (stored: Stored) => boolean): Promise<void> {
    const stored: Stored = (await this.readOrSetAside(projectId)) ?? { kind: KIND, schemaVersion: 1, projectId, attempts: [], threads: [] };
    if (!change(stored)) return;
    await this.write({ ...stored, attempts: stored.attempts.slice(-KEPT), threads: stored.threads.slice(-KEPT) });
  }

  private async read(projectId: string): Promise<Stored | undefined> {
    if (!this.paths.root) return structuredClone(this.memory.get(projectId));
    let value: JsonObject;
    try {
      value = await new ProgramJsonStore<JsonObject>(this.file(projectId), () => ({})).read();
    } catch (error) {
      throw new AutomationStudioAnswerFirstAttemptLocatorUnreadable(projectId, error);
    }
    if (Object.keys(value).length === 0) return undefined;
    const stored = readStored(value, projectId);
    if (!stored) throw new AutomationStudioAnswerFirstAttemptLocatorUnreadable(projectId);
    return stored;
  }

  private async readOrSetAside(projectId: string): Promise<Stored | undefined> {
    try {
      return await this.read(projectId);
    } catch (error) {
      if (!(error instanceof AutomationStudioAnswerFirstAttemptLocatorUnreadable)) throw error;
      await rename(this.file(projectId), `${this.file(projectId)}.unreadable`);
      this.noted.clear();
      return undefined;
    }
  }

  private async write(stored: Stored): Promise<void> {
    if (!this.paths.root) {
      this.memory.set(stored.projectId, structuredClone(stored));
      return;
    }
    await this.projects.ensureProjectStructure(stored.projectId);
    await new ProgramJsonStore<JsonObject>(this.file(stored.projectId), () => ({})).write(stored as unknown as JsonObject);
  }

  private file(projectId: string): string {
    return new AutomationStudioProjectPaths(this.paths.root).projectFile(projectId, "indexes", "answer-attempts.json");
  }
}

function readStored(value: JsonObject, projectId: string): Stored | undefined {
  if (value.kind !== KIND || value.schemaVersion !== 1 || value.projectId !== projectId) return undefined;
  const attempts: unknown = value.attempts;
  const threads: unknown = value.threads;
  if (!Array.isArray(attempts) || !attempts.every(isAttemptSpot) || !Array.isArray(threads) || !threads.every(isThreadFlow)) return undefined;
  return { kind: KIND, schemaVersion: 1, projectId, attempts, threads };
}

function isAttemptSpot(value: unknown): value is AttemptSpot {
  const held = value as Partial<AttemptSpot> | null;
  return typeof held === "object" && held !== null && typeof held.attemptId === "string" && typeof held.flowId === "string";
}

function isThreadFlow(value: unknown): value is ThreadFlow {
  const held = value as Partial<ThreadFlow> | null;
  return typeof held === "object" && held !== null && typeof held.conversationId === "string" && typeof held.flowId === "string" && Number.isFinite(held.sinceMs);
}
