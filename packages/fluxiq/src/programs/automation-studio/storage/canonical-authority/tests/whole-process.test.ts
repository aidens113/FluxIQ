import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { wholeFixture } from "./whole-fixture.ts";

type Reply = { status: string; code?: string };
function receive(child: ChildProcess, statuses: string[]): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error("whole writer child timeout")); }, 15000);
    const listener = (reply: Reply) => { if (statuses.includes(reply.status)) { cleanup(); resolve(reply); } };
    const failed = () => { cleanup(); reject(new Error("whole writer child exited before expected phase")); };
    function cleanup() { clearTimeout(timeout); child.off("message", listener); child.off("exit", failed); }
    child.on("message", listener); child.on("exit", failed);
  });
}
async function stop(child: ChildProcess) { if (child.exitCode !== null || child.signalCode !== null) return; const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); await exited; }
function launch(root: string, mode: string, projectId: string, flowId: string, phase: string) { return fork(fileURLToPath(new URL("./whole-process-probe.mjs", import.meta.url)), [root, mode, projectId, flowId, phase], { stdio: ["ignore", "ignore", "inherit", "ipc"] }); }

for (const mode of ["sql", "file"] as const) {
  it(`actual built ${mode} two-process writer race permits exactly one first effect`, async () => {
    await wholeFixture(mode, async f => {
      const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" }), children = [launch(f.root, mode, f.project.id, flow.flowId, "canonical_flow"), launch(f.root, mode, f.project.id, flow.flowId, "canonical_flow")];
      try {
        await Promise.all(children.map(child => receive(child, ["ready"]))); const waiting = children.map(child => receive(child, ["paused", "refused"])); children.forEach(child => child.send("go"));
        const replies = await Promise.all(waiting); expect(replies.filter(reply => reply.status === "paused")).toHaveLength(1); expect(replies.filter(reply => reply.code === "unresolved")).toHaveLength(1);
        expect((await f.repositories.flows.get(flow.flowId))?.name).toBe("Child effect");
      } finally { await Promise.all(children.map(stop)); }
      await expect(f.writer.saveFlowInternal({ projectId: f.project.id, flow }, false)).rejects.toThrow("unresolved");
    });
  }, 30000);
  for (const phase of ["canonical_flow", "project_flow_document", "flow_source", "generated_config", "sql_flow_metadata", "project_change_feed", "project_complete"]) it(`actual built ${mode} kill after ${phase} preserves both-participant hold`, async () => {
    await wholeFixture(mode, async f => {
      const flow = await f.creation.createFlow({ projectId: f.project.id, name: "Original" }), child = launch(f.root, mode, f.project.id, flow.flowId, phase);
      try { await receive(child, ["ready"]); const waiting = receive(child, ["paused", "refused", "completed"]); child.send("go"); expect(await waiting).toMatchObject({ status: "paused" }); await stop(child); }
      finally { await stop(child); }
      const held = await f.database.transaction({}, sql => sql.get("select o.phase,l.pending_operation_key from canonical_authority_operations o join canonical_authority_lifecycle l on l.pending_operation_key=o.operation_key where o.original_project_id=?", [f.project.id]));
      expect(held).toMatchObject({ phase: phase === "project_complete" ? "effect_applied" : "project_claimed", pending_operation_key: expect.any(String) });
      await expect(f.writer.saveFlowInternal({ projectId: f.project.id, flow }, false)).rejects.toThrow("unresolved");
      const lease = await f.pool.acquire(f.project.id);
      try { expect(await lease.database.get("select completion_json from authority_guard_legacy where operation_key=?", [(held as { pending_operation_key: string }).pending_operation_key])).toMatchObject({ completion_json: phase === "project_complete" ? expect.any(String) : null }); }
      finally { await lease.release(); }
    });
  }, 30000);
}
