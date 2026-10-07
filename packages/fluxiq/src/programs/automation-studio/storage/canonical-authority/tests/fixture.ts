import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { CanonicalAuthorityOwnerStore } from "../owner-store.ts";
import { CanonicalAuthorityProjectCoordinator } from "../project-coordinator.ts";
import type { CanonicalAuthorityCapability, CanonicalAuthorityOperation } from "../contracts.ts";

type Created = { capability: CanonicalAuthorityCapability; record: CanonicalAuthorityOperation; document: JsonObject & { flowId: string } };
export async function canonicalFixture(run: (fixture: { root: string; owners: CanonicalAuthorityOwnerStore; coordinator: CanonicalAuthorityProjectCoordinator; create: (projectId?: string) => Promise<Created>; options: { projectRootDir: string; projectDatabaseRootDir: string } }) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "canonical-authority-"));
  const options = { projectRootDir: path.join(root, "projects"), projectDatabaseRootDir: root };
  await new ProgramJsonStore(path.join(options.projectRootDir, "index.json"), () => ({})).write({ projects: [{ id: "original-project" }, { id: "foreign-project" }] });
  for (const id of ["original-project", "foreign-project"]) await new ProgramJsonStore(path.join(options.projectRootDir, id, "manifest.json"), () => ({})).write({ id });
  const owners = new CanonicalAuthorityOwnerStore(root, options); await owners.installRouting();
  const coordinator = new CanonicalAuthorityProjectCoordinator(owners, options);
  // Private creation reflection is infrastructure proof, not a supported product ingress.
  const creator = owners as unknown as { createFlow(projectId: string, contents: JsonObject): Promise<Created> };
  try { await run({ root, owners, coordinator, options, create: (projectId = "original-project") => creator.createFlow(projectId, { scope: { kind: "global" }, publication: { status: "draft" }, name: "isolated" }) }); }
  finally { const resolved = path.resolve(root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("canonical-authority-")) throw new Error("Unsafe fixture cleanup"); await rm(resolved, { recursive: true, force: true }); }
}
