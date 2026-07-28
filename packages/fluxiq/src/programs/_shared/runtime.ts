import type { FluxIQHostPaths } from "../../framework";
import { BackgroundTasksService, registerBackgroundTasksApi } from "../background-tasks";
import { ComputeControlService, registerComputeControlApi } from "../compute-control";
import { DatabaseManagerService, registerDatabaseManagerApi, SQLiteRepository } from "../database-manager";
import { DeploymentSyncService, registerDeploymentSyncApi } from "../deployment-sync";
import { DocsService, registerDocsApi } from "../docs";
import { IdentityAccessService, registerIdentityAccessApi } from "../identity-access";
import { ProductionRunnerService, registerProductionRunnerApi } from "../production-runner";
import { GlobalProgramApiRegistry } from "./api";

export type GlobalProgramRuntime = {
  api: GlobalProgramApiRegistry;
  backgroundTasks: BackgroundTasksService;
  computeControl: ComputeControlService;
  databaseManager: DatabaseManagerService;
  deploymentSync: DeploymentSyncService;
  docs: DocsService;
  identityAccess: IdentityAccessService;
  productionRunner: ProductionRunnerService;
};

export function createGlobalProgramRuntime(paths?: FluxIQHostPaths): GlobalProgramRuntime {
  const api = new GlobalProgramApiRegistry();
  const storageOptions = paths ? { dataDir: paths.data } : {};
  const backgroundTasksRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: "background.tasks" }) : undefined;
  const backgroundTasks = new BackgroundTasksService(backgroundTasksRepository ? { repository: backgroundTasksRepository } : {});
  const computeControl = new ComputeControlService(storageOptions);
  const databaseManager = new DatabaseManagerService(storageOptions);
  const deploymentSync = new DeploymentSyncService(undefined, paths ? { ...storageOptions, rootDir: paths.root } : storageOptions);
  const docs = new DocsService(storageOptions);
  const identityAccess = new IdentityAccessService(storageOptions);
  const productionRunner = new ProductionRunnerService(undefined, storageOptions);

  if (paths) {
    databaseManager
      .registerRepository("identity.users", new SQLiteRepository({ rootDir: paths.databases, kind: "identity.users" }))
      .registerRepository("background.tasks", backgroundTasksRepository!)
      .registerRepository("compute.nodes", new SQLiteRepository({ rootDir: paths.databases, kind: "compute.nodes" }))
      .registerRepository("deployment.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "deployment.targets" }))
      .registerRepository("production.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "production.targets" }));

    docs.registerSource({
      id: "framework-docs",
      title: "Framework Docs",
      rootDir: paths.root,
      scope: "framework"
    });

    backgroundTasks.register({
      id: "docs.rebuild",
      name: "Rebuild Documentation Cache",
      queue: "maintenance",
      enabled: true,
      schedule: "Every 24 hours",
      intervalMs: 86_400_000,
      nextRunAtMs: Date.now() + 86_400_000,
      metadata: { programId: "docs" }
    }, async () => {
      const snapshot = await docs.rebuild();
      return { pages: snapshot.pages.length, sources: snapshot.sources.length };
    });

  }

  registerBackgroundTasksApi(api, backgroundTasks);
  registerComputeControlApi(api, computeControl);
  registerDatabaseManagerApi(api, databaseManager);
  registerDeploymentSyncApi(api, deploymentSync);
  registerDocsApi(api, docs);
  registerIdentityAccessApi(api, identityAccess);
  registerProductionRunnerApi(api, productionRunner);

  return {
    api,
    backgroundTasks,
    computeControl,
    databaseManager,
    deploymentSync,
    docs,
    identityAccess,
    productionRunner
  };
}
