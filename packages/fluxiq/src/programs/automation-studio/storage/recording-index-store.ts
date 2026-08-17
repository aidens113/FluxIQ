import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { safeSegment } from "../../_shared/storage.ts";
import { createAutomationStudioFileStorePaths } from "./file-store.ts";
import {
  assertValidRecordingIndex,
  emptyRecordingIndex,
  isRecordingIndex,
  sortRecordingIndex,
  type EmptyRecordingIndexInput,
  type RecordingIndex
} from "./state-index.ts";

export class RecordingStateIndexStore {
  private readonly paths;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(readonly rootDir: string) {
    this.paths = createAutomationStudioFileStorePaths(rootDir);
  }

  file(projectId: string, recordingId: string): string {
    return this.paths.recordingIndexFile(projectId, recordingId);
  }

  async exists(projectId: string, recordingId: string): Promise<boolean> {
    return Boolean(await readFile(this.file(projectId, recordingId), "utf8").then(() => true, () => false));
  }

  async read(projectId: string, recordingId: string, fallback?: Partial<EmptyRecordingIndexInput>): Promise<RecordingIndex> {
    const filePath = this.file(projectId, recordingId);
    const content = await readFile(filePath, "utf8").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    });
    if (!content.trim()) return emptyRecordingIndex({ projectId, recordingId, ...fallback });
    const parsed = JSON.parse(content) as unknown;
    if (!isRecordingIndex(parsed)) throw new Error(`Recording state index has an invalid shape: ${filePath}`);
    assertValidRecordingIndex(parsed);
    return sortRecordingIndex(parsed);
  }

  async write(index: RecordingIndex): Promise<RecordingIndex> {
    const next = sortRecordingIndex(index);
    assertValidRecordingIndex(next);
    await this.withLock(next.projectId, next.recordingId, async () => {
      const filePath = this.file(next.projectId, next.recordingId);
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await replaceFileWithRetry(temporary, filePath);
    });
    return next;
  }

  async update(projectId: string, recordingId: string, mutator: (index: RecordingIndex) => RecordingIndex | Promise<RecordingIndex>, fallback?: Partial<EmptyRecordingIndexInput>): Promise<RecordingIndex> {
    return this.withLock(projectId, recordingId, async () => {
      const current = await this.read(projectId, recordingId, fallback);
      const next = sortRecordingIndex(await mutator(current));
      assertValidRecordingIndex(next);
      const filePath = this.file(projectId, recordingId);
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      await replaceFileWithRetry(temporary, filePath);
      return next;
    });
  }

  async delete(projectId: string, recordingId: string): Promise<void> {
    await this.withLock(projectId, recordingId, async () => {
      await rm(this.file(projectId, recordingId), { force: true });
    });
  }

  private async withLock<T>(projectId: string, recordingId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${safeSegment(projectId)}:${safeSegment(recordingId)}`;
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => next, () => next);
    this.locks.set(key, chained);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === chained) this.locks.delete(key);
    }
  }
}

async function replaceFileWithRetry(source: string, destination: string): Promise<void> {
  const retryableCodes = new Set(["EPERM", "EBUSY", "EACCES"]);
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has((error as NodeJS.ErrnoException).code ?? "")) {
        await rm(source, { force: true }).catch(() => undefined);
        throw error;
      }
      await sleep(25 * (attempt + 1));
    }
  }
  try {
    await writeFile(destination, await readFile(source));
    await rm(source, { force: true });
  } catch {
    await rm(source, { force: true }).catch(() => undefined);
    throw lastError;
  }
}
