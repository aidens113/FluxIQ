import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Actual processes share no JS queue; all eight load before any process saves. */
export async function competingBrowserTrustProcesses(filePath: string, workspaceId: string): Promise<string[]> {
  const script = fileURLToPath(new URL("./sqlite-store-process.mjs", import.meta.url));
  const children = Array.from({ length: 8 }, (_unused, index) => fork(script, [filePath, workspaceId, String(index)], { execArgv: ["--experimental-strip-types"], stdio: ["ignore", "ignore", "ignore", "ipc"] }));
  const exits = children.map((child) => new Promise<void>((resolve) => child.once("exit", () => resolve())));
  const waiters = children.map((child) => {
    let ready: () => void = () => undefined;
    let outcome: (value: string) => void = () => undefined;
    let failReady: (error: Error) => void = () => undefined;
    let failOutcome: (error: Error) => void = () => undefined;
    const readyPromise = new Promise<void>((resolve, reject) => {
      ready = resolve;
      failReady = reject;
    });
    const outcomePromise = new Promise<string>((resolve, reject) => {
      outcome = resolve;
      failOutcome = reject;
    });
    function fail(error: Error) {
      failReady(error);
      failOutcome(error);
    }
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Synthetic browser trust process exited (${code}).`)));
    child.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      if ("ready" in message && message.ready === true) ready();
      if ("outcome" in message && typeof message.outcome === "string") outcome(message.outcome);
      if ("error" in message) fail(new Error(`Synthetic browser trust process failed (${String(message.error)}).`));
    });
    return { readyPromise, outcomePromise };
  });
  try {
    const starting = Promise.all(waiters.map((waiter) => waiter.readyPromise)).then(() => {
      for (const child of children) child.send({ start: true });
    });
    const [, outcomes] = await Promise.all([starting, Promise.all(waiters.map((waiter) => waiter.outcomePromise))]);
    return outcomes;
  } finally {
    for (const child of children) if (child.connected) child.disconnect();
    await Promise.all(exits);
  }
}
