import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Starts eight real processes behind a ready barrier, then competes on one nonce at once. */
export async function competingStoreProcesses(filePath: string, keyId: string, nowMs: number): Promise<string[]> {
  const script = fileURLToPath(new URL("./sqlite-store-process.mjs", import.meta.url));
  const children = Array.from({ length: 8 }, () => fork(script, [], { execArgv: ["--experimental-strip-types"], stdio: ["ignore", "ignore", "ignore", "ipc"] }));
  const exits = children.map((child) => new Promise<void>((resolve) => child.once("exit", () => resolve())));
  const waiters = children.map((child) => {
    let ready: (() => void) | undefined;
    let result: ((outcome: string) => void) | undefined;
    let failReady: ((error: Error) => void) | undefined;
    let failResult: ((error: Error) => void) | undefined;
    const readyPromise = new Promise<void>((resolve, reject) => {
      ready = resolve;
      failReady = reject;
    });
    const resultPromise = new Promise<string>((resolve, reject) => {
      result = resolve;
      failResult = reject;
    });
    const fail = (error: Error) => {
      failReady!(error);
      failResult!(error);
    };
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Synthetic SQLite worker exited before its result (${code}).`)));
    child.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      if ("ready" in message && message.ready === true) ready!();
      if ("outcome" in message && typeof message.outcome === "string") result!(message.outcome);
      if ("error" in message) fail(new Error(`Synthetic SQLite worker failed (${String(message.error)}).`));
    });
    return { readyPromise, resultPromise };
  });
  try {
    const sending = Promise.all(waiters.map((waiter) => waiter.readyPromise)).then(() => {
      for (const child of children) child.send({ filePath, keyId, nowMs });
    });
    const [, outcomes] = await Promise.all([sending, Promise.all(waiters.map((waiter) => waiter.resultPromise))]);
    return outcomes;
  } finally {
    for (const child of children) if (child.connected) child.disconnect();
    await Promise.all(exits);
  }
}
