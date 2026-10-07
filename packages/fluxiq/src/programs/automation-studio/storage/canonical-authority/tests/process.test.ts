import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { canonicalFixture } from "./fixture.ts";

type Reply = { status: string; operationKey?: string; code?: string };
function receive(child: ChildProcess, statuses: string[]): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error("canonical probe timeout")); }, 15000);
    const listener = (reply: Reply) => { if (statuses.includes(reply.status)) { cleanup(); resolve(reply); } };
    const failed = () => { cleanup(); reject(new Error("canonical probe exited before expected phase")); };
    function cleanup() { clearTimeout(timeout); child.off("message", listener); child.off("exit", failed); }
    child.on("message", listener); child.on("exit", failed);
  });
}
async function stop(child: ChildProcess) { if (child.exitCode !== null || child.signalCode !== null) return; const exited = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); await exited; }
function launch(root: string, action: string, id: string) { return fork(fileURLToPath(new URL("./process-probe.mjs", import.meta.url)), [root, action, id], { stdio: ["ignore", "ignore", "ignore", "ipc"] }); }

it("real built two-process race has one reservation and one refusal", async () => {
  await canonicalFixture(async ({ root, create, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const children = [launch(root, "race", original.document.flowId), launch(root, "race", original.document.flowId)];
    try {
      await Promise.all(children.map(child => receive(child, ["ready"])));
      const responses = children.map(child => receive(child, ["reserved", "refused"])); children.forEach(child => child.send("go"));
      const results = await Promise.all(responses); expect(results.filter(reply => reply.status === "reserved")).toHaveLength(1); expect(results.filter(reply => reply.code === "unresolved")).toHaveLength(1);
      await expect(coordinator.beginCapture("original-project", "race-capture", 1)).rejects.toThrow("unresolved");
    } finally { await Promise.all(children.map(stop)); }
  });
}, 30000);

it("private infrastructure publication allocation race preserves one original owner", async () => {
  await canonicalFixture(async ({ root, create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const children = [launch(root, "allocation-race", original.document.flowId), launch(root, "allocation-race", original.document.flowId)];
    try {
      await Promise.all(children.map(child => receive(child, ["ready"])));
      const responses = children.map(child => receive(child, ["reserved", "refused"])); children.forEach(child => child.send("go"));
      const results = await Promise.all(responses); expect(results.filter(reply => reply.status === "reserved")).toHaveLength(1); expect(results.filter(reply => reply.code === "allocated")).toHaveLength(1);
      expect(await owners.readOwner("automation.flow_publications", `${original.document.flowId}@1.0.0`)).toMatchObject({ originalProjectId: "original-project", tombstoned: false, ownerRevision: 0 });
    } finally { await Promise.all(children.map(stop)); }
  });
}, 30000);

for (const phase of ["reserved", "effect", "project-complete"]) it(`literal child kill after ${phase} preserves unresolved capture refusal`, async () => {
  await canonicalFixture(async ({ root, create, owners, coordinator }) => {
    const original = await create(); await coordinator.perform(original, original.document);
    const child = launch(root, phase, original.document.flowId);
    try {
      await receive(child, ["ready"]); const waiting = receive(child, [phase]); child.send("go"); const reply = await waiting; await stop(child);
      expect((await owners.reconcile(reply.operationKey!)).phase).toBe(phase === "reserved" ? "reserved" : "effect_applied");
      await expect(coordinator.beginCapture("original-project", `kill-${phase}`, phase === "reserved" ? 1 : 2)).rejects.toThrow("unresolved");
    } finally { await stop(child); }
  });
}, 30000);
