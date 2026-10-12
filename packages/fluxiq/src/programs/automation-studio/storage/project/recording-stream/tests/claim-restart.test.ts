import { execFile, fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const execute = promisify(execFile);
const probe = fileURLToPath(new URL("./claim-process-probe.mjs", import.meta.url));
it("recovers the exact finalized legacy claim after its isolated writer dies before descriptor insertion", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-claim-process-"));
  const dist = path.resolve("dist");
  const child = fork(probe, ["claim", root, dist], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const closed = new Promise<void>(resolve => child.once("exit", () => { resolve(); }));
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("message", message => {
        if ((message as { type?: string }).type === "claim-ready") resolve();
        else reject(new Error("Unexpected unit claim readiness marker."));
      });
      child.once("error", reject);
      child.once("exit", code => { reject(new Error(`Unit claim writer exited before readiness (${code}).`)); });
    });
    const live = await execute(process.execPath, [probe, "live", root, dist], { timeout: 15_000 });
    expect(JSON.parse(live.stdout.trim())).toEqual({ phase: "live", entries: 1, claims: 1, endedAt: 99, closed: true });
    expect(child.kill("SIGKILL")).toBe(true);
    await closed;
    const result = await execute(process.execPath, [probe, "recover", root, dist], { timeout: 15_000 });
    expect(JSON.parse(result.stdout.trim())).toEqual({ phase: "recover", entries: 2, claims: 0, endedAt: 99, closed: true });
  } finally {
    child.kill("SIGKILL");
    await closed;
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
});
