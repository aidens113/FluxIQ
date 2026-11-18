// Covers model-access/delivery.ts with the real session registry, transport, audit log and event bus, and its wiring
// on the gateway facade: a person-paired session is sent its own person's model access, in the paired-client form
// (no key id), only when it differs from the last state sent to it. Never a session no person paired, nothing while
// no authority is installed or it answers null, and a read that fails sends nothing and is audited by kind only.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import {
  ClientGatewayAuditLog,
  ClientGatewayEventBus,
  ClientGatewayModelAccessDelivery,
  ClientGatewaySessionRegistry,
  ClientGatewayTransport,
  type ClientGatewayModelAccessAuthority,
  type ClientGatewayModelAccessSubject,
  type InternalSession
} from "../../index.ts";
import { ClientGatewayService } from "../../../service.ts";

type Sent = { type: string; payload: any };

const READY: ModelAccessState = { status: "ready", message: "Your chats can reach a model.", key: { id: "key.secret-id", name: "Work", provider: "anthropic", model: "claude-test" }, lastCall: null };
const REFUSED: ModelAccessState = { status: "provider_refused", message: "The provider refused this key.", key: { id: "key.secret-id", name: "Work", provider: "anthropic", model: "claude-test" }, lastCall: { outcome: "provider_refused", atMs: 5 } };
const NO_KEY: ModelAccessState = { status: "no_key", message: "Add a model key to start.", key: null, lastCall: null };

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: Sent[] = [];
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Sent);
  }
}

/** The delivery over the gateway's own registry and transport. */
function gatewayParts(authority?: ClientGatewayModelAccessAuthority) {
  const now = () => 1_000;
  const sessions = new ClientGatewaySessionRegistry(now);
  const transport = new ClientGatewayTransport(sessions, now);
  const audit = new ClientGatewayAuditLog(now);
  const events = new ClientGatewayEventBus();
  const delivery = new ClientGatewayModelAccessDelivery({ sessions, transport, audit, events, authority });
  /** A ready session paired by `person`, unless it is a stand-in or a managed host. */
  const session = (input: { person?: string; standIn?: boolean; managedHost?: boolean } = {}) => {
    const socket = new RecordingSocket();
    const created = sessions.create({ socket, hello: { clientId: `extension.${Math.random().toString(36).slice(2)}`, clientType: "extension", name: "Browser", capabilities: [], metadata: { domainId: "example" } } });
    const ready: InternalSession = Object.assign(created, {
      status: "ready" as const,
      trustedClientId: `trust.${created.clientId}`,
      operatorUserId: input.person ?? "user.alice",
      ...(input.standIn ? { channelScope: "scope.trial" } : {}),
      ...(input.managedHost ? { managedHostId: "host.1" } : {})
    });
    return { session: ready, pushed: () => socket.sent.filter((sent) => sent.type === "server.model_access_changed").map((sent) => sent.payload) };
  };
  return { sessions, audit, events, delivery, session };
}

/** An authority answering each person's state from a table a test edits, counting each read. */
function table(states: Record<string, ModelAccessState | null>) {
  const asked: ClientGatewayModelAccessSubject[] = [];
  const authority: ClientGatewayModelAccessAuthority = async (subject) => {
    asked.push(subject);
    return states[subject.userId] ?? null;
  };
  return { states, asked, authority };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

const paired = (state: ModelAccessState) => ({ modelAccess: state.key ? { ...state, key: { name: state.key.name, provider: state.key.provider, model: state.key.model } } : state });

describe("a person-paired session is told its person's model access changed", () => {
  it("sends the person's own state in the paired-client form, asking with the session, person and trusted client alone", async () => {
    const { asked, authority } = table({ "user.alice": READY, "user.bob": NO_KEY });
    const { delivery, session } = gatewayParts(authority);
    const alice = session();
    const bob = session({ person: "user.bob" });
    expect(delivery.publish()).toBe(2);
    await settle();

    expect(alice.pushed()).toEqual([paired(READY)]);
    expect(JSON.stringify(alice.pushed())).not.toContain("key.secret-id");
    expect(bob.pushed()).toEqual([paired(NO_KEY)]);
    expect(asked).toContainEqual({ sessionId: alice.session.sessionId, userId: "user.alice", trustedClientId: alice.session.trustedClientId });
    expect(Object.keys(asked[0]!).sort()).toEqual(["sessionId", "trustedClientId", "userId"]);
  });

  it("sends a state only when it differs from the last one sent to that session", async () => {
    const { states, authority } = table({ "user.alice": READY });
    const { delivery, session } = gatewayParts(authority);
    const alice = session();
    delivery.publish();
    await settle();
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([paired(READY)]);

    states["user.alice"] = REFUSED;
    delivery.publish();
    await settle();
    delivery.publish();
    await settle();
    states["user.alice"] = READY;
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([paired(READY), paired(REFUSED), paired(READY)]);
  });

  it("never asks about or tells a session no person paired: a channel-scoped stand-in or a managed host", async () => {
    const { asked, authority } = table({ "user.alice": READY });
    const { delivery, session } = gatewayParts(authority);
    const standIn = session({ standIn: true });
    const host = session({ managedHost: true });
    expect(delivery.publish()).toBe(0);
    await settle();
    expect(asked).toEqual([]);
    expect([...standIn.pushed(), ...host.pushed()]).toEqual([]);
  });

  it("never tells a session that is not ready or has disconnected", async () => {
    const { asked, authority } = table({ "user.alice": READY });
    const { delivery, session } = gatewayParts(authority);
    const pending = session();
    pending.session.status = "pairing_required";
    const gone = session();
    gone.session.disconnectedAt = 900;
    expect(delivery.publish()).toBe(0);
    await settle();
    expect(asked).toEqual([]);
  });

  it("sends nothing while no authority is installed, or when it answers null", async () => {
    const { delivery, session } = gatewayParts();
    const alice = session();
    expect(delivery.publish()).toBe(0);
    delivery.setAuthority(async () => null);
    expect(delivery.publish()).toBe(1);
    await settle();
    expect(alice.pushed()).toEqual([]);
  });

  it("audits a read that throws by its kind only, once per outage, sends nothing, and reads again on the next change", async () => {
    let failing = true;
    const authority: ClientGatewayModelAccessAuthority = async () => {
      if (failing) throw new TypeError("the private key sk-ant-secret could not be decrypted");
      return READY;
    };
    const { delivery, session, audit } = gatewayParts(authority);
    const alice = session();
    delivery.publish();
    await settle();
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([]);
    const rows = audit.recent(100).filter((entry) => entry.type === "model_access_push.state_failed");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toEqual({ sessionId: alice.session.sessionId, failureKind: "TypeError" });
    expect(JSON.stringify(audit.recent(100))).not.toContain("sk-ant-secret");

    failing = false;
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([paired(READY)]);
  });

  it("refuses a state that contradicts itself, audited as invalid, rather than sending it", async () => {
    const broken = { status: "ready", message: "Ready.", key: null, lastCall: null } as ModelAccessState;
    const { delivery, session, audit } = gatewayParts(async () => broken);
    const alice = session();
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([]);
    expect(audit.recent(100).filter((entry) => entry.type === "model_access_push.state_failed").map((entry) => entry.metadata?.failureKind)).toEqual(["invalid_state"]);
  });

  it("audits an answer that is not a state at all, rather than letting it escape as an unhandled rejection", async () => {
    const { delivery, session, audit } = gatewayParts(async () => undefined as unknown as ModelAccessState);
    const alice = session();
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([]);
    expect(audit.recent(100).filter((entry) => entry.type === "model_access_push.state_failed")).toHaveLength(1);
  });

  it("sends only the state's own fields, whatever the authority added beside them", async () => {
    const { delivery, session } = gatewayParts(async () => ({ ...READY, secret: "never-sent" }) as ModelAccessState);
    const alice = session();
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([paired(READY)]);
  });

  it("reads once more after a read that was running when another change came, and sends the newest state", async () => {
    let release: () => void = () => undefined;
    let reads = 0;
    let current: ModelAccessState = READY;
    const authority: ClientGatewayModelAccessAuthority = async () => {
      reads += 1;
      const answer = current;
      if (reads === 1) await new Promise<void>((resolve) => { release = resolve; });
      return answer;
    };
    const { delivery, session } = gatewayParts(authority);
    const alice = session();
    delivery.publish();
    await settle();
    current = REFUSED;
    delivery.publish();
    delivery.publish();
    delivery.publish();
    release();
    await settle();
    expect(reads).toBe(2);
    expect(alice.pushed()).toEqual([paired(READY), paired(REFUSED)]);
  });

  it("sends nothing worked out for a session that left while its state was read", async () => {
    let release: () => void = () => undefined;
    const { delivery, session, sessions } = gatewayParts(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return READY;
    });
    const alice = session();
    delivery.publish();
    await settle();
    sessions.get(alice.session.sessionId)!.disconnectedAt = 950;
    release();
    await settle();
    expect(alice.pushed()).toEqual([]);
  });

  it("forgets what it sent once the session becomes ready again, so the client's fresh read is not assumed", async () => {
    const { authority } = table({ "user.alice": READY });
    const { delivery, session, events } = gatewayParts(authority);
    const alice = session();
    delivery.publish();
    await settle();
    await events.emit({ type: "session.ready", session: alice.session });
    delivery.publish();
    await settle();
    expect(alice.pushed()).toEqual([paired(READY), paired(READY)]);
  });
});

describe("the gateway facade", () => {
  it("publishes through the authority installed on modelAccessPush, and sends nothing before one is", async () => {
    const gateway = new ClientGatewayService();
    const socket = new RecordingSocket();
    const { sessionId } = gateway.connect({ socket });
    await gateway.receiveRaw(sessionId, JSON.stringify({ id: "message.hello", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { clientId: "extension.alice", clientType: "extension", name: "Browser", capabilities: [], metadata: { domainId: "example" } } }));
    const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
    expect((await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.alice" }))?.status).toBe("ready");

    expect(gateway.modelAccessPush.publish()).toBe(0);
    gateway.modelAccessPush.setAuthority(async ({ userId }) => (userId === "user.alice" ? READY : null));
    expect(gateway.modelAccessPush.publish()).toBe(1);
    await settle();

    expect(socket.sent.filter((sent) => sent.type === "server.model_access_changed").map((sent) => sent.payload)).toEqual([paired(READY)]);
  });
});
