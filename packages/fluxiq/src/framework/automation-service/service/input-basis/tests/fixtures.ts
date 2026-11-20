import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioInputBasisOwner, type AutomationStudioInputBasisOwnerPorts, type AutomationStudioInputScope } from "../../../../../runtime/input-basis/index.ts";
import { AutomationStudioInputBasisStore } from "../index.ts";

export async function withInputBasisStore(run: (fixture: Awaited<ReturnType<typeof opened>>) => Promise<void>, sqlite = false): Promise<void> {
  const parent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(parent, "fluxiq-input-basis-"));
  const pools: AutomationStudioProjectDatabasePool[] = [];
  try {
    if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    await run(await opened(root, pools));
  } finally {
    vi.restoreAllMocks();
    for (const pool of pools) await pool.closeAll();
    const target = await realpath(root);
    expect(path.dirname(target)).toBe(parent);
    expect(path.basename(target)).toMatch(/^fluxiq-input-basis-/);
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

async function opened(root: string, pools: AutomationStudioProjectDatabasePool[]) {
  const scope: AutomationStudioInputScope = { projectId: "project.one", taskId: "task.one", principalId: "principal.one", producerId: "caller" };
  const paths = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
  const projects = {
    ensureProjectStructure: async (projectId: string) => { await mkdir(paths.projectDirectory(projectId), { recursive: true }); },
    findProjectSummary: async () => ({})
  } as unknown as AutomationStudioProjectStore;
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: root, idleCloseMs: 1000 });
  pools.push(pool);
  const snapshots = new AutomationStudioRunDatasets(projects, pool);
  const store = new AutomationStudioInputBasisStore(paths, projects, snapshots);
  const ports: AutomationStudioInputBasisOwnerPorts = { storage: store, scopeAuthority: { authorize: async () => true }, secrecy: { inspect: async () => "nonsecret" } };
  const owner = new AutomationStudioInputBasisOwner(ports);
  return { root, scope, paths, projects, snapshots, store, ports, owner, restart: async () => {
    await pool.closeAll();
    return await opened(root, pools);
  } };
}
