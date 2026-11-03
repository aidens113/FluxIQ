import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayClientMessage, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { IoRegistry } from "../../../../../io/index.ts";
import type { RecordingTargetPolicy } from "../../../../../runtime/recording/target-policy/index.ts";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../client-gateway/index.ts";
import { isOpaqueRecordingTarget } from "../../../../../client-gateway/recording/decoding/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterImplementationBundle } from "../../../../../components/automation/importer/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-execution/index.ts";
import { AutomationStudioService } from "../../../runtime/index.ts";
import { AutomationStudioClientGatewayBridge } from "../../index.ts";
import type { ClientRecordingContextProvider } from "../../context.ts";

export async function trustedRecordingFixture(options: { domain?: "devices" | null; installPolicy?: boolean } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-trusted-recording-"));
  const domain = options.domain === undefined ? "devices" : options.domain;
  let clock = 1_000_000;
  let nextMessage = 0;
  let persisted: ClientGatewayTrustedClient[] = [];
  const policyCalls: { receiver: unknown; method: string; args: unknown[] }[] = [];
  const policy: RecordingTargetPolicy = {
    accepts(value): value is unknown {
      policyCalls.push({ receiver: this, method: "accepts", args: Array.from(arguments) });
      return isOpaqueRecordingTarget(value) && value.type === "device";
    },
    commandTarget(value) {
      policyCalls.push({ receiver: this, method: "command", args: Array.from(arguments) });
      return { type: "device", metadata: value };
    },
    targetIssues(_value, _path) {
      policyCalls.push({ receiver: this, method: "target", args: Array.from(arguments) });
      return [];
    },
    parameterIssues(_value, _path) {
      policyCalls.push({ receiver: this, method: "parameters", args: Array.from(arguments) });
      return [];
    }
  };
  const bundle: AutomationStudioImporterImplementationBundle = {
    packageId: "trusted.device.package", packageVersion: "1.0.0", implementations: {},
    ...(options.installPolicy !== false ? { recordingTargetPolicy: policy } : {})
  };
  const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: bundle.packageId, packageVersion: bundle.packageVersion, domainId: "devices", recordingTargetPolicyRequired: true, nodes: [] }, bundle);
  const service = new AutomationStudioService({ dataDir: directory, seedFixture: false }).bindNativeNodeRuntime(native);
  const project = await service.createProject({ name: "Approved device project", ...(domain ? { domainId: domain } : {}) });
  const decoy = await service.createProject({ name: "Other original project", ...(domain ? { domainId: domain } : {}) });
  const gateway = new ClientGatewayService({ now: () => clock, commandTimeoutMs: 1000, trustedClientStore: {
    load: async () => persisted.map(client => ({ ...client })),
    save: async clients => { persisted = clients.map(client => ({ ...client })); }
  } });
  const gateways = [gateway];
  const message = <TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> => ({
    id: `trusted.message.${++nextMessage}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: clock, type, payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>);
  const connected = gateway.connect({ socket: { send: () => undefined } });
  await gateway.receive(connected.sessionId, message("client.hello", { clientId: "trusted.device.client", clientType: "custom", name: "Device fixture", ...(domain ? { metadata: { domainId: domain } } : {}) }));
  const pairing = gateway.snapshot().pairings[0];
  if (!pairing) throw new Error("fixture.pairing_missing");
  const session = await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "fixture.operator" });
  if (!session?.trustedClientId) throw new Error("fixture.trust_missing");
  const ready = gateway.outbound(session.sessionId).find(item => item.type === "server.session_ready");
  if (!ready || ready.type !== "server.session_ready") throw new Error("fixture.ready_missing");
  const credential = ready.payload.token;
  const bridge = (input: { provider?: ClientRecordingContextProvider; io?: IoRegistry; gateway?: ClientGatewayService } = {}) => new AutomationStudioClientGatewayBridge({
    automationStudio: service, gateway: input.gateway ?? gateway, stopDrainMs: 0,
    ...(input.provider ? { clientRecordingContextProvider: input.provider } : {}),
    ...(input.io ? { io: input.io } : {})
  });
  const reconnect = async (current = gateway) => {
    const next = current.connect({ socket: { send: () => undefined } });
    await current.receive(next.sessionId, message("client.hello", { clientId: "trusted.device.client", clientType: "custom", token: credential, ...(domain ? { metadata: { domainId: domain } } : {}) }));
    return next;
  };
  const legacyGateway = async () => {
    const legacyRows = persisted.map(client => {
      const { domainId: _domain, ...legacy } = client;
      return legacy;
    });
    const legacy = new ClientGatewayService({ now: () => clock, commandTimeoutMs: 1000, trustedClientStore: { load: async () => legacyRows.map(client => ({ ...client })), save: async () => undefined } });
    gateways.push(legacy);
    await legacy.ready();
    return legacy;
  };
  let closed: Promise<void> | undefined;
  const closeService = () => closed ??= service.close();
  const close = async () => {
    const completed = await Promise.allSettled([...gateways.map(current => current.close()), closeService()]);
    const failures = completed.filter(result => result.status === "rejected").map(result => result.reason as unknown);
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Fixture gateway and project storage cleanup failed.");
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir())) throw new Error("fixture.invalid_temp_root");
    await rm(directory, { recursive: true, force: true });
  };
  const acknowledgements = (current = gateway, sessionId = session.sessionId) => current.outbound(sessionId).filter(item => item.type === "server.start_recording").map(item => item.payload.recordingId);
  return { directory, domain, service, native, project, decoy, gateway, session, policy, policyCalls, message, bridge, reconnect, legacyGateway, acknowledgements, closeService, close,
    expire() {
      const trust = gateway.snapshot().trustedClients.find(client => client.trustedClientId === session.trustedClientId);
      if (!trust) throw new Error("fixture.trust_missing");
      clock = trust.expiresAt + 1;
    }
  };
}
