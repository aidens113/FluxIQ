import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { AutomationStudioAnswerFirstChatPermissionStore } from "../store.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it("keeps grants, declines and repair discoveries after the service restarts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-chat-permission-"));
  roots.push(root);
  const open = () => new AutomationStudioAnswerFirstChatPermissionStore({ root }, { flowDirectory: () => root }, { ensureProjectStructure: async () => undefined });
  const store = open();
  await store.heard("project", "flow", { outcome: "granted", classes: ["delete"], requestId: "permission.granted" });
  await store.heard("project", "flow", { outcome: "declined", classes: ["move_money"], requestId: "permission.declined" });
  await store.unforeseen("project", "flow", ["send_or_publish"]);
  await store.needs("project", "flow", "sha256:task", ["delete"]);
  expect(await open().get("project", "flow")).toEqual({ granted: ["delete"], declined: ["move_money"], declinedRequestId: "permission.declined", unforeseen: ["send_or_publish"], needs: [{ instruction: "sha256:task", classes: ["delete"] }] });
});
