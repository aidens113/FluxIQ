import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type LoginAttemptState = {
  count: number;
  windowStartedAtMs: number;
  lockedUntilMs: number;
  updatedAtMs: number;
};

export type LoginAttemptOptions = { windowMs: number; lockoutMs: number; maxAttempts: number; maxEntries?: number };

export class LoginAttemptTracker {
  private readonly attempts = new Map<string, LoginAttemptState>();

  constructor(
    private readonly options: LoginAttemptOptions,
    private readonly now: () => number = Date.now,
  ) {}

  remainingLockout(key: string): number {
    const nowMs = this.now();
    const state = this.attempts.get(key);
    if (!state) return 0;
    if (state.lockedUntilMs > nowMs) return state.lockedUntilMs - nowMs;
    if (state.lockedUntilMs || nowMs - state.windowStartedAtMs > this.options.windowMs) this.attempts.delete(key);
    return 0;
  }

  registerFailure(key: string): LoginAttemptState {
    const nowMs = this.now();
    const existing = this.attempts.get(key);
    const state = !existing || existing.lockedUntilMs > 0 || nowMs - existing.windowStartedAtMs > this.options.windowMs
      ? { count: 0, windowStartedAtMs: nowMs, lockedUntilMs: 0, updatedAtMs: nowMs }
      : existing;
    state.count += 1;
    state.updatedAtMs = nowMs;
    if (state.count >= this.options.maxAttempts) state.lockedUntilMs = nowMs + this.options.lockoutMs;
    this.attempts.set(key, state);
    trimOldest(this.attempts, this.options.maxEntries ?? 10_000);
    return { ...state };
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}

type LoginAttemptFile = { schemaVersion: 1; attempts: Record<string, LoginAttemptState> };

export class DurableLoginAttemptTracker {
  private readonly lockPath: string;

  constructor(
    private readonly filePath: string,
    private readonly options: LoginAttemptOptions,
    private readonly now: () => number = Date.now,
  ) {
    this.lockPath = `${filePath}.lock`;
  }

  async remainingLockout(key: string): Promise<number> {
    return this.withState((attempts, nowMs) => {
      const state = attempts[key];
      if (!state) return 0;
      if (state.lockedUntilMs > nowMs) return state.lockedUntilMs - nowMs;
      if (state.lockedUntilMs || nowMs - state.windowStartedAtMs > this.options.windowMs) delete attempts[key];
      return 0;
    });
  }

  async registerFailure(key: string): Promise<LoginAttemptState> {
    return this.withState((attempts, nowMs) => {
      const existing = attempts[key];
      const state = !existing || existing.lockedUntilMs > 0 || nowMs - existing.windowStartedAtMs > this.options.windowMs
        ? { count: 0, windowStartedAtMs: nowMs, lockedUntilMs: 0, updatedAtMs: nowMs }
        : existing;
      state.count += 1;
      state.updatedAtMs = nowMs;
      if (state.count >= this.options.maxAttempts) state.lockedUntilMs = nowMs + this.options.lockoutMs;
      attempts[key] = state;
      trimRecord(attempts, this.options.maxEntries ?? 10_000);
      return { ...state };
    });
  }

  async clear(key: string): Promise<void> {
    await this.withState((attempts) => { delete attempts[key]; });
  }

  private async withState<T>(operation: (attempts: Record<string, LoginAttemptState>, nowMs: number) => T): Promise<T> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const release = await acquireFileLock(this.lockPath);
    try {
      const state = await readAttemptFile(this.filePath);
      const nowMs = this.now();
      removeExpired(state.attempts, nowMs, this.options.windowMs);
      const result = operation(state.attempts, nowMs);
      await writeAttemptFile(this.filePath, state);
      return result;
    } finally {
      await release();
    }
  }
}

export function loginClientAddress(request: Pick<Request, "headers">, trustProxy: boolean): string {
  if (!trustProxy) return "direct";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "proxy-unknown";
}

async function acquireFileLock(lockPath: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(String(process.pid));
      return async () => {
        await handle.close();
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if (!isErrorCode(error, "EEXIST")) throw error;
      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > 10_000) await rm(lockPath, { force: true });
      await new Promise((resolve) => setTimeout(resolve, Math.min(100, 5 + attempt * 2)));
    }
  }
  throw new Error("Login attempt store is busy. Try again shortly.");
}

async function readAttemptFile(filePath: string): Promise<LoginAttemptFile> {
  let serialized: string;
  try {
    serialized = await readFile(filePath, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return { schemaVersion: 1, attempts: {} };
    throw error;
  }
  if (!serialized.trim()) return { schemaVersion: 1, attempts: {} };
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return { schemaVersion: 1, attempts: validAttemptRecord(parsed) };
  } catch (error) {
    if (error instanceof SyntaxError) return { schemaVersion: 1, attempts: {} };
    throw error;
  }
}

async function writeAttemptFile(filePath: string, state: LoginAttemptFile): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tempPath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  await rename(tempPath, filePath);
}

function removeExpired(attempts: Record<string, LoginAttemptState>, nowMs: number, windowMs: number): void {
  for (const [key, state] of Object.entries(attempts)) {
    if ((state.lockedUntilMs > 0 && state.lockedUntilMs <= nowMs) || nowMs - state.windowStartedAtMs > windowMs) delete attempts[key];
  }
}

function trimRecord(attempts: Record<string, LoginAttemptState>, maxEntries: number): void {
  const excess = Object.keys(attempts).length - Math.max(1, maxEntries);
  if (excess <= 0) return;
  for (const [key] of Object.entries(attempts).sort((left, right) => left[1].updatedAtMs - right[1].updatedAtMs).slice(0, excess)) delete attempts[key];
}

function trimOldest(attempts: Map<string, LoginAttemptState>, maxEntries: number): void {
  while (attempts.size > Math.max(1, maxEntries)) {
    const oldest = [...attempts.entries()].sort((left, right) => left[1].updatedAtMs - right[1].updatedAtMs)[0];
    if (!oldest) return;
    attempts.delete(oldest[0]);
  }
}

function validAttemptRecord(value: unknown): Record<string, LoginAttemptState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = (value as { attempts?: unknown }).attempts;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate).flatMap(([key, state]) => {
    if (!state || typeof state !== "object" || Array.isArray(state)) return [];
    const entry = state as Partial<LoginAttemptState>;
    if (!Number.isInteger(entry.count) || Number(entry.count) < 0
      || !validTimestamp(entry.windowStartedAtMs)
      || !validTimestamp(entry.lockedUntilMs)
      || !validTimestamp(entry.updatedAtMs)) return [];
    return [[key, {
      count: Number(entry.count),
      windowStartedAtMs: Number(entry.windowStartedAtMs),
      lockedUntilMs: Number(entry.lockedUntilMs),
      updatedAtMs: Number(entry.updatedAtMs)
    } satisfies LoginAttemptState]];
  }));
}

function validTimestamp(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}
