import { safeSegment } from "../../../_shared/storage.ts";

// Three keyed promise chains, one per mutation domain. The two bootstrap
// wrappers and the recording wrapper are deliberately NOT the same function:
// the recording chain absorbs a rejected predecessor
// (`previous.then(() => current, () => current)` and `await previous.catch()`)
// while the bootstrap chains propagate it (`previous.then(() => current)` and
// a bare `await previous`). Unifying them would change which callers see a
// neighbour's failure, so each body is kept exactly as it was.
export class AutomationStudioServiceLocks {
  private readonly recordingMutationLocks = new Map<string, Promise<void>>();
  private readonly bootstrapAdaptationLocks = new Map<string, Promise<void>>();
  private readonly bootstrapGenerationLocks = new Map<string, Promise<void>>();

  async withRecordingMutationLock<TResult>(projectId: string | null | undefined, recordingId: string, operation: () => Promise<TResult>): Promise<TResult> {
    const key = `${safeSegment(projectId ?? "global")}:${safeSegment(recordingId)}`;
    const previous = this.recordingMutationLocks.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current, () => current);
    this.recordingMutationLocks.set(key, chained);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.recordingMutationLocks.get(key) === chained) this.recordingMutationLocks.delete(key);
    }
  }

  async withBootstrapAdaptationLock<T>(projectId: string, flowId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${projectId}:${flowId}`;
    const previous = this.bootstrapAdaptationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.bootstrapAdaptationLocks.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.bootstrapAdaptationLocks.get(key) === tail) this.bootstrapAdaptationLocks.delete(key);
    }
  }

  async withBootstrapGenerationLock<T>(projectId: string, flowId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${projectId}:${flowId}`;
    const previous = this.bootstrapGenerationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.bootstrapGenerationLocks.set(key, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.bootstrapGenerationLocks.get(key) === tail) this.bootstrapGenerationLocks.delete(key);
    }
  }
}
