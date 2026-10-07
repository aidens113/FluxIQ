import { appendFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const [root, phase, coreRoot] = process.argv.slice(2);
const resolved = path.resolve(root);
if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("authority-process-")) throw new Error("Unowned probe root");
const { pathToFileURL } = await import("node:url");
const { AutomationStudioProjectDatabasePool } = await import(pathToFileURL(path.join(coreRoot, "packages/fluxiq/dist/programs/automation-studio/storage/project/database.js")).href);
const { AutomationStudioProjectAuthorityGuardStore: Store } = await import(pathToFileURL(path.join(coreRoot, "packages/fluxiq/dist/programs/automation-studio/storage/project/authority-guard/index.js")).href);
const pool = new AutomationStudioProjectDatabasePool({ rootDir: resolved });
const store = await Store.open({ pool, projectId: "original-project" });
const request = { protocolVersion: 1, projectId: "original-project", ownerKind: "flow", ownerId: "original-flow", operationKind: "flow.save", requestDigest: `sha256:${"a".repeat(64)}`, expectedRevision: 0, operationKey: "original-operation" };
process.on("message", () => {});
await store.runLegacyMutation(request, async () => {
  await appendFile(path.join(resolved, "sentinel"), "effect\n");
  if (phase === "after-effect") { process.send({ phase }); await new Promise(() => {}); }
  return { value: "private-result", resultDigest: `sha256:${"b".repeat(64)}` };
});
process.send({ phase: "after-completion" });
await new Promise(() => {});
