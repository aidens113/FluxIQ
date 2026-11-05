// What a task remembers between attempts (t870, design D11): one file per task under the
// project's directory, and one small index there that says which task and Flow an attempt
// belongs to (a client's query holds only a project and an attempt).
//
// **A file it cannot read is moved aside and read as nothing**, because a task must not stop for
// it: the next write keeps the old file as `.unreadable` and starts again. **Writes go one at a
// time per task** (and per project for the index), so two endings lose nothing of each other.
// **Notes are screened when written**, each at most 600 characters, a note with nothing left
// dropped. Notes keep the last 10, attempts the last 100. With no data root it lives in memory.

import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { parseAutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import { safeSegment, ProgramJsonStore, ProgramStateReadError } from "../../../../persistence/program-state/storage.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioAnswerFirstAttemptProvenance } from "./provenance.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "./memory.ts";
import { automationStudioAnswerFirstScreenedNote } from "./screened-note.ts";
import type { AutomationStudioAnswerFirstTaskNote } from "./task-note.ts";

const KEPT_NOTES = 10;
const KEPT_ATTEMPTS = 100;
const KEPT_INDEX = 2000;
const KEPT_FLOW_BASES = 20;
const FOLDER = "task-memory";
const INDEX_FILE = "attempt-index.json";

type Index = { kind: "answer_first_attempt_index"; schemaVersion: 1; projectId: string; attempts: { attemptId: string; taskId: string; flowId: string }[] };
type Held = { kind: "answer_first_task_memory"; schemaVersion: 1; projectId: string; memory: AutomationStudioAnswerFirstTaskMemory };

export class AutomationStudioAnswerFirstTaskMemoryStore {
  private readonly memory = new Map<string, Held>();
  private readonly indexes = new Map<string, Index>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly paths: Pick<AutomationStudioProjectPaths, "root" | "projectFile">, private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">) {}

  /** What the task kept, or none (also where its file cannot be read). */
  async get(projectId: string, taskId: string): Promise<AutomationStudioAnswerFirstTaskMemory | undefined> {
    return structuredClone((await this.readTask(projectId, taskId))?.memory);
  }

  /** Changes the task's memory one write at a time. `change` gets the memory (an empty one for a new task) and answers the whole new memory. */
  async update(projectId: string, taskId: string, change: (current: AutomationStudioAnswerFirstTaskMemory) => AutomationStudioAnswerFirstTaskMemory): Promise<AutomationStudioAnswerFirstTaskMemory> {
    const kept = await this.queued(JSON.stringify([projectId, taskId]), async () => {
      const current = (await this.readTaskOrSetAside(projectId, taskId))?.memory ?? { taskId, flowId: "", notes: [], attempts: [] };
      const next = tidy(change(structuredClone(current)), taskId);
      await this.writeTask({ kind: "answer_first_task_memory", schemaVersion: 1, projectId, memory: next });
      return next;
    });
    await this.queued(JSON.stringify([projectId]), async () => {
      const index = (await this.readIndexOrSetAside(projectId)) ?? { kind: "answer_first_attempt_index", schemaVersion: 1, projectId, attempts: [] };
      for (const attempt of kept.attempts) {
        const at = index.attempts.findIndex((each) => each.attemptId === attempt.attemptId);
        const entry = { attemptId: attempt.attemptId, taskId, flowId: attempt.flowId };
        if (at >= 0) index.attempts[at] = entry;
        else index.attempts.push(entry);
      }
      index.attempts = index.attempts.slice(-KEPT_INDEX);
      await this.writeIndex(index);
    });
    return structuredClone(kept);
  }

  /** Every task the project holds memory of, by what is on disk (or in memory with no data root). One that cannot be read is left out. */
  async list(projectId: string): Promise<AutomationStudioAnswerFirstTaskMemory[]> {
    if (!this.paths.root) return [...this.memory.values()].filter((held) => held.projectId === projectId).map((held) => structuredClone(held.memory));
    const folder = path.dirname(this.indexFile(projectId));
    let names: string[];
    try {
      names = await readdir(folder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const found: AutomationStudioAnswerFirstTaskMemory[] = [];
    for (const name of names.filter((each) => each.endsWith(".json") && each !== INDEX_FILE).sort()) {
      const value = await this.readFile(path.join(folder, name));
      const taskId = (value?.memory as { taskId?: unknown } | undefined)?.taskId;
      const held = value && typeof taskId === "string" ? readHeld(value, projectId, taskId) : undefined;
      if (held) found.push(held.memory);
    }
    return found;
  }

  /**
   * Forgets one task's memory entry and the index lines that name its attempts, and nothing else: the attempts
   * stay in their Flow's rows, so a thread still tells them, and no Flow, saved part or result is touched.
   * Answers whether there was an entry.
   */
  async remove(projectId: string, taskId: string): Promise<boolean> {
    const existed = await this.queued(JSON.stringify([projectId, taskId]), async () => {
      const held = await this.readTask(projectId, taskId);
      if (this.paths.root) await rm(this.taskFile(projectId, taskId), { force: true });
      else this.memory.delete(JSON.stringify([projectId, taskId]));
      return held !== undefined;
    });
    await this.queued(JSON.stringify([projectId]), async () => {
      const index = await this.readIndexOrSetAside(projectId);
      if (!index) return;
      const kept = index.attempts.filter((attempt) => attempt.taskId !== taskId);
      if (kept.length !== index.attempts.length) await this.writeIndex({ ...index, attempts: kept });
    });
    return existed;
  }

  /** Which task and Flow an attempt belongs to, or none. */
  async attemptLocation(projectId: string, attemptId: string): Promise<{ taskId: string; flowId: string } | undefined> {
    const found = (await this.readIndex(projectId))?.attempts.find((each) => each.attemptId === attemptId);
    return found ? { taskId: found.taskId, flowId: found.flowId } : undefined;
  }

  /** How one attempt began and where its steps came from, or none. */
  async provenance(projectId: string, attemptId: string): Promise<AutomationStudioAnswerFirstAttemptProvenance | undefined> {
    const where = await this.attemptLocation(projectId, attemptId);
    if (!where) return undefined;
    return (await this.get(projectId, where.taskId))?.attempts.find((each) => each.attemptId === attemptId);
  }

  private taskFile(projectId: string, taskId: string): string {
    return this.paths.projectFile(projectId, FOLDER, `${safeSegment(taskId)}.json`);
  }

  private indexFile(projectId: string): string {
    return this.paths.projectFile(projectId, FOLDER, INDEX_FILE);
  }

  private async readTask(projectId: string, taskId: string): Promise<Held | undefined> {
    if (!this.paths.root) return this.memory.get(JSON.stringify([projectId, taskId]));
    const value = await this.readFile(this.taskFile(projectId, taskId));
    return value && readHeld(value, projectId, taskId);
  }

  private async readTaskOrSetAside(projectId: string, taskId: string): Promise<Held | undefined> {
    if (!this.paths.root) return this.memory.get(JSON.stringify([projectId, taskId]));
    return await this.orSetAside(this.taskFile(projectId, taskId), (value) => readHeld(value, projectId, taskId));
  }

  private async readIndex(projectId: string): Promise<Index | undefined> {
    if (!this.paths.root) return this.indexes.get(projectId);
    const value = await this.readFile(this.indexFile(projectId));
    return value && readIndexed(value, projectId);
  }

  private async readIndexOrSetAside(projectId: string): Promise<Index | undefined> {
    if (!this.paths.root) return this.indexes.get(projectId);
    return await this.orSetAside(this.indexFile(projectId), (value) => readIndexed(value, projectId));
  }

  /** The file's content, or none where it is absent or unreadable. */
  private async readFile(file: string): Promise<JsonObject | undefined> {
    try {
      const value = await new ProgramJsonStore<JsonObject>(file, () => ({})).read();
      return Object.keys(value).length ? value : undefined;
    } catch (error) {
      if (!(error instanceof ProgramStateReadError)) throw error;
      return undefined;
    }
  }

  private async orSetAside<T>(file: string, parse: (value: JsonObject) => T | undefined): Promise<T | undefined> {
    let value: JsonObject;
    try {
      value = await new ProgramJsonStore<JsonObject>(file, () => ({})).read();
    } catch (error) {
      if (!(error instanceof ProgramStateReadError)) throw error;
      await this.setAside(file);
      return undefined;
    }
    if (!Object.keys(value).length) return undefined;
    const read = parse(value);
    if (!read) await this.setAside(file);
    return read;
  }

  private async setAside(file: string): Promise<void> {
    try {
      await rename(file, `${file}.unreadable`);
    } catch {
      /* best-effort: nothing to move, or it cannot be moved, and the write that follows replaces it */
    }
  }

  private async writeTask(held: Held): Promise<void> {
    if (!this.paths.root) {
      this.memory.set(JSON.stringify([held.projectId, held.memory.taskId]), structuredClone(held));
      return;
    }
    await this.projects.ensureProjectStructure(held.projectId);
    await new ProgramJsonStore<JsonObject>(this.taskFile(held.projectId, held.memory.taskId), () => ({})).write(held as unknown as JsonObject);
  }

  private async writeIndex(index: Index): Promise<void> {
    if (!this.paths.root) {
      this.indexes.set(index.projectId, structuredClone(index));
      return;
    }
    await this.projects.ensureProjectStructure(index.projectId);
    await new ProgramJsonStore<JsonObject>(this.indexFile(index.projectId), () => ({})).write(index as unknown as JsonObject);
  }

  private async queued<T>(key: string, work: () => Promise<T>): Promise<T> {
    const running = (this.queues.get(key) ?? Promise.resolve()).then(work, work);
    this.queues.set(key, running.then(() => undefined, () => undefined));
    return await running;
  }
}

/** The caps, and the screen on every note. */
function tidy(memory: AutomationStudioAnswerFirstTaskMemory, taskId: string): AutomationStudioAnswerFirstTaskMemory {
  const notes: AutomationStudioAnswerFirstTaskNote[] = [];
  for (const note of memory.notes ?? []) {
    const words = automationStudioAnswerFirstScreenedNote(note);
    if (words) notes.push({ attemptId: note.attemptId, atMs: note.atMs, from: note.from, ...words });
  }
  return { ...memory, taskId, notes: notes.slice(-KEPT_NOTES), attempts: (memory.attempts ?? []).slice(-KEPT_ATTEMPTS), ...(memory.flowBases ? { flowBases: memory.flowBases.slice(-KEPT_FLOW_BASES) } : {}) };
}

function readHeld(value: JsonObject, projectId: string, taskId: string): Held | undefined {
  const memory = value.memory as Partial<AutomationStudioAnswerFirstTaskMemory> | undefined;
  if (value.kind !== "answer_first_task_memory" || value.schemaVersion !== 1 || value.projectId !== projectId || typeof memory !== "object" || memory === null) return undefined;
  if (memory.taskId !== taskId || typeof memory.flowId !== "string" || !Array.isArray(memory.notes) || !Array.isArray(memory.attempts)) return undefined;
  for (const flow of [memory.best, memory.latest]) {
    if (flow !== undefined && (typeof flow !== "object" || flow === null || !Array.isArray(flow.steps) || typeof flow.flowId !== "string" || typeof flow.stepsDigest !== "string")) return undefined;
  }
  return { kind: "answer_first_task_memory", schemaVersion: 1, projectId, memory: withReadableFlowBases(withReadableActs(memory as AutomationStudioAnswerFirstTaskMemory)) };
}

/** A base that does not read is left off and the rest stands: a Flow with none is looked at afresh, and only a blank one gets a base again, so nothing of a person's can be replaced for it. */
function withReadableFlowBases(memory: AutomationStudioAnswerFirstTaskMemory): AutomationStudioAnswerFirstTaskMemory {
  if (memory.flowBases === undefined) return memory;
  const { flowBases, ...rest } = memory;
  if (!Array.isArray(flowBases)) return rest;
  return { ...rest, flowBases: flowBases.filter((base) => typeof base === "object" && base !== null && typeof base.flowId === "string" && (base.digest === undefined || typeof base.digest === "string")) };
}

/** Acts that do not read are left off and the rest of the memory stands: the driver then falls back on the Flow's own record, or refuses. */
function withReadableActs(memory: AutomationStudioAnswerFirstTaskMemory): AutomationStudioAnswerFirstTaskMemory {
  if (memory.acts === undefined) return memory;
  const data = typeof memory.acts === "object" && memory.acts !== null ? parseAutomationStudioAttemptActRecordData(memory.acts.data) : undefined;
  if (data?.ok && typeof memory.acts.attemptId === "string" && typeof memory.acts.flowId === "string") return { ...memory, acts: { ...memory.acts, data: data.data } };
  const { acts: _unreadable, ...rest } = memory;
  return rest;
}

function readIndexed(value: JsonObject, projectId: string): Index | undefined {
  if (value.kind !== "answer_first_attempt_index" || value.schemaVersion !== 1 || value.projectId !== projectId || !Array.isArray(value.attempts)) return undefined;
  const ok = (value.attempts as unknown[]).every((each) => {
    const held = each as { attemptId?: unknown; taskId?: unknown; flowId?: unknown } | null;
    return typeof held === "object" && held !== null && typeof held.attemptId === "string" && typeof held.taskId === "string" && typeof held.flowId === "string";
  });
  return ok ? (value as unknown as Index) : undefined;
}
