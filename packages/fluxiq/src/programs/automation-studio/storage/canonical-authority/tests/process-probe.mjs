import path from "node:path";
import { pathToFileURL } from "node:url";
const [root, action, resourceId] = process.argv.slice(2);
const base = path.join(process.cwd(), "dist/programs/automation-studio/storage");
const { CanonicalAuthorityOwnerStore } = await import(pathToFileURL(path.join(base, "canonical-authority/owner-store.js")).href);
const { CanonicalAuthorityProjectCoordinator } = await import(pathToFileURL(path.join(base, "canonical-authority/project-coordinator.js")).href);
const { SQLiteRepository } = await import(pathToFileURL(path.join(process.cwd(), "dist/programs/database-manager/storage/sqlite-repository.js")).href);
const options = { projectRootDir: path.join(root, "projects"), projectDatabaseRootDir: root };
const owners = new CanonicalAuthorityOwnerStore(root, options);
process.send({ status: "ready" });
process.once("message", async message => {
  if (message !== "go") process.exit(2);
  try {
    const canonical = await new SQLiteRepository({ rootDir: root, kind: "automation.flows", layoutVersion: 2 }).get(resourceId);
    const document = canonical.data.document;
    const admitted = action === "allocation-race" ? await owners.createPublication(resourceId, { version: "1.0.0", snapshot: { scope: { kind: "global" } } }) : await owners.reserve("automation.flows", resourceId, "put", document);
    if (action === "effect" || action === "project-complete") {
      if (action === "project-complete") owners.finalize = async () => { process.send({ status: "project-complete", operationKey: admitted.record.request.operationKey }); await new Promise(() => {}); };
      await new CanonicalAuthorityProjectCoordinator(owners, options).perform(admitted, document, action !== "effect");
    }
    process.send({ status: action === "effect" ? "effect" : "reserved", operationKey: admitted.record.request.operationKey });
    if (action === "race" || action === "allocation-race") process.exit(0);
    setInterval(() => {}, 1000);
  } catch (error) { process.send({ status: "refused", code: String(error.message).includes("unresolved") ? "unresolved" : String(error.message).includes("allocated") ? "allocated" : "other" }); process.exit(0); }
});
