import type { FluxIQHostPaths } from "../../framework";
import { BackgroundTasksService, registerBackgroundTasksApi } from "../background-tasks";
import { ComputeControlService, registerComputeControlApi } from "../compute-control";
import { DatabaseManagerService, registerDatabaseManagerApi } from "../database-manager";
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
  const backgroundTasks = new BackgroundTasksService();
  const computeControl = new ComputeControlService();
  const databaseManager = new DatabaseManagerService();
  const deploymentSync = new DeploymentSyncService();
  const docs = new DocsService();
  const identityAccess = new IdentityAccessService();
  const productionRunner = new ProductionRunnerService();

  if (paths) {
    docs.registerSource({
      id: "framework-docs",
      title: "Framework Docs",
      rootDir: paths.root,
      scope: "framework"
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
