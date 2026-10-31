import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";
import { IdentityAccessService } from "../../../../identity-access/index.ts";
import { AutomationStudioService } from "../../../runtime/index.ts";
import { recordAutomationStudioCreatedProjectOwner, registerAutomationStudioApi } from "../../index.ts";
import { AutomationStudioProjectOwnerships } from "../ownerships.ts";

const services: AutomationStudioService[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(services.splice(0).map((service) => service.close()));
});

function workspace(register = true) {
  const service = new AutomationStudioService({ seedFixture: false });
  services.push(service);
  if (register) registerAutomationStudioApi(new GlobalProgramApiRegistry(), service, new IdentityAccessService());
  return service;
}

describe("the public trusted-host created-project ownership seam", () => {
  it("records the creator through the registered resolver, replacing a migration default", async () => {
    const service = workspace();
    const project = await service.createProject({ name: "A new workspace's project" });
    const ownership = AutomationStudioProjectOwnerships.of(service)!;
    expect(await ownership.ownerOf(project.id)).toBe("admin");
    await recordAutomationStudioCreatedProjectOwner(service, project.id, "new-user");
    expect(await ownership.ownerOf(project.id)).toBe("new-user");
  });

  it("allows the same creator again and refuses a different creator without replacing them", async () => {
    const service = workspace();
    const project = await service.createProject({ name: "One creator" });
    await recordAutomationStudioCreatedProjectOwner(service, project.id, "first-user");
    await recordAutomationStudioCreatedProjectOwner(service, project.id, "first-user");
    await expect(recordAutomationStudioCreatedProjectOwner(service, project.id, "another-user")).rejects.toThrow("already has a recorded creator");
    expect(await AutomationStudioProjectOwnerships.of(service)!.ownerOf(project.id)).toBe("first-user");
  });

  it("fails closed when the service has no registered project ownership resolver", async () => {
    const service = workspace(false);
    const project = await service.createProject({ name: "Not registered" });
    await expect(recordAutomationStudioCreatedProjectOwner(service, project.id, "new-user")).rejects.toThrow("not registered");
  });

  it("refuses nonexistent projects, unusable project ids and empty owners", async () => {
    const service = workspace();
    const project = await service.createProject({ name: "Known project" });
    await expect(recordAutomationStudioCreatedProjectOwner(service, "missing-project", "new-user")).rejects.toThrow("unknown Automation Studio project");
    await expect(recordAutomationStudioCreatedProjectOwner(service, "__proto__", "new-user")).rejects.toThrow("usable project id");
    await expect(recordAutomationStudioCreatedProjectOwner(service, project.id, "")).rejects.toThrow("owner");
    await expect(recordAutomationStudioCreatedProjectOwner(service, project.id, " ")).rejects.toThrow("owner");
    expect(await AutomationStudioProjectOwnerships.of(service)!.ownerOf(project.id)).toBe("admin");
  });

  it("propagates ownership persistence failures and allows a later repair", async () => {
    const service = workspace();
    const project = await service.createProject({ name: "Retry assignment" });
    const ownership = AutomationStudioProjectOwnerships.of(service)!;
    vi.spyOn(ownership, "recordOwner").mockRejectedValueOnce(new Error("owner store unavailable"));
    await expect(recordAutomationStudioCreatedProjectOwner(service, project.id, "new-user")).rejects.toThrow("owner store unavailable");
    await recordAutomationStudioCreatedProjectOwner(service, project.id, "new-user");
    expect(await ownership.ownerOf(project.id)).toBe("new-user");
  });
});
