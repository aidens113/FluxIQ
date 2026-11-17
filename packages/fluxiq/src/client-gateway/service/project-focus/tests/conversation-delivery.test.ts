// Covers conversation-delivery.ts and access-decisions.ts with the real session registry and transport, and its
// wiring on the gateway facade: a person-paired session is told a project's chat changed only while its person may
// read that project's chats, as the installed authority decides, whichever project the session is focused on. Never
// another person's session, a project the person may not read, a session no person paired, or a panel thread (null
// project). The decision is asked once and reused until access changes (the authority is installed again). The message
// names the chat and its project and nothing else.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayConversationChanged, type ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import {
  ClientGatewayAuditLog,
  ClientGatewayConversationChangeDelivery,
  ClientGatewaySessionRegistry,
  ClientGatewayTransport,
  type ClientGatewayConversationReadAuthority,
  type InternalSession
} from "../../index.ts";
import { ClientGatewayService } from "../../../service.ts";

type Sent = { type: string; payload: any };
type Request = Parameters<ClientGatewayConversationReadAuthority>[0];

const DOMAIN = "example";

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: Sent[] = [];
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Sent);
  }
}

/** An authority over who may read which project's chats, counting each question it is asked. */
function readable(grants: Record<string, string[]>) {
  const allowed = new Map(Object.entries(grants).map(([userId, projects]) => [userId, new Set(projects)]));
  const asked: Request[] = [];
  const authority: ClientGatewayConversationReadAuthority = async (request) => {
    asked.push(request);
    return allowed.get(request.session.operatorUserId ?? "")?.has(request.projectId) ?? false;
  };
  return { allowed, asked, authority };
}

/** The delivery over the gateway's own registry and transport. */
function gatewayParts(authority?: ClientGatewayConversationReadAuthority) {
  const now = () => 1_000;
  const sessions = new ClientGatewaySessionRegistry(now);
  const transport = new ClientGatewayTransport(sessions, now);
  const audit = new ClientGatewayAuditLog(now);
  const delivery = new ClientGatewayConversationChangeDelivery({ sessions, transport, audit, authority });
  /** A ready session focused on `projectId`: paired by `person` unless it is a stand-in or a managed host. */
  const session = (input: { person?: string; projectId?: string | null; standIn?: boolean; managedHost?: boolean }) => {
    const socket = new RecordingSocket();
    const created = sessions.create({ socket, hello: { clientId: `extension.${Math.random().toString(36).slice(2)}`, clientType: "extension", name: "Browser", capabilities: [], metadata: { domainId: DOMAIN } } });
    const person = input.person ?? "user.alice";
    const ready: InternalSession = Object.assign(created, {
      status: "ready" as const,
      projectId: input.projectId ?? null,
      pairedProjectId: input.projectId ?? null,
      trustedClientId: `trust.${created.clientId}`,
      operatorUserId: person,
      ...(input.standIn ? { channelScope: "scope.trial" } : {}),
      ...(input.managedHost ? { managedHostId: "host.1" } : {})
    });
    return {
      session: ready,
      changed: () => socket.sent.filter((sent) => sent.type === "server.conversation_changed").map((sent) => sent.payload as ClientGatewayConversationChanged)
    };
  };
  const publish = (projectId: string | null, conversationId = "conversation.1") => delivery.publish({ conversationId, projectId });
  return { sessions, audit, delivery, session, publish };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe("a person-paired session is told which chats it may read changed", () => {
  it("tells a session whose person may read the project, whatever it is focused on, with the chat's id and project alone", async () => {
    const { authority, asked } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const focusedElsewhere = parts.session({ projectId: "project.b" });

    // Anything a caller passes beside the two fields never reaches the client.
    expect(parts.delivery.publish({ conversationId: "conversation.1", projectId: "project.a", text: "secret words" } as ClientGatewayConversationChanged)).toBe(1);
    await settle();

    expect(focusedElsewhere.changed()).toEqual([{ conversationId: "conversation.1", projectId: "project.a" }]);
    expect(asked).toEqual([expect.objectContaining({ projectId: "project.a", domainId: DOMAIN })]);
  });

  it("never tells another person's session", async () => {
    const { authority } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const alice = parts.session({ person: "user.alice" });
    const bob = parts.session({ person: "user.bob" });

    parts.publish("project.a");
    await settle();

    expect(alice.changed()).toHaveLength(1);
    expect(bob.changed()).toEqual([]);
  });

  it("never tells a session of a project its person may not read, while a readable one goes on", async () => {
    const { authority } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const alice = parts.session({ projectId: "project.b" });

    parts.publish("project.b", "conversation.b");
    parts.publish("project.a", "conversation.a");
    await settle();

    expect(alice.changed()).toEqual([{ conversationId: "conversation.a", projectId: "project.a" }]);
  });

  it("never tells a session no person paired: a channel-scoped stand-in or a managed host", async () => {
    const { authority, asked } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const standIn = parts.session({ standIn: true });
    const host = parts.session({ managedHost: true });

    expect(parts.publish("project.a")).toBe(0);
    await settle();

    expect(standIn.changed()).toEqual([]);
    expect(host.changed()).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("never sends a panel thread's change (null project), not even to the person whose thread it is", async () => {
    const { authority, asked } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const alice = parts.session({});

    expect(parts.publish(null)).toBe(0);
    await settle();

    expect(alice.changed()).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("sends nothing while no authority is installed, or when the authority cannot decide, and audits only the failure's kind", async () => {
    const parts = gatewayParts();
    const alice = parts.session({});
    expect(parts.publish("project.a")).toBe(0);

    parts.delivery.setAuthority(async () => {
      throw new TypeError("policy store unavailable at secret://place");
    });
    parts.publish("project.a");
    await settle();

    expect(alice.changed()).toEqual([]);
    const failed = parts.audit.recent(100).filter((entry) => entry.type === "conversation_push.check_failed");
    expect(failed).toHaveLength(1);
    expect(JSON.stringify(failed)).not.toContain("secret://place");
    expect(failed[0]?.metadata).toEqual(expect.objectContaining({ projectId: "project.a", failureKind: "TypeError" }));
  });

  it("asks once per session and project and reuses it, then forgets it when access changes", async () => {
    const { allowed, asked, authority } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const alice = parts.session({});

    parts.publish("project.a", "conversation.1");
    parts.publish("project.a", "conversation.2");
    await settle();
    parts.publish("project.a", "conversation.3");
    await settle();
    expect(alice.changed().map((change) => change.conversationId)).toEqual(["conversation.1", "conversation.2", "conversation.3"]);
    expect(asked).toHaveLength(1);

    // An IAM store write: the host installs the authority again, and the reused decision is void.
    allowed.get("user.alice")?.delete("project.a");
    parts.delivery.setAuthority(authority);
    parts.publish("project.a", "conversation.4");
    await settle();

    expect(asked).toHaveLength(2);
    expect(alice.changed().map((change) => change.conversationId)).toEqual(["conversation.1", "conversation.2", "conversation.3"]);
  });

  it("asks again, and sends nothing on the stale answer, when access changed while the question ran", async () => {
    const allowed = new Set(["project.a"]);
    let release: (() => void) | undefined;
    let questions = 0;
    const authority: ClientGatewayConversationReadAuthority = async (request) => {
      questions += 1;
      const answer = allowed.has(request.projectId);
      if (questions === 1) await new Promise<void>((resolve) => { release = resolve; });
      return answer;
    };
    const parts = gatewayParts(authority);
    const alice = parts.session({});

    parts.publish("project.a");
    await settle();
    allowed.delete("project.a");
    parts.delivery.setAuthority(authority);
    release?.();
    await settle();

    expect(questions).toBe(2);
    expect(alice.changed()).toEqual([]);
  });

  it("does not reuse a decision for a session that now speaks for someone else", async () => {
    const { asked, authority } = readable({ "user.alice": ["project.a"] });
    const parts = gatewayParts(authority);
    const browser = parts.session({});

    parts.publish("project.a", "conversation.1");
    await settle();
    browser.session.operatorUserId = "user.bob";
    parts.publish("project.a", "conversation.2");
    await settle();

    expect(asked).toHaveLength(2);
    expect(browser.changed().map((change) => change.conversationId)).toEqual(["conversation.1"]);
  });
});

describe("the gateway facade", () => {
  it("publishes through the conversation authority installed on it, and sends nothing before one is", async () => {
    const gateway = new ClientGatewayService();
    const socket = new RecordingSocket();
    const { sessionId } = gateway.connect({ socket });
    await gateway.receiveRaw(sessionId, JSON.stringify({ id: "message.hello", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload: { clientId: "extension.alice", clientType: "extension", name: "Browser", capabilities: [], metadata: { domainId: DOMAIN } } }));
    const pairing = gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === sessionId);
    expect((await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: "user.alice" }))?.status).toBe("ready");

    expect(gateway.conversationPush.publish({ conversationId: "conversation.1", projectId: "project.a" })).toBe(0);
    gateway.conversationPush.setAuthority(async ({ session, projectId }) => session.operatorUserId === "user.alice" && projectId === "project.a");
    expect(gateway.conversationPush.publish({ conversationId: "conversation.1", projectId: "project.a" })).toBe(1);
    await settle();

    expect(socket.sent.filter((sent) => sent.type === "server.conversation_changed").map((sent) => sent.payload)).toEqual([{ conversationId: "conversation.1", projectId: "project.a" }]);
  });
});
