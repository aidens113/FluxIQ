import path from "node:path";
import { pathToFileURL } from "node:url";
const [root, mode, projectId, flowId, phase] = process.argv.slice(2);
const dist = path.join(process.cwd(), "dist"), load = relative => import(pathToFileURL(path.join(dist, relative)).href);
// Actual production framework-first ordering, not the helper-first unit graph.
await load("framework/index.js");
const { createCanonicalAutomationStudioSQLiteRepositories, AutomationStudioProjectDatabasePool } = await load("programs/automation-studio/storage/index.js");
const { CanonicalAuthorityWholeOperation } = await load("programs/automation-studio/storage/canonical-authority/index.js");
const { AutomationStudioProjectAuthorityGuardStore: Guard } = await load("programs/automation-studio/storage/project/authority-guard/index.js");
const { AutomationStudioProjectPaths, AutomationStudioFlowPaths } = await load("programs/automation-studio/runtime/service/paths/index.js");
const { AutomationStudioProjectStore } = await load("programs/automation-studio/runtime/service/projects/index.js");
const { AutomationStudioServiceIndexes } = await load("programs/automation-studio/runtime/service/indexes/index.js");
const { AutomationStudioFlowStore, AutomationStudioFlowWriter } = await load("programs/automation-studio/runtime/service/flows/index.js");
const globalRoot = path.join(root, ".fluxiq"), databaseRoot = mode === "sql" ? path.join(globalRoot, "artifacts", "automation-studio") : path.join(root, "automation"), projectRoot = path.join(databaseRoot, "projects");
const repositories = createCanonicalAutomationStudioSQLiteRepositories(globalRoot), authority = await CanonicalAuthorityWholeOperation.fromFactory(repositories, { projectRootDir: projectRoot, projectDatabaseRootDir: databaseRoot });
const pool = new AutomationStudioProjectDatabasePool({ rootDir: databaseRoot }), paths = new AutomationStudioProjectPaths(projectRoot), flowPaths = new AutomationStudioFlowPaths(paths), projects = new AutomationStudioProjectStore(paths, undefined, authority), indexes = new AutomationStudioServiceIndexes(paths, projects, authority), flows = new AutomationStudioFlowStore(paths, flowPaths, projects, indexes, repositories, pool, authority);
const writer = new AutomationStudioFlowWriter(paths, flowPaths, projects, indexes, flows, {}, {}, repositories, {}, pool, authority);
const pause = async () => { process.send({ status: "paused", phase }); await new Promise(() => {}); };
if (phase === "canonical_flow") { const actual = authority.globalEffect.bind(authority); authority.globalEffect = async (...args) => { await actual(...args); if (args[0] === phase) await pause(); }; }
if (["flow_source", "generated_config"].includes(phase)) { const actual = authority.fileEffect.bind(authority); authority.fileEffect = async (...args) => { await actual(...args); if (args[0] === phase) await pause(); }; }
for (const [target, method, at] of [[flows, "writeProjectFlow", "project_flow_document"], [flows, "writeSqlFlowMetadata", "sql_flow_metadata"], [writer, "appendProjectMutationChangeFeed", "project_change_feed"], [Guard.prototype, "completeLegacy", "project_complete"]]) {
  if (phase === at) { const actual = target[method]; target[method] = async function (...args) { const result = await actual.apply(this, args); await pause(); return result; }; }
}
process.send({ status: "ready" });
process.once("message", async message => {
  if (message !== "go") process.exit(2);
  try { const flow = await repositories.flows.get(flowId); await writer.saveFlowInternal({ projectId, flow: { ...flow, name: "Child effect" } }, false); process.send({ status: "completed" }); }
  catch (error) { process.send({ status: "refused", code: String(error.message).includes("unresolved") ? "unresolved" : "other" }); }
  finally { await pool.closeAll(); }
  process.exit(0);
});
