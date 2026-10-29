import path from "node:path";
import { ClientGatewayService, type ClientGatewayTrustedClient, type ClientGatewayTrustedClientStore } from "../../client-gateway/index.ts";
import type { JsonObject } from "../../core/index.ts";
import type { FluxIQHostPaths } from "../../framework/index.ts";
import { ClientGatewayRuntimeTransport, FileRuntimeStore, RuntimeService } from "../../runtime/index.ts";
import { AutomationStudioClientGatewayBridge, automationStudioActivityHub, AutomationStudioHostLeaseScope, automationStudioActivityRunScope, automationStudioCandidateStartHookFromEnvironment, AutomationStudioService, automationStudioPanelCommandKeyFromSecretKeys, createAutomationStudioDeepSeekPanelCommandModel, createAutomationStudioResultCheckProvider, createAutomationStudioSessionKeyProviderResolver, registerAutomationStudioApi } from "../automation-studio/index.ts";
import { AutomationStudioChannelScope } from "../automation-studio/runtime/environment/index.ts";
import { automationStudioClientGatewayTraceEnabled } from "../automation-studio/runtime/gateway-trace/index.ts";
import { AutomationStudioGatewayTraceServicePools, createAutomationStudioGatewayTraceHost } from "../automation-studio/runtime/gateway-trace/wiring/index.ts";
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
};

export function createGlobalProgramRuntime(paths?: FluxIQHostPaths, options: { modelProvidersEnabled?: boolean } = {}): GlobalProgramRuntime {
  const modelProvidersEnabled = options.modelProvidersEnabled !== false;
  const storageLayoutVersion = paths && path.basename(paths.config) === "config.json" ? 2 : 1;
  const storageOptions = paths ? { dataDir: paths.data } : {};
  const secretKeysRepository = paths ? new SQLiteRepository({ rootDir: paths.databases, kind: SecretKeysService.storeKind, layoutVersion: storageLayoutVersion }) : undefined;
  // Built before Automation Studio, which takes the standing result-check
  // provider at construction.
  const secretKeys = new SecretKeysService(secretKeysRepository ? { repository: secretKeysRepository } : {});
  // What a Flow's standing authorization buys, for a run nobody is watching:
  // the model that judges its result, and -- since the repair clause -- the
  // model that repairs it when it fails. One resolver serves both, because
  // obtaining the key is the host's business either way and nothing here knows
  // or cares what Core will ask the model. The scope, the ceiling and the
  // expiry all bind in Core before this is reached, and the model Core hands a
  // recovery refuses any task kind the redemption did not cover.
  //
  // A run nobody is watching has no live session to release a key to, so it
  // draws the key from the unlock the person left for it; what reaches here is
  // the key, that unlock, and the ceiling for this one redemption.
  const resultCheckProviderResolver = (request: Parameters<typeof createAutomationStudioResultCheckProvider>[0]["scope"]) => createAutomationStudioResultCheckProvider({
    ports: {
      getKeySummary: (id) => secretKeys.getKeySummary(id),
      createSessionRevealAuthorization: (input) => secretKeys.createSessionRevealAuthorization(input),
      revealKeyWithAuthorization: (input) => secretKeys.revealKeyWithAuthorization(input),
      revokeRevealAuthorization: (authorizationId) => secretKeys.revokeRevealAuthorization(authorizationId)
    },
    scope: request
  });
  // The candidate start hook (decision D1): deployment configuration, unset in
  // every product deployment. A test facility that owns the target points it
  // at its own reset of that target (`FLUXIQ_CANDIDATE_START_URL`, with the
  // optional `FLUXIQ_CANDIDATE_START_TOKEN`); a half-set or malformed value
  // refuses here, as the host starts.
  //
  // Client gateway traces (traces and offline trials, P2, D11): unset in every
  // product deployment, so nothing is built and the gateway is handed no
  // source. The Lab turns it on for every Core it starts. On, the episodes
  // write through the service's own per-project pool, asked for only when an
  // episode opens (the service is built below, after the start hook it is
  // handed), and the start hook's answers are recorded into the build's trace.
  const gatewayTrace = createAutomationStudioGatewayTraceHost({
    enabled: automationStudioClientGatewayTraceEnabled(process.env),
    pool: () => AutomationStudioGatewayTraceServicePools.of(automationStudio)
  });
  const prepareCandidateStart = gatewayTrace.startHook(automationStudioCandidateStartHookFromEnvironment(process.env));
  const automationStudio = new AutomationStudioService(paths && storageLayoutVersion === 2
      ? {
        storageRootDir: paths.recordings,
        customNodeRootDir: path.join(paths.domainPrograms, "automation-studio", "nodes"),
        ...(modelProvidersEnabled ? { resultCheckProviderResolver } : {}),
        ...(prepareCandidateStart ? { prepareCandidateStart } : {})
      }
    : { ...storageOptions, ...(modelProvidersEnabled ? { resultCheckProviderResolver } : {}), ...(prepareCandidateStart ? { prepareCandidateStart } : {}) });
  const trustedClientTtlMs = positiveNumber(process.env.FLUXIQ_CLIENT_GATEWAY_TRUST_TTL_MS);
  const clientGateway = new ClientGatewayService({
    resolveCommandLedger: context => automationStudio.commandExecution.owns(context) ? automationStudio.commandExecution.resolve(context) : automationStudio.commandContexts.resolve(context),
    // The run a command is sent from, so a result that comes after Core stopped waiting is put on that run (C8).
    commandOwner: automationStudioActivityRunScope,
    // The host lease a command is sent under, stamped on it; a stale or foreign one is refused unsent (automation-project-agents-plan).
    hostLease: AutomationStudioHostLeaseScope.gatewaySource,
    // The channel scope a command is sent and a session list read from: an offline run's work sees and reaches only its own sessions, and live work never sees those (traces and offline trials, P1). No scope is entered yet, so every caller is live.
    channelScope: AutomationStudioChannelScope.gatewaySource,
    // The trace the dispatching async context records into: what the gateway sends and receives for a build, trial or run goes into that episode's trace (traces and offline trials, P2, D8). Passed only when tracing is on.
    ...(gatewayTrace.source ? { trace: gatewayTrace.source } : {}),
    enabled: process.env.FLUXIQ_CLIENT_GATEWAY_ENABLED !== "false",
    ...(paths ? { trustedClientStore: createClientGatewayTrustedClientStore(paths.data) } : {}),
    ...(trustedClientTtlMs ? { trustedClientTtlMs } : {}),
    ...(process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL ? { publicUrl: process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL } : {})
  });
  // Offline-first trials in builds (trace plan P6, D44): on whenever tracing is, over this gateway and the trace host's stores; `FLUXIQ_OFFLINE_TRIALS=0` turns them off. The trace host's `uninstall` removes them with its episodes.
  gatewayTrace.installOfflineTrials(clientGateway);
  const automationStudioClientGateway = new AutomationStudioClientGatewayBridge({ gateway: clientGateway, automationStudio });
  // A late action result is put on its run's evidence and never applied. The write is awaited, so a failed one is audited by the gateway (`command.late_result_unrecorded`), never left unhandled.
  clientGateway.onLateActionResult(async (late) => {
    await automationStudio.lateActionResults.record(late);
  });
  // What a build or run is doing reaches the paired clients of its project that asked for it (`server.activity`), never queued.
  automationStudioActivityHub.subscribe((activity) => { clientGateway.publishActivity(activity, { projectId: activity.subject.projectId }); });
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
  // A revoked session's unlock goes with it: a sign-out, an administrator's
  // revoke (by raw id or by the digest the panel lists), `revokeUserSessions`
  // and `deleteUser` each tell Secret Keys the raw id and who revoked it, and
  // Secret Keys drops the unlock only for its own user or an administrator.
  identityAccess.subscribeSessionRevocation((sessionId, revoker) => {
    secretKeys.revokeSessionUnlock(sessionId, revoker);
  });
  // The registry, not each handler, asks for the operator's PIN before a
  // `destructive` endpoint runs, so it is built once Identity Access exists.
  const api = new GlobalProgramApiRegistry({ identityAccess });
  // Every model call made for a person -- a build, an exploration, a run's
  // diagnosis and repair, the check of its result -- runs on that person's own
  // key, released per call to their unlocked session. No grant is issued,
  // held, digest-checked or revoked around it; the run's budget bounds it, and
  // a lasting consequence of an action is still asked about act by act.
  //
  // The key is the Flow's own `llmSecretKeyId` when it names one: a build calls
  // the resolver without the Flow's metadata, so the Flow is read here. The
  // locked sentence names the public host when `FLUXIQ_PUBLIC_ORIGIN` sets one.
  const instanceHost = publicInstanceHost(process.env.FLUXIQ_PUBLIC_ORIGIN);
  if (modelProvidersEnabled) automationStudio.bindLlmExecutionProvider(createAutomationStudioSessionKeyProviderResolver({
    ports: secretKeys,
    flowSecretKeyId: ({ projectId, flowId }) => flowSecretKeyId(automationStudio, projectId, flowId),
    ...(instanceHost ? { instanceHost } : {})
  }));
  // The chat window reads plain requests with DeepSeek, on the key of whoever
  // sent the message, released to their own unlocked session. With no key, or
  // a locked session, the conversation still answers from its offline reading.
  if (modelProvidersEnabled) automationStudio.conversations.bindModel(createAutomationStudioDeepSeekPanelCommandModel({
    resolveKey: automationStudioPanelCommandKeyFromSecretKeys(secretKeys)
  }));
  // A paired client (the browser extension) acts under a session of its own,
  // which no key is released to. Its chat, and the builds and runs the chat
  // starts, use the approving person's live unlocked session instead, when
  // they have one; the paired client's permissions are unchanged.
  automationStudio.conversations.bindUnlockedSessionResolver((userId) => secretKeys.unlockedSessionFor(userId));
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

  registerAutomationStudioApi(api, automationStudio, identityAccess, automationStudioClientGateway, clientGateway);
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

/**
 * The Flow's own `llmSecretKeyId`, or undefined when it names none. A Flow
 * that cannot be read fails the call: guessing "no key" would spend the
 * caller's own key on a Flow that may name another.
 */
async function flowSecretKeyId(automationStudio: AutomationStudioService, projectId: string, flowId: string): Promise<string | undefined> {
  const flow = await automationStudio.getFlow(projectId, flowId);
  const keyId = flow.metadata?.llmSecretKeyId;
  return typeof keyId === "string" && keyId ? keyId : undefined;
}

/** The host of `FLUXIQ_PUBLIC_ORIGIN` (`app.example.com`), for the locked sentence; undefined when unset or not a URL. */
function publicInstanceHost(origin: string | undefined): string | undefined {
  const value = origin?.trim();
  if (!value || !URL.canParse(value)) return undefined;
  return new URL(value).host || undefined;
}
