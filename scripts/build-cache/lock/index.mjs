// The per-step lock that keeps two processes from building one step in one
// tree at the same time (`acquireStepLock`, the writer), while any number of
// processes that only read the step's outputs hold it together
// (`acquireStepReadLock`, the readers) and a build waits for them to leave.

export { acquireStepLock } from "./acquire-step-lock.mjs";
export { acquireStepReadLock } from "./acquire-step-read-lock.mjs";
export { isProcessAlive } from "./is-process-alive.mjs";
