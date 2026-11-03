import { fork, type ChildProcess, type ForkOptions, type SpawnOptions } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Packet = { phase: string; status?: string; state?: string; resultDigest?: string };
const built = path.resolve(fileURLToPath(new URL("../../../../../../../", import.meta.url)), "dist");
function script(): string {
  const gateway = pathToFileURL(path.join(built, "client-gateway/service/command-ledger/index.js")).href;
  const ledger = pathToFileURL(path.join(built, "programs/automation-studio/storage/project/command-ledger/index.js")).href;
  const project = pathToFileURL(path.join(built, "programs/automation-studio/storage/project/index.js")).href;
  return `
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { ClientGatewayCommandLedgerController as Controller } from ${JSON.stringify(gateway)};
import { AutomationStudioProjectCommandLedgerStore as Store } from ${JSON.stringify(ledger)};
import { AutomationStudioProjectDatabasePool as Pool } from ${JSON.stringify(project)};
const [root, mode] = process.argv.slice(2);
const packet = value => process.send?.(value);
const park = () => new Promise(() => { setInterval(() => {}, 1000); });
try {
  const owner = { projectId:'project.1',runId:'run.1',flowId:'flow.1',invocationId:'invoke.1',attemptId:'node.attempt.1',effectOrdinal:0 };
  const claim = { binding: {schemaVersion:'gateway_command.v1',...owner,commandId:Controller.commandId(owner),clientId:'client.1',sessionId:'session.1'},requestDigest:'sha256:'+'a'.repeat(64) };
  const pool = new Pool({ rootDir: root }), store = await Store.open({ pool, projectId: owner.projectId });
  if (mode === 'committed') {
    const original = store.commitReceipt.bind(store);
    store.commitReceipt = async (...args) => { const record = await original(...args); packet({ phase:'receipt_committed',resultDigest:record.receipt.resultDigest }); await park(); };
  }
  const result = await new Controller(store).dispatch(claim, async () => {
    await appendFile(path.join(root,'effects.txt'),'effect\\n');
    if (mode === 'pending') { packet({phase:'effect_written'}); await park(); }
    return { result:{synthetic:'live-only'},receipt:{schemaVersion:'gateway_command_receipt.v1',commandId:claim.binding.commandId,requestDigest:claim.requestDigest,clientId:claim.binding.clientId,sessionId:claim.binding.sessionId,status:'succeeded',receivedAt:Date.now(),resultDigest:'sha256:'+'b'.repeat(64),redaction:'receipt_only'} };
  });
  const record = await store.read(claim);
  await store.close(); await pool.closeAll();
  packet({phase:'reconciled',status:result.status,state:record.state,resultDigest:record.receipt?.resultDigest});
  process.disconnect?.();
} catch { packet({phase:'error'}); process.exitCode=1; process.disconnect?.(); }
`;
}
function launch(scriptPath: string, root: string, mode: string) {
  const options: ForkOptions & Pick<SpawnOptions, "windowsHide"> = { stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true };
  const child = fork(scriptPath, [root, mode], options);
  child.stderr?.on("data", () => undefined); // Drain without exposing raw module/error output.
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => resolve({ code, signal })); });
  const packet = new Promise<Packet>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Owned command probe IPC timeout")), 20_000);
    const done = (operation: () => void) => { clearTimeout(timeout); operation(); };
    child.once("message", value => done(() => {
      if (!value || typeof value !== "object" || JSON.stringify(value).length > 1024 || !("phase" in value) || value.phase === "error") reject(new Error("Owned command probe failed or invalid IPC"));
      else resolve(value as Packet);
    }));
    child.once("error", () => done(() => reject(new Error("Owned command probe launch failed"))));
    child.once("exit", () => done(() => reject(new Error("Owned command probe exited before IPC"))));
  });
  return { child, exited, packet };
}
async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Owned command probe shutdown timeout")), ms); })]); }
  finally { clearTimeout(timer); }
}
async function stop(child: ChildProcess, exited: Promise<unknown>): Promise<void> { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await bounded(exited, 5000); }
const probe = process.env.FLUXIQ_COMMAND_PROCESS_RESTART_PROBE === "1" ? describe : describe.skip;
probe("actual built command-ledger child termination/restart", () => {
  it.each(["pending", "committed"])("no repeated synthetic effect after %s termination", async mode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "gateway-command-process-")), children: ReturnType<typeof launch>[] = [];
    try {
      const scriptPath = path.join(root, "owned-child.mjs"); await writeFile(scriptPath, script(), "utf8");
      const original = launch(scriptPath, root, mode); children.push(original); const checkpoint = await original.packet;
      expect(checkpoint.phase).toBe(mode === "pending" ? "effect_written" : "receipt_committed");
      await stop(original.child, original.exited); expect(original.child.killed).toBe(true); expect(await original.exited).toEqual({ code: null, signal: "SIGKILL" });
      const restarted = launch(scriptPath, root, "reconcile"); children.push(restarted); const result = await restarted.packet;
      expect(await bounded(restarted.exited, 5000)).toEqual({ code: 0, signal: null }); expect(result.phase).toBe("reconciled");
      expect(result.status).toBe(mode === "pending" ? "outcome_unknown" : "result_unavailable"); expect(result.state).toBe(mode === "pending" ? "pending" : "committed");
      if (mode === "committed") expect(result.resultDigest).toBe(checkpoint.resultDigest);
      expect(await readFile(path.join(root, "effects.txt"), "utf8")).toBe("effect\n");
    } finally {
      await Promise.all(children.map(child => stop(child.child, child.exited)));
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("gateway-command-process-")) throw new Error("Refusing cleanup outside owned command probe");
      await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }, 60_000);
});
