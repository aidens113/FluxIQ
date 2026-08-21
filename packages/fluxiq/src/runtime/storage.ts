import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../core/index.ts";
import type { FluxIQRuntimeCommandAttempt, FluxIQRuntimeRun } from "./contracts.ts";

export type RuntimeStoreSnapshot = {
  runs: FluxIQRuntimeRun[];
  commandAttempts: FluxIQRuntimeCommandAttempt[];
};

export type RuntimeStore = {
  load(): Promise<RuntimeStoreSnapshot>;
  saveRun(run: FluxIQRuntimeRun): Promise<void>;
  saveCommandAttempt(attempt: FluxIQRuntimeCommandAttempt): Promise<void>;
};

export type FileRuntimeStoreOptions = {
  rootDir: string;
};

export class FileRuntimeStore implements RuntimeStore {
  private readonly rootDir: string;

  constructor(options: FileRuntimeStoreOptions) {
    this.rootDir = options.rootDir;
  }

  async load(): Promise<RuntimeStoreSnapshot> {
    const index = await readJson<{ runs?: string[]; commandAttempts?: string[] }>(this.indexPath(), { runs: [], commandAttempts: [] });
    const runs: FluxIQRuntimeRun[] = [];
    for (const runId of index.runs ?? []) {
      const run = await readJson<{ run?: FluxIQRuntimeRun }>(this.runPath(runId), {});
      if (run.run) runs.push(run.run);
    }
    const commandAttempts: FluxIQRuntimeCommandAttempt[] = [];
    for (const attemptId of index.commandAttempts ?? []) {
      const attempt = await readJson<{ attempt?: FluxIQRuntimeCommandAttempt }>(this.commandAttemptPath(attemptId), {});
      if (attempt.attempt) commandAttempts.push(attempt.attempt);
    }
    return { runs, commandAttempts };
  }

  async saveRun(run: FluxIQRuntimeRun): Promise<void> {
    await writeJson(this.runPath(run.runId), { run: run as unknown as JsonObject });
    await this.updateIndex((index) => ({
      ...index,
      runs: unique([...(index.runs ?? []), run.runId])
    }));
  }

  async saveCommandAttempt(attempt: FluxIQRuntimeCommandAttempt): Promise<void> {
    await writeJson(this.commandAttemptPath(attempt.attemptId), { attempt: attempt as unknown as JsonObject });
    await this.updateIndex((index) => ({
      ...index,
      commandAttempts: unique([...(index.commandAttempts ?? []), attempt.attemptId])
    }));
  }

  private indexPath(): string {
    return path.join(this.rootDir, "indexes", "runtime.json");
  }

  private runPath(runId: string): string {
    return path.join(this.rootDir, "runs", safeSegment(runId), "run.json");
  }

  private commandAttemptPath(attemptId: string): string {
    return path.join(this.rootDir, "command-attempts", safeSegment(attemptId), "attempt.json");
  }

  private async updateIndex(update: (index: { runs?: string[]; commandAttempts?: string[] }) => { runs?: string[]; commandAttempts?: string[] }): Promise<void> {
    const current = await readJson<{ runs?: string[]; commandAttempts?: string[] }>(this.indexPath(), { runs: [], commandAttempts: [] });
    await writeJson(this.indexPath(), update(current) as JsonObject);
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, value: JsonObject): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
