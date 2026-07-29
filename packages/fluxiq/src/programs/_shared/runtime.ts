import path from "node:path";
import type { FluxIQHostPaths } from "../../framework";
import { AutomationStudioService, registerAutomationStudioApi } from "../automation-studio";
import { BackgroundTasksService, registerBackgroundTasksApi } from "../background-tasks";
import { ComputeControlService, registerComputeControlApi } from "../compute-control";
import { DatabaseManagerService, registerDatabaseManagerApi, SQLiteRepository } from "../database-manager";
import { DeploymentSyncService, registerDeploymentSyncApi } from "../deployment-sync";
import { DocsService, registerDocsApi } from "../docs";
import { IdentityAccessService, registerIdentityAccessApi } from "../identity-access";
import { ProductionRunnerService, registerProductionRunnerApi } from "../production-runner";
import { GlobalProgramApiRegistry } from "./api";
import { registerGlobalDocumentationGenerators } from "./docs-generators";

export type GlobalProgramRuntime = {
  api: GlobalProgramApiRegistry;
  automationStudio: AutomationStudioService;
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
  const automationStudio = new AutomationStudioService(storageOptions);
  const backgroundTasksRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: "background.tasks" }) : undefined;
  const identityUsersRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: "identity.users" }) : undefined;
  const backgroundTasks = new BackgroundTasksService(backgroundTasksRepository ? { repository: backgroundTasksRepository } : {});
  const computeControl = new ComputeControlService(storageOptions);
  const databaseManager = new DatabaseManagerService(storageOptions);
  const deploymentSync = new DeploymentSyncService(undefined, paths ? { ...storageOptions, rootDir: paths.root } : storageOptions);
  const docs = new DocsService(paths ? { ...storageOptions, docsRootDir: path.join(paths.root, "docs"), generatedRootDir: path.join(paths.root, "docs", "generated") } : storageOptions);
  const identityAccess = new IdentityAccessService(identityUsersRepository ? { repository: identityUsersRepository } : {});
  const productionRunner = new ProductionRunnerService(undefined, storageOptions);

  if (paths) {
    databaseManager
      .registerRepository("identity.users", identityUsersRepository!)
      .registerRepository("background.tasks", backgroundTasksRepository!)
      .registerRepository("compute.nodes", new SQLiteRepository({ rootDir: paths.databases, kind: "compute.nodes" }))
      .registerRepository("deployment.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "deployment.targets" }))
      .registerRepository("production.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "production.targets" }));

    docs.registerSource({
      id: "framework-docs",
      title: "Framework Docs",
      rootDir: path.join(paths.root, "docs"),
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

  registerAutomationStudioApi(api, automationStudio, identityAccess);
  registerBackgroundTasksApi(api, backgroundTasks);
  registerComputeControlApi(api, computeControl);
  registerDatabaseManagerApi(api, databaseManager, identityAccess);
  registerDeploymentSyncApi(api, deploymentSync);
  registerDocsApi(api, docs);
  registerIdentityAccessApi(api, identityAccess);
  registerProductionRunnerApi(api, productionRunner);

  if (paths) {
    registerGlobalDocumentationGenerators({
      docs,
      api,
      backgroundTasks,
      databaseManager,
      deploymentSync,
      rootDir: paths.root
    });
  }

  return {
    api,
    automationStudio,
    backgroundTasks,
    computeControl,
    databaseManager,
    deploymentSync,
    docs,
    identityAccess,
    productionRunner
  };
}
