import path from "node:path";
import { ClientGatewayService, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../client-gateway/index.ts";
import type { JsonObject } from "../../core/index.ts";
import type { FluxIQHostPaths } from "../../framework/index.ts";
import { ClientGatewayRuntimeTransport, FileRuntimeStore, RuntimeService } from "../../runtime/index.ts";
import { automationStudioRuntimeSessionGrantTaskKinds, AutomationStudioClientGatewayBridge, AutomationStudioLlmExecutionGrantService, AutomationStudioService, createAutomationStudioResultCheckProvider, registerAutomationStudioApi } from "../automation-studio/index.ts";
import { BackgroundTasksService, registerBackgroundTasksApi } from "../background-tasks/index.ts";
import { ComputeControlService, registerComputeControlApi } from "../compute-control/index.ts";
import { DatabaseManagerService, registerDatabaseManagerApi, SQLiteRepository } from "../database-manager/index.ts";
import { DeploymentSyncService, registerDeploymentSyncApi } from "../deployment-sync/index.ts";
import { DocsService, registerDocsApi } from "../docs/index.ts";
import { IdentityAccessService, registerIdentityAccessApi, type IdentityCredentialChangeSubscriber } from "../identity-access/index.ts";
import { ProductionRunnerService, registerProductionRunnerApi } from "../production-runner/index.ts";
import { registerRuntimeApi } from "../runtime-control/index.ts";
import { registerSecretKeysApi, SecretKeysService } from "../secret-keys/index.ts";
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
  runtime: RuntimeService;
  secretKeys: SecretKeysService;
  llmExecutionGrants: AutomationStudioLlmExecutionGrantService;
};

export function createGlobalProgramRuntime(paths?: FluxIQHostPaths): GlobalProgramRuntime {
  const storageLayoutVersion = paths && path.basename(paths.config) === "config.json" ? 2 : 1;
  const storageOptions = paths ? { dataDir: paths.data } : {};
  const secretKeysRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: SecretKeysService.storeKind, layoutVersion: storageLayoutVersion }) : undefined;
  // Built before Automation Studio, which takes the standing result-check
  // provider at construction: an unattended check is not a grant, so there is
  // nothing to bind afterwards the way an execution grant is.
  const secretKeys = new SecretKeysService(secretKeysRepository ? { repository: secretKeysRepository } : {});
  // What a Flow's standing authorization buys, for a run nobody is watching:
  // the model that judges its result, and -- since the repair clause -- the
  // model that repairs it when it fails. One resolver serves both, because
  // obtaining the key is the host's business either way and nothing here knows
  // or cares what Core will ask the model. The scope, the ceiling and the
  // expiry all bind in Core before this is reached, and the model Core hands a
  // recovery refuses any task kind the redemption did not cover.
  //
  // Deliberately not routed through the execution grant service: that refuses
  // without a live actor session, and widening it would let unattended work
  // reach `explore_and_adapt` and the Flow-building kinds too. Core has already
  // decided that this run is checked or repaired and that the authorization
  // covers it; what reaches here is the key, the person's own key unlock, and
  // the ceiling for this one redemption.
  const resultCheckProviderResolver = (request: Parameters<typeof createAutomationStudioResultCheckProvider>[0]["scope"]) => createAutomationStudioResultCheckProvider({
    ports: {
      getKeySummary: (id) => secretKeys.getKeySummary(id),
      createSessionRevealAuthorization: (input) => secretKeys.createSessionRevealAuthorization(input),
      revealKeyWithAuthorization: (input) => secretKeys.revealKeyWithAuthorization(input),
      revokeRevealAuthorization: (authorizationId) => secretKeys.revokeRevealAuthorization(authorizationId)
    },
    scope: request
  });
  const automationStudio = new AutomationStudioService(paths && storageLayoutVersion === 2
      ? {
        storageRootDir: paths.recordings,
        customNodeRootDir: path.join(paths.domainPrograms, "automation-studio", "nodes"),
        resultCheckProviderResolver
      }
    : { ...storageOptions, resultCheckProviderResolver });
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
  // Identity Access takes its credential-change subscribers only at construction, so Secret Keys is built first.
  const identityAccess = new IdentityAccessService({
    repository: identityUsersRepository,
    credentialChangeSubscribers: [secretKeysCredentialChangeSubscriber(secretKeys)]
  });
  // The registry, not each handler, asks for the operator's PIN before a
  // `destructive` endpoint runs, so it is built once Identity Access exists.
  const api = new GlobalProgramApiRegistry({ identityAccess });
  const llmExecutionGrants = new AutomationStudioLlmExecutionGrantService({ identityAccess, secretKeys, resolveExecutionDigest: async (projectId, flowId) => automationStudio.getLlmExecutionBinding(projectId, flowId) });
  automationStudio.bindLlmExecutionProvider(
    (input) => input.executionGrant
      ? llmExecutionGrants.resolve(
        { ...input.executionGrant, projectId: input.projectId, flowId: input.flowId },
        // What each entry point may spend its grant on. Narrower than the grant
        // itself: Flow bootstrap gathers and builds, a runtime recovery
        // diagnoses, gathers and repairs, and neither reaches the other's kinds.
        { allowedTaskKinds: input.executionGrant.purpose === "build_and_adapt"
          ? ["flow_bootstrap", "evidence_tool_decision"]
          : automationStudioRuntimeSessionGrantTaskKinds(input.executionGrant.purpose) }
      )
      : undefined,
    (grantId) => llmExecutionGrants.revoke(grantId),
    () => llmExecutionGrants.close()
  );
  const productionRunner = new ProductionRunnerService(undefined, storageOptions);
  const runtime = new RuntimeService(paths ? { store: new FileRuntimeStore({ rootDir: path.join(paths.artifacts ?? path.join(paths.fluxiq, "artifacts"), "runtime") }) } : {});
  runtime.registerTransport(new ClientGatewayRuntimeTransport({ gateway: clientGateway }));
  automationStudio.bindRuntimeService(runtime);

  if (paths) {
    databaseManager
      .registerRepository("identity.users", identityUsersRepository!)
      .registerRepository(SecretKeysService.storeKind, secretKeysRepository!)
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

  registerAutomationStudioApi(api, automationStudio, identityAccess, automationStudioClientGateway, clientGateway, llmExecutionGrants);
  registerBackgroundTasksApi(api, backgroundTasks);
  registerComputeControlApi(api, computeControl);
  registerDatabaseManagerApi(api, databaseManager, identityAccess);
  registerDeploymentSyncApi(api, deploymentSync);
  registerDocsApi(api, docs);
  registerIdentityAccessApi(api, identityAccess);
  registerSecretKeysApi(api, secretKeys, identityAccess);
  registerProductionRunnerApi(api, productionRunner);
  registerRuntimeApi(api, runtime);

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
    productionRunner,
    runtime,
    secretKeys
    , llmExecutionGrants
  };
}

/**
 * Re-seals a user's Secret Keys under the new password when that user changes
 * their own password: prepared before Identity Access writes the credential,
 * committed after it, discarded if the change is refused. An administrator's
 * reset of another account carries no current password, so keys sealed under
 * the old one cannot be opened; they are left as they are and stay unreadable
 * with the new password.
 */
function secretKeysCredentialChangeSubscriber(secretKeys: SecretKeysService): IdentityCredentialChangeSubscriber {
  const prepared = new Map<string, string>();
  const take = (identityChangeId: string): string | undefined => {
    const secretChangeId = prepared.get(identityChangeId);
    prepared.delete(identityChangeId);
    return secretChangeId;
  };
  return {
    async prepare(change) {
      if (!change.currentPassword) return;
      const { changeId } = await secretKeys.prepareCredentialChange({
        userId: change.userId,
        currentPassword: change.currentPassword,
        nextPassword: change.newPassword
      });
      prepared.set(change.changeId, changeId);
    },
    async commit(change) {
      const secretChangeId = take(change.changeId);
      if (secretChangeId) await secretKeys.commitCredentialChange(secretChangeId);
    },
    async abort(change) {
      const secretChangeId = take(change.changeId);
      if (secretChangeId) secretKeys.abortCredentialChange(secretChangeId);
    }
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
