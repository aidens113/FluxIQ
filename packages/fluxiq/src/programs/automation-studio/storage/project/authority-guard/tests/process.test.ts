import { spawn } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectAuthorityGuardStore as Store } from "../index.ts";
const enabled = process.env.FLUXIQ_AUTHORITY_GUARD_PROCESS_PROBE === "1";
const request = { protocolVersion: 1 as const, projectId: "original-project", ownerKind: "flow", ownerId: "original-flow", operationKind: "flow.save", requestDigest: `sha256:${"a".repeat(64)}`, expectedRevision: 0, operationKey: "original-operation" };
describe.skipIf(!enabled)("literal built guard process restart", () => {
  it.each(["after-effect", "after-completion"])("does not repeat %s interrupted command", async phase => {
    const root = await mkdtemp(path.join(os.tmpdir(), "authority-process-"));
    const coreRoot = path.resolve(fileURLToPath(new URL("../../../../../../../../..", import.meta.url)));
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API.?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(key)));
    const child = spawn(process.execPath, [fileURLToPath(new URL("./process-probe.mjs", import.meta.url)), root, phase, coreRoot], { env, windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let stderr = ""; child.stderr?.on("data", chunk => { if (stderr.length < 4096) stderr += String(chunk).slice(0, 4096 - stderr.length); });
    const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Probe timeout")), 15000); child.once("error", error => { clearTimeout(timer); reject(error); }); child.once("exit", () => { clearTimeout(timer); reject(new Error(`Probe exited before checkpoint: ${stderr}`)); }); child.on("message", message => { if (message && typeof message === "object" && "phase" in message && message.phase === phase) { clearTimeout(timer); resolve(); } }); });
      child.kill("SIGKILL"); await Promise.race([exited, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Owned probe did not close")), 5000))]);
      const pool = new AutomationStudioProjectDatabasePool({ rootDir: root }), store = await Store.open({ pool, projectId: request.projectId });
      try {
        const found = await store.runLegacyMutation(request, async () => { await appendFile(path.join(root, "sentinel"), "repeat\n"); return { value: null, resultDigest: `sha256:${"b".repeat(64)}` }; });
        expect(found.status).toBe(phase === "after-effect" ? "outcome_unknown" : "result_unavailable"); expect(await readFile(path.join(root, "sentinel"), "utf8")).toBe("effect\n"); expect((await store.readState())?.completedRevision).toBe(phase === "after-effect" ? 0 : 1);
      } finally { await store.close(); await pool.closeAll(); }
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) throw new Error("Owned child still running; preserving fixture");
      const resolved = path.resolve(root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("authority-process-")) throw new Error("Unsafe cleanup"); await rm(resolved, { recursive: true, force: true });
    }
  }, 25000);
});
