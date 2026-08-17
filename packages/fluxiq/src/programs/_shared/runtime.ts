import path from "node:path";
import { ClientGatewayService, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../client-gateway/index.ts";
import type { JsonObject } from "../../core/index.ts";
import type { FluxIQHostPaths } from "../../framework/index.ts";
import { AutomationStudioClientGatewayBridge, AutomationStudioService, registerAutomationStudioApi } from "../automation-studio/index.ts";
import { BackgroundTasksService, registerBackgroundTasksApi } from "../background-tasks/index.ts";
import { ComputeControlService, registerComputeControlApi } from "../compute-control/index.ts";
import { DatabaseManagerService, registerDatabaseManagerApi, SQLiteRepository } from "../database-manager/index.ts";
import { DeploymentSyncService, registerDeploymentSyncApi } from "../deployment-sync/index.ts";
import { DocsService, registerDocsApi } from "../docs/index.ts";
import { IdentityAccessService, registerIdentityAccessApi } from "../identity-access/index.ts";
import { ProductionRunnerService, registerProductionRunnerApi } from "../production-runner/index.ts";
import { GlobalProgramApiRegistry } from "./api.ts";
import { registerGlobalDocumentationGenerators } from "./docs-generators.ts";
import { ProgramJsonStore, programDataFile } from "./storage.ts";

export type GlobalProgramRuntime = {
  api: GlobalProgramApiRegistry;
  automationStudio: AutomationStudioService;
  clientGateway: ClientGatewayService;
  automationStudioClientGateway: AutomationStudioClientGatewayBridge;
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
  const storageLayoutVersion = paths && path.basename(paths.config) === "config.json" ? 2 : 1;
  const storageOptions = paths ? { dataDir: paths.data } : {};
  const automationStudio = new AutomationStudioService(paths && storageLayoutVersion === 2
      ? {
        storageRootDir: paths.recordings,
        customNodeRootDir: path.join(paths.domainPrograms, "automation-studio", "nodes")
      }
    : storageOptions);
  const trustedClientTtlMs = positiveNumber(process.env.FLUXIQ_CLIENT_GATEWAY_TRUST_TTL_MS);
  const clientGateway = new ClientGatewayService({
    enabled: process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED !== "false",
    ...(paths ? { trustedClientStore: createClientGatewayTrustedClientStore(paths.data) } : {}),
    ...(trustedClientTtlMs ? { trustedClientTtlMs } : {}),
    ...(process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ? { publicUrl: process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL } : {})
  });
  const automationStudioClientGateway = new AutomationStudioClientGatewayBridge({ gateway: clientGateway, automationStudio });
  const backgroundTasksRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: "background.tasks", layoutVersion: storageLayoutVersion }) : undefined;
  const identityUsersRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: "identity.users", layoutVersion: storageLayoutVersion }) : undefined;
  const backgroundTasks = new BackgroundTasksService(backgroundTasksRepository ? { repository: backgroundTasksRepository } : {});
  const computeControl = new ComputeControlService(storageOptions);
  const databaseManager = new DatabaseManagerService(storageOptions);
  const deploymentSync = new DeploymentSyncService(undefined, paths ? { ...storageOptions, rootDir: paths.root } : storageOptions);
  const docsRootDir = paths ? path.join(paths.root, "docs") : undefined;
  const runtimeDocsRootDir = paths ? path.join(paths.cache ?? path.join(paths.fluxiq, "cache"), "docs") : undefined;
  const docs = new DocsService(paths ? {
    ...storageOptions,
    docsRootDir: docsRootDir!,
    generatedRootDir: runtimeDocsRootDir!,
    allowedSourceRootDirs: [docsRootDir!, runtimeDocsRootDir!]
  } : storageOptions);
  const identityAccess = new IdentityAccessService(identityUsersRepository ? { repository: identityUsersRepository } : {});
  const productionRunner = new ProductionRunnerService(undefined, storageOptions);

  if (paths) {
    databaseManager
      .registerRepository("identity.users", identityUsersRepository!)
      .registerRepository("background.tasks", backgroundTasksRepository!)
      .registerRepository("compute.nodes", new SQLiteRepository({ rootDir: paths.databases, kind: "compute.nodes", layoutVersion: storageLayoutVersion }))
      .registerRepository("deployment.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "deployment.targets", layoutVersion: storageLayoutVersion }))
      .registerRepository("production.targets", new SQLiteRepository({ rootDir: paths.databases, kind: "production.targets", layoutVersion: storageLayoutVersion }));

    docs.registerSource({
      id: "framework-docs",
      title: "Authored Documentation",
      rootDir: docsRootDir!,
      scope: "framework"
    });
    docs.registerSource({
      id: "runtime-docs",
      title: "Runtime Snapshot",
      rootDir: runtimeDocsRootDir!,
      scope: "program"
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

  registerAutomationStudioApi(api, automationStudio, identityAccess, automationStudioClientGateway, clientGateway);
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
    clientGateway,
    automationStudioClientGateway,
    backgroundTasks,
    computeControl,
    databaseManager,
    deploymentSync,
    docs,
    identityAccess,
    productionRunner
  };
}

function createClientGatewayTrustedClientStore(dataDir: string): ClientGatewayTrustedClientStore {
  const store = new ProgramJsonStore<JsonObject>(programDataFile(dataDir, "client-gateway", "trusted-clients.json"), () => ({ clients: [] }));
  return {
    async load() {
      const data = await store.read();
      return Array.isArray(data.clients) ? data.clients as unknown as ClientGatewayTrustedClient[] : [];
    },
    async save(clients) {
      await store.write({ clients: clients as unknown as JsonObject[] });
    }
  };
}

function positiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
