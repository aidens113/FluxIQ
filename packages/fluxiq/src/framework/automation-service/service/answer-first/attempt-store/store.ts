// What an attempt left, beside the Flow (t861, plan D8, D11): the attempts at this Flow's
// task, oldest first, each with its result, the steps it wrote where they could not be
// assembled into a draft, and what it tried. The Answer lane reads it through
// `get`, `latest` and `list`, and needs nothing of `service.ts`.
//
// **Strict on read.** Each record goes back through the contract's own parser, as anything
// a client is told must. A file that is there and does not read says so
// (`AutomationStudioAnswerFirstAttemptsUnreadable`), since reading it as absent would show a
// person's result as never having happened. A new attempt's save replaces a file nobody can
// read, keeping it aside as `.unreadable`: the attempt it is saving must not be lost to one
// that already is.
//
// **With no data root it lives in memory for this service**, as the act record's store does.
// A write is one at a time per Flow, so an ending and a person's add-budget cannot lose
// each other's record.

import { rename } from "node:fs/promises";
import path from "node:path";
import { parseAutomationStudioTaskAttempt, parseAutomationStudioTaskResult, parseAutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioAnswerFirstAttemptRecord } from "./record.ts";
import { AutomationStudioAnswerFirstAttemptsUnreadable } from "./unreadable.ts";

const STORE_FILE = "answer-attempts.json";
const KIND = "answer_first_attempts";
/** The most attempts kept per Flow: a task repeated for years stays one file. */
const KEPT_ATTEMPTS = 100;

type Stored = { kind: typeof KIND; schemaVersion: 1; projectId: string; flowId: string; attempts: AutomationStudioAnswerFirstAttemptRecord[] };

export class AutomationStudioAnswerFirstAttemptStore {
  private readonly memory = new Map<string, Stored>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly paths: Pick<AutomationStudioProjectPaths, "root">, private readonly flows: Pick<AutomationStudioFlowPaths, "flowDirectory">, private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">) {}

  /** Every attempt kept for this Flow, oldest first. Throws `AutomationStudioAnswerFirstAttemptsUnreadable` where a file is there and cannot be read. */
  async list(projectId: string, flowId: string): Promise<AutomationStudioAnswerFirstAttemptRecord[]> {
    return structuredClone((await this.read(projectId, flowId))?.attempts ?? []);
  }

  /** One attempt by its id, or none. */
  async get(projectId: string, flowId: string, attemptId: string): Promise<AutomationStudioAnswerFirstAttemptRecord | undefined> {
    return (await this.list(projectId, flowId)).find((record) => record.attempt.attemptId === attemptId);
  }

  /** The Flow's latest attempt, or none. */
  async latest(projectId: string, flowId: string): Promise<AutomationStudioAnswerFirstAttemptRecord | undefined> {
    return (await this.list(projectId, flowId)).at(-1);
  }

  /** Writes this attempt, in its place if it is there already and at the end if not. */
  async save(projectId: string, flowId: string, record: AutomationStudioAnswerFirstAttemptRecord): Promise<void> {
    await this.queued(projectId, flowId, async () => {
      const attempts = (await this.readOrSetAside(projectId, flowId))?.attempts ?? [];
      const at = attempts.findIndex((each) => each.attempt.attemptId === record.attempt.attemptId);
      if (at >= 0) attempts[at] = structuredClone(record);
      else attempts.push(structuredClone(record));
      await this.write({ kind: KIND, schemaVersion: 1, projectId, flowId, attempts: attempts.slice(-KEPT_ATTEMPTS) });
    });
  }

  /**
   * Takes back a row whose attempt never started: a setup step found before any model call, where
   * nothing was tried, so no attempt happened and none may be left showing as working.
   */
  async remove(projectId: string, flowId: string, attemptId: string): Promise<void> {
    await this.queued(projectId, flowId, async () => {
      const stored = await this.read(projectId, flowId);
      if (!stored?.attempts.some((each) => each.attempt.attemptId === attemptId)) return;
      await this.write({ ...stored, attempts: stored.attempts.filter((each) => each.attempt.attemptId !== attemptId) });
    });
  }

  private async read(projectId: string, flowId: string): Promise<Stored | undefined> {
    if (!this.paths.root) return this.memory.get(JSON.stringify([projectId, flowId]));
    let value: JsonObject;
    try {
      value = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    } catch (error) {
      throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId, error);
    }
    if (Object.keys(value).length === 0) return undefined;
    const stored = readStored(value, projectId, flowId);
    if (!stored) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
    return stored;
  }

  /** What a save builds on: a file nobody can read is moved aside rather than lost, or left to lose the attempt being saved (header). */
  private async readOrSetAside(projectId: string, flowId: string): Promise<Stored | undefined> {
    try {
      return await this.read(projectId, flowId);
    } catch (error) {
      if (!(error instanceof AutomationStudioAnswerFirstAttemptsUnreadable)) throw error;
      await rename(this.file(projectId, flowId), `${this.file(projectId, flowId)}.unreadable`);
      return undefined;
    }
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

  private file(projectId: string, flowId: string): string {
    return path.join(this.flows.flowDirectory(projectId, flowId), STORE_FILE);
  }
}

function readStored(value: JsonObject, projectId: string, flowId: string): Stored | undefined {
  if (value.kind !== KIND || value.schemaVersion !== 1 || value.projectId !== projectId || value.flowId !== flowId || !Array.isArray(value.attempts)) return undefined;
  const attempts: AutomationStudioAnswerFirstAttemptRecord[] = [];
  for (const each of value.attempts as unknown[]) {
    const read = readRecord(each);
    if (!read) return undefined;
    attempts.push(read);
  }
  return { kind: KIND, schemaVersion: 1, projectId, flowId, attempts };
}

function readRecord(value: unknown): AutomationStudioAnswerFirstAttemptRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const held = value as { attempt?: unknown; result?: unknown; tried?: unknown; steps?: unknown; candidateId?: unknown };
  const attempt = parseAutomationStudioTaskAttempt(held.attempt);
  if (!attempt.ok) return undefined;
  const tried = parseAutomationStudioTriedRecord(held.tried);
  if (!tried.ok) return undefined;
  const result = held.result === undefined ? undefined : parseAutomationStudioTaskResult(held.result);
  if (result && !result.ok) return undefined;
  if (held.steps !== undefined && !stepsRead(held.steps)) return undefined;
  if (held.candidateId !== undefined && typeof held.candidateId !== "string") return undefined;
  return {
    attempt: attempt.attempt,
    tried: tried.record,
    ...(result?.ok ? { result: result.result } : {}),
    ...(held.steps !== undefined ? { steps: held.steps as AutomationStudioAnswerFirstAttemptRecord["steps"] & object } : {}),
    ...(typeof held.candidateId === "string" ? { candidateId: held.candidateId } : {})
  };
}

/** Whether a list reads as a draft's steps: each one what the loop's seed needs of it. */
function stepsRead(value: unknown): boolean {
  return Array.isArray(value) && value.every((step: unknown) => {
    const held = step as { position?: unknown; actionId?: unknown; effect?: unknown; input?: unknown } | null;
    return typeof held === "object" && held !== null && Number.isSafeInteger(held.position) && typeof held.actionId === "string" && (held.effect === "observe" || held.effect === "mutate") && typeof held.input === "object";
  });
}
