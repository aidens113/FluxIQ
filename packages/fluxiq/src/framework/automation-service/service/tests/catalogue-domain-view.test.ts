// Covers catalogue.ts `listProjects` and the service's `assertProjectDomainAccess` through
// `projectDomainMatches`: on an instance serving a domain, its global projects and the domain's are one view, while
// another domain stays apart, and an instance serving no domain is unchanged (t915).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { IoRegistry } from "../../../../io/index.ts";
import { AutomationStudioService } from "../../index.ts";

describe("the project list and domain gate on an instance serving a domain", () => {
  let root = "";
  let service: AutomationStudioService | undefined;
  afterEach(async () => {
    await service?.close();
    service = undefined;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const made = async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-catalogue-domain-"));
    service = new AutomationStudioService({ dataDir: path.join(root, "data"), seedFixture: false });
    const global = await service.createProject({ name: "Global" });
    const web = await service.createProject({ name: "Web", domainId: "web" });
    const other = await service.createProject({ name: "Other", domainId: "other" });
    return { service, global: global.id, web: web.id, other: other.id };
  };
  const ids = async (service: AutomationStudioService, domainId: string | null) => (await service.listProjects(domainId)).projects.map((project) => project.id).sort();

  it("lists and opens the instance's global projects with its domain's, from either scope", async () => {
    const { service, global, web, other } = await made();
    service.bindIoRuntime(new IoRegistry(), "web");
    expect(await ids(service, "web")).toEqual([global, web].sort());
    expect(await ids(service, null)).toEqual([global, web].sort());
    expect(await ids(service, "other")).toEqual([other]);
    await expect(service.assertProjectDomainAccess(global, "web")).resolves.toBeUndefined();
    await expect(service.assertProjectDomainAccess(web, null)).resolves.toBeUndefined();
    await expect(service.assertProjectDomainAccess(other, "web")).rejects.toThrow("unavailable in this domain scope");
    await expect(service.assertProjectDomainAccess(global, "other")).rejects.toThrow("unavailable in this domain scope");
    // A global project stays global on disk.
    expect((await service.listProjects("web")).projects.find((project) => project.id === global)?.domainId).toBeNull();
  });

  it("keeps every domain apart on an instance serving none", async () => {
    const { service, global, web, other } = await made();
    expect(await ids(service, null)).toEqual([global]);
    expect(await ids(service, "web")).toEqual([web]);
    expect(await ids(service, "other")).toEqual([other]);
    await expect(service.assertProjectDomainAccess(global, "web")).rejects.toThrow("unavailable in this domain scope");
    await expect(service.assertProjectDomainAccess(web, null)).rejects.toThrow("unavailable in this domain scope");
  });
});
