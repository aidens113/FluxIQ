import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { IdentityAccessService } from "../../../../identity-access/index.ts";
import { AutomationStudioService } from "../../../runtime/index.ts";
import { registerAutomationStudioApi } from "../../handlers/index.ts";
import { AutomationStudioProjectOwnerDocumentStore } from "../document-store.ts";
import { AutomationStudioProjectOwnerMemoryStore } from "../memory-store.ts";
import { AutomationStudioProjectOwnerships } from "../ownerships.ts";

const roots: string[] = [];
const services: AutomationStudioService[] = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function track(service: AutomationStudioService): AutomationStudioService {
  services.push(service);
  return service;
}

describe("AutomationStudioProjectOwnerships", () => {
  it("persists owners beside the projects, across a re-created service", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-ownerships-"));
    roots.push(root);
    const dataDir = path.join(root, ".fluxiq", "data");
    const identity = new IdentityAccessService();
    const first = track(new AutomationStudioService({ dataDir, seedFixture: false }));
    const migrated = await first.createProject({ name: "Before ownership" });
    const created = await first.createProject({ name: "Created by a user" });
    const ownership = AutomationStudioProjectOwnerships.create(first, identity);
    expect(AutomationStudioProjectOwnerships.of(first)).toBe(ownership);
    expect(AutomationStudioProjectOwnerships.storeFor(first)).toBeInstanceOf(AutomationStudioProjectOwnerDocumentStore);
    await ownership.recordOwner(created.id, "creator-1");
    expect(await ownership.ownerOf(migrated.id)).toBe("admin");
    expect(await ownership.ownerOf("no-such-project")).toBeNull();

    const file = path.join(dataDir, "programs", "automation-studio", "ownership", "projects.json");
    const stored = JSON.parse(await readFile(file, "utf8")) as { data: { projects: Record<string, { userId: string; source: string }> } };
    expect(stored.data.projects[created.id]).toMatchObject({ userId: "creator-1", source: "creator" });
    expect(stored.data.projects[migrated.id]).toMatchObject({ userId: "admin", source: "default" });

    await first.close();
    services.splice(services.indexOf(first), 1);
    const second = track(new AutomationStudioService({ dataDir, seedFixture: false }));
    // No Identity Access this time, so nothing could be defaulted: every answer below was persisted.
    const reopened = AutomationStudioProjectOwnerships.create(second, undefined);
    expect(await reopened.ownerOf(created.id)).toBe("creator-1");
    expect(await reopened.ownerOf(migrated.id)).toBe("admin");
    const listed = await reopened.withProjectOwners((await second.listProjects()).projects);
    expect(listed.map((project) => [project.name, project.ownerUserId]).sort()).toEqual([["Before ownership", "admin"], ["Created by a user", "creator-1"]]);
  });

  it("keeps the owners of a service without storage in memory", async () => {
    const service = track(new AutomationStudioService({ seedFixture: false }));
    expect(AutomationStudioProjectOwnerships.storeFor(service)).toBeInstanceOf(AutomationStudioProjectOwnerMemoryStore);
    const project = await service.createProject({ name: "In memory" });
    expect(await AutomationStudioProjectOwnerships.create(service, new IdentityAccessService()).ownerOf(project.id)).toBe("admin");
    expect(await AutomationStudioProjectOwnerships.create(service, undefined).ownerOf(project.id)).toBeNull();
  });

  it("is registered as the registry's project owner resolver by registerAutomationStudioApi", async () => {
    const service = track(new AutomationStudioService({ seedFixture: false }));
    const registry = new GlobalProgramApiRegistry();
    const registerResourceOwners = vi.spyOn(registry, "registerResourceOwners");
    registerAutomationStudioApi(registry, service, new IdentityAccessService());
    const ownership = AutomationStudioProjectOwnerships.of(service);
    expect(ownership).toBeDefined();
    expect(registerResourceOwners).toHaveBeenCalledTimes(1);
    expect(registerResourceOwners).toHaveBeenCalledWith("project", ownership);
  });
});
