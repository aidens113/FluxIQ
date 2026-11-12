// What a task remembers between attempts (t870, design D11): one file per task under the
// project's directory, and one small index there that says which task and Flow an attempt
// belongs to (a client's query holds only a project and an attempt).
//
// **Legacy unscoped unreadable state is moved aside and read as nothing**. Scoped execution state
// refuses an unreadable owner record instead of forgetting lasting acts. **Writes go one at a
// time per task** (and per project for the index), so two endings lose nothing of each other.
// **Notes are screened when written**, each at most 600 characters, a note with nothing left
// dropped. Notes keep the last 10, attempts the last 100. With no data root it lives in memory.

import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { humannessSchema } from "@fluxiq/contracts/automation";
import { parseAutomationStudioAttemptActRecordData } from "../../../../../runtime/answer-first/act-record/index.ts";
import { safeSegment, ProgramJsonStore, ProgramStateReadError } from "../../../../persistence/program-state/storage.ts";
import { programJsonDocumentTransaction, type ProgramJsonLockedDocument } from "../../../../persistence/program-state/document-transaction/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioAnswerFirstAttemptProvenance } from "./provenance.ts";
import type { AutomationStudioAnswerFirstTaskMemory } from "./memory.ts";
import { automationStudioAnswerFirstScreenedNote } from "./screened-note.ts";
import type { AutomationStudioAnswerFirstTaskNote } from "./task-note.ts";
import type { AutomationStudioAnswerFirstTaskActs } from "./task-acts.ts";

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

  /** What the task kept. Scoped reads distinguish missing from unreadable; legacy reads retain recovery. */
  async get(projectId: string, taskId: string, options?: { scoped: boolean }): Promise<AutomationStudioAnswerFirstTaskMemory | undefined> {
    return structuredClone((await (options?.scoped ? this.readTaskStrict(projectId, taskId) : this.readTask(projectId, taskId)))?.memory);
  }

  /** Changes the task's memory one write at a time. `change` gets the memory (an empty one for a new task) and answers the whole new memory. */
  async update(projectId: string, taskId: string, change: (current: AutomationStudioAnswerFirstTaskMemory) => AutomationStudioAnswerFirstTaskMemory, options?: { scoped: boolean }): Promise<AutomationStudioAnswerFirstTaskMemory> {
    const kept = await this.queued(JSON.stringify([projectId, taskId]), async () => {
      const replace = async (document?: ProgramJsonLockedDocument) => {
        const held = options?.scoped ? await this.readTaskStrict(projectId, taskId, document?.read)
          : document ? await this.orSetAside(this.taskFile(projectId, taskId), (value) => readHeld(value, projectId, taskId), document.read) : this.memory.get(JSON.stringify([projectId, taskId]));
        const current = held?.memory ?? { taskId, flowId: "", notes: [], attempts: [] };
        const next = tidy(change(structuredClone(current)), taskId);
        if (options?.scoped && !readableExecutionState(next)) throw new Error("The replacement execution state is unreadable.");
        const updated: Held = { kind: "answer_first_task_memory", schemaVersion: 1, projectId, memory: next };
        if (document) await document.write(updated as unknown as JsonObject);
        else this.memory.set(JSON.stringify([projectId, taskId]), structuredClone(updated));
        return next;
      };
      if (!this.paths.root) return await replace();
      await this.projects.ensureProjectStructure(projectId);
      return await programJsonDocumentTransaction(this.taskFile(projectId, taskId), replace);
    });
    await this.queued(JSON.stringify([projectId]), async () => {
      await this.updateIndex(projectId, (index) => {
        for (const attempt of kept.attempts) {
          const at = index.attempts.findIndex((each) => each.attemptId === attempt.attemptId);
          const entry = { attemptId: attempt.attemptId, taskId, flowId: attempt.flowId };
          if (at >= 0) index.attempts[at] = entry;
          else index.attempts.push(entry);
        }
        return { ...index, attempts: index.attempts.slice(-KEPT_INDEX) };
      });
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
      await this.updateIndex(projectId, (index) => ({ ...index, attempts: index.attempts.filter((attempt) => attempt.taskId !== taskId) }), false);
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

  /** A missing execution is new; an unreadable one cannot be treated as permission to act again. */
  private async readTaskStrict(projectId: string, taskId: string, read?: () => Promise<JsonObject | undefined>): Promise<Held | undefined> {
    try {
      let value: JsonObject | Held | undefined;
      if (read) value = await read();
      else if (!this.paths.root) value = this.memory.get(JSON.stringify([projectId, taskId]));
      else {
        const file = this.taskFile(projectId, taskId);
        if (await ProgramJsonStore.existingOwningLayout(file)) return await programJsonDocumentTransaction(file, async (document) => await this.readTaskStrict(projectId, taskId, document.read));
        let missing = false;
        value = await new ProgramJsonStore<JsonObject>(file, () => {
          missing = true;
          return {};
        }).read();
        if (missing) return undefined;
      }
      if (value === undefined) return undefined;
      const held = readHeld(value as unknown as JsonObject, projectId, taskId, true);
      if (!held) throw new Error("Invalid scoped task memory.");
      return held;
    } catch (cause) {
      throw new Error("The task's stored execution state is unreadable; repair it before retrying.", { cause });
    }
  }

  private async readIndex(projectId: string): Promise<Index | undefined> {
    if (!this.paths.root) return this.indexes.get(projectId);
    const value = await this.readFile(this.indexFile(projectId));
    return value && readIndexed(value, projectId);
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

  private async orSetAside<T>(file: string, parse: (value: JsonObject) => T | undefined, read?: () => Promise<JsonObject | undefined>): Promise<T | undefined> {
    let value: JsonObject | undefined;
    try {
      value = read ? await read() : await new ProgramJsonStore<JsonObject>(file, () => ({})).read();
    } catch (error) {
      if (!(error instanceof ProgramStateReadError)) throw error;
      await this.setAside(file);
      return undefined;
    }
    if (!value || !Object.keys(value).length) return undefined;
    const parsed = parse(value);
    if (!parsed) await this.setAside(file);
    return parsed;
  }

  private async setAside(file: string): Promise<void> {
    try {
      await rename(file, `${file}.unreadable`);
    } catch {
      /* best-effort: nothing to move, or it cannot be moved, and the write that follows replaces it */
    }
  }

  private async updateIndex(projectId: string, change: (index: Index) => Index, create = true): Promise<void> {
    const replace = async (document?: ProgramJsonLockedDocument) => {
      const current = document ? await this.orSetAside(this.indexFile(projectId), (value) => readIndexed(value, projectId), document.read) : this.indexes.get(projectId);
      if (!current && !create) return;
      const next = change(current ?? { kind: "answer_first_attempt_index", schemaVersion: 1, projectId, attempts: [] });
      if (document) await document.write(next as unknown as JsonObject);
      else this.indexes.set(projectId, structuredClone(next));
    };
    if (!this.paths.root) return await replace();
    await this.projects.ensureProjectStructure(projectId);
    await programJsonDocumentTransaction(this.indexFile(projectId), replace);
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

function readHeld(value: JsonObject, projectId: string, taskId: string, scoped = false): Held | undefined {
  const memory = value.memory as Partial<AutomationStudioAnswerFirstTaskMemory> | undefined;
  if (value.kind !== "answer_first_task_memory" || value.schemaVersion !== 1 || value.projectId !== projectId || typeof memory !== "object" || memory === null) return undefined;
  if (memory.taskId !== taskId || typeof memory.flowId !== "string" || !Array.isArray(memory.notes) || !Array.isArray(memory.attempts)) return undefined;
  if (scoped && !readableExecutionState(memory)) return undefined;
  for (const flow of [memory.best, memory.latest]) {
    if (flow !== undefined && (typeof flow !== "object" || flow === null || !Array.isArray(flow.steps) || typeof flow.flowId !== "string" || typeof flow.stepsDigest !== "string")) return undefined;
  }
  return { kind: "answer_first_task_memory", schemaVersion: 1, projectId, memory: withReadableHumanness(withReadableFlowBases(withReadableActs(memory as AutomationStudioAnswerFirstTaskMemory))) };
}

function readableExecutionState(memory: Partial<AutomationStudioAnswerFirstTaskMemory>): boolean {
  if (memory.acts !== undefined && !readActs(memory.acts)) return false;
  if (memory.actsByScope !== undefined) {
    if (!memory.actsByScope || typeof memory.actsByScope !== "object" || Array.isArray(memory.actsByScope)) return false;
    for (const [scope, acts] of Object.entries(memory.actsByScope)) {
      if (!scope.trim() || scope.length > 512 || !readActs(acts) || (acts.earlier !== undefined && !parseAutomationStudioAttemptActRecordData(acts.earlier).ok)) return false;
    }
  }
  if (memory.pipelineSourcesByScope !== undefined) {
    if (!memory.pipelineSourcesByScope || typeof memory.pipelineSourcesByScope !== "object" || Array.isArray(memory.pipelineSourcesByScope)) return false;
    for (const [scope, reference] of Object.entries(memory.pipelineSourcesByScope)) {
      if (!scope.trim() || scope.length > 512 || !reference || typeof reference.snapshotId !== "string" || !reference.snapshotId.trim() || !Number.isSafeInteger(reference.count) || reference.count < 0) return false;
    }
  }
  return true;
}

/** A level no save would have taken is left off and the rest stands: the task then runs at its Flow's level or the starting value. */
function withReadableHumanness(memory: AutomationStudioAnswerFirstTaskMemory): AutomationStudioAnswerFirstTaskMemory {
  if (memory.humanness === undefined || humannessSchema.safeParse(memory.humanness).success) return memory;
  const { humanness: _unreadable, ...rest } = memory;
  return rest;
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
  const { acts: given, actsByScope: scoped, ...rest } = memory;
  const acts = readActs(given);
  const scopes = scoped && typeof scoped === "object" && !Array.isArray(scoped)
    ? Object.fromEntries(Object.entries(scoped).flatMap(([scope, value]) => {
      const record = readActs(value);
      return scope.trim().length > 0 && scope.length <= 512 && record ? [[scope, record]] : [];
    })) : undefined;
  return { ...rest, ...(acts ? { acts } : {}), ...(scopes ? { actsByScope: scopes } : {}) };
}

function readActs(given: unknown): AutomationStudioAnswerFirstTaskActs | undefined {
  if (typeof given !== "object" || given === null) return undefined;
  const acts = given as AutomationStudioAnswerFirstTaskActs;
  const data = parseAutomationStudioAttemptActRecordData(acts.data);
  if (!data.ok || typeof acts.attemptId !== "string" || typeof acts.flowId !== "string") return undefined;
  const earlier = acts.earlier === undefined ? undefined : parseAutomationStudioAttemptActRecordData(acts.earlier);
  return { attemptId: acts.attemptId, flowId: acts.flowId, data: data.data, ...(earlier?.ok ? { earlier: earlier.data } : {}) };
}

function readIndexed(value: JsonObject, projectId: string): Index | undefined {
  if (value.kind !== "answer_first_attempt_index" || value.schemaVersion !== 1 || value.projectId !== projectId || !Array.isArray(value.attempts)) return undefined;
  const ok = (value.attempts as unknown[]).every((each) => {
    const held = each as { attemptId?: unknown; taskId?: unknown; flowId?: unknown } | null;
    return typeof held === "object" && held !== null && typeof held.attemptId === "string" && typeof held.taskId === "string" && typeof held.flowId === "string";
  });
  return ok ? (value as unknown as Index) : undefined;
}
