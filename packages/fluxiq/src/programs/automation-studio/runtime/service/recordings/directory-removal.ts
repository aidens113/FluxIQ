import { rm } from "node:fs/promises";

// Removing a recording's directories on disk. On Windows a directory that
// another handle still holds for a moment (an indexer, an antivirus scan, a
// just-closed SQLite or file stream) refuses `rmdir` with EPERM or EBUSY, and
// a sibling removal racing on the same tree can see ENOTEMPTY. Those clear on
// their own within milliseconds, so the removal waits and tries again a bounded
// number of times. A failure that outlasts the retries, or any other error, is
// thrown exactly as `rm` threw it: a deletion that did not happen is never
// reported as done.

const TRANSIENT_REMOVAL_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"]);
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [10, 25, 50, 100, 200, 400];

export interface RemovePathWithRetryOptions {
  /** `true` (the default) removes a directory and everything under it. */
  recursive?: boolean;
  /** Wait before each retry; its length is the number of retries. */
  retryDelaysMs?: readonly number[];
  /** The single removal attempt; tests inject a failing one. */
  remove?: (target: string, options: { recursive: boolean; force: true }) => Promise<void>;
  /** How a retry waits; tests inject an immediate one. */
  wait?: (ms: number) => Promise<void>;
}

export async function removePathWithRetry(target: string, options: RemovePathWithRetryOptions = {}): Promise<void> {
  const remove = options.remove ?? ((removeTarget, removeOptions) => rm(removeTarget, removeOptions));
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const removeOptions = { recursive: options.recursive ?? true, force: true as const };
  for (let attempt = 0; ; attempt += 1) {
    try {
      await remove(target, removeOptions);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code ?? "";
      if (attempt >= delays.length || !TRANSIENT_REMOVAL_CODES.has(code)) throw error;
      await wait(delays[attempt] ?? 0);
    }
  }
}
