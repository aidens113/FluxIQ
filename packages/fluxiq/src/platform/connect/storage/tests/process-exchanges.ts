import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ConnectTokenRequest } from "@fluxiq/contracts/platform";

/** An IPC barrier starts eight genuine service processes against the same synthetic authorization. */
export async function competingConnectProcesses(filePath: string, request: ConnectTokenRequest, approvingSessionDigest: string, now: number): Promise<string[]> {
  const script = fileURLToPath(new URL("./exchange-process.mjs", import.meta.url));
  const children = Array.from({ length: 8 }, () => fork(script, [], { execArgv: ["--experimental-strip-types"], stdio: ["ignore", "ignore", "ignore", "ipc"] }));
  const exits = children.map((child) => new Promise<void>((resolve) => child.once("exit", () => resolve())));
  const waiters = children.map((child) => {
    let ready: (() => void) | undefined;
    let outcome: ((result: string) => void) | undefined;
    let rejectReady: ((error: Error) => void) | undefined;
    let rejectOutcome: ((error: Error) => void) | undefined;
    const readiness = new Promise<void>((resolve, reject) => {
      ready = resolve;
      rejectReady = reject;
    });
    const result = new Promise<string>((resolve, reject) => {
      outcome = resolve;
      rejectOutcome = reject;
    });
    const fail = (error: Error) => {
      rejectReady!(error);
      rejectOutcome!(error);
    };
    child.on("error", fail);
    child.on("exit", (code) => fail(new Error(`Synthetic connect process exited before its result (${code}).`)));
    child.on("message", (message: unknown) => {
      if (typeof message !== "object" || message === null) return;
      if ("ready" in message && message.ready === true) ready!();
      if ("outcome" in message && typeof message.outcome === "string") outcome!(message.outcome);
      if ("error" in message) fail(new Error("Synthetic connect process failed without an exchange result."));
    });
    return { readiness, result };
  });
  try {
    const sending = Promise.all(waiters.map((waiter) => waiter.readiness)).then(() => {
      for (const child of children) child.send({ filePath, request, approvingSessionDigest, now });
    });
    const [, outcomes] = await Promise.all([sending, Promise.all(waiters.map((waiter) => waiter.result))]);
    return outcomes;
  } finally {
    for (const child of children) if (child.connected) child.disconnect();
    await Promise.all(exits);
  }
}
