import { describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../runtime/index.ts";
import { automationStudioServiceProjectCatalog } from "../service-catalog.ts";

describe("automationStudioServiceProjectCatalog", () => {
  it("knows global and domain-scoped projects of a real service, and not an unknown id", async () => {
    const service = new AutomationStudioService({ seedFixture: false });
    try {
      const global = await service.createProject({ name: "Global" });
      const scoped = await service.createProject({ name: "Scoped", domainId: "web-automation" });
      const catalog = automationStudioServiceProjectCatalog(service);
      expect(await catalog.hasProject(global.id)).toBe(true);
      expect(await catalog.hasProject(scoped.id)).toBe(true);
      expect(await catalog.hasProject("no-such-project")).toBe(false);
    } finally {
      await service.close();
    }
  });

  it("rethrows a failure that is not an unknown project", async () => {
    const failure = new Error("storage unavailable");
    const catalog = automationStudioServiceProjectCatalog({ assertProjectDomainAccess: async () => { throw failure; } });
    await expect(catalog.hasProject("p1")).rejects.toBe(failure);
  });
});
