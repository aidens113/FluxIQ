// The boundary where a store driver's failure becomes the task memory's own typed one. A failure is told by
// its driver code (a Node system error such as EBUSY or EIO, or a SQLite error), never by its message words;
// anything else, a TypeError or a bad argument included, passes through unchanged.
import { AutomationStudioAnswerFirstTaskMemoryStoreError } from "./store-error.ts";

const SYSTEM_CODE = /^E[A-Z0-9]+$/u;
const SQLITE_CODE = /^(?:ERR_)?SQLITE(?:_[A-Z0-9_]+)?$/u;

/** Runs store work; a store that could not be read or written is rethrown as the typed store error. */
export async function automationStudioAnswerFirstTaskMemoryIo<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (typeof code === "string" && (SYSTEM_CODE.test(code) || SQLITE_CODE.test(code))) {
      throw new AutomationStudioAnswerFirstTaskMemoryStoreError("The task memory store could not be read or written.", { cause: error });
    }
    throw error;
  }
}
