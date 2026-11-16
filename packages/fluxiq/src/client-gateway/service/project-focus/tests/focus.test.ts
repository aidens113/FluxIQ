// `client.focus_project` through the whole gateway (inbound routing, the focus
// collaborator, the activity publisher): a paired client moves its session to a
// project its person may read, activity follows it, and every refusal answers a
// typed `server.error` and leaves the session's project as it was. Messages go
// in as the socket's raw text, so a malformed payload reaches Core as it would.
import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID,
  CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES,
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  type ClientGatewayActivity,
  type ClientGatewayCapability,
  type ClientGatewayProjectFocusAuthority,
  type ClientGatewaySocket
} from "../../../index.ts";

type FocusRequest = Parameters<ClientGatewayProjectFocusAuthority>[0];
type Sent = { type: string; correlationId?: string; payload: any };

const ACTIVITY: ClientGatewayCapability = { id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" };
const DOMAIN = "example";
const APPROVER = "user.alice";

/** An authority that answers `allowed(request)` and counts how often it was asked. */
function countingAuthority(allowed: (request: FocusRequest) => boolean) {
  const asked: FocusRequest[] = [];
  const authority: ClientGatewayProjectFocusAuthority = async (request) => {
    asked.push(request);
    return allowed(request);
  };
  return { authority, asked };
}

describe("client.focus_project", () => {
  it("moves a paired session to a project its person may read: that project's activity arrives and the old one's stops", async () => {
    const { authority, asked } = countingAuthority((request) => request.projectId === "project.next");
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const client = await paired(gateway, "project.paired");
    expect(gateway.publishActivity(activity("project.paired"), { projectId: "project.paired" })).toBe(1);

    const id = await client.send("client.focus_project", { projectId: "project.next" });

    expect(client.last()).toEqual(expect.objectContaining({ type: "server.project_focused", correlationId: id, payload: { projectId: "project.next" } }));
    expect(asked).toEqual([{ session: expect.objectContaining({ sessionId: client.sessionId, operatorUserId: APPROVER, projectId: "project.paired" }), projectId: "project.next", domainId: DOMAIN }]);
    expect(projectOf(gateway, client.sessionId)).toBe("project.next");
    expect(gateway.publishActivity(activity("project.paired"), { projectId: "project.paired" })).toBe(0);
    expect(gateway.publishActivity(activity("project.next"), { projectId: "project.next" })).toBe(1);
    expect(client.activity().map((sent) => sent.payload.subject.projectId)).toEqual(["project.paired", "project.next"]);
  });

  it("returns to the pairing's project on null, without asking the authority", async () => {
    const { authority, asked } = countingAuthority(() => true);
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const client = await paired(gateway, "project.paired");
    await client.send("client.focus_project", { projectId: "project.next" });

    const id = await client.send("client.focus_project", { projectId: null });

    expect(client.last()).toEqual(expect.objectContaining({ type: "server.project_focused", correlationId: id, payload: { projectId: "project.paired" } }));
    expect(asked).toHaveLength(1);
    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");
    expect(gateway.publishActivity(activity("project.next"), { projectId: "project.next" })).toBe(0);
    expect(gateway.publishActivity(activity("project.paired"), { projectId: "project.paired" })).toBe(1);
  });

  it("returns a session paired with no project to none, where it hears every project again", async () => {
    const gateway = new ClientGatewayService({ projectFocusAuthority: countingAuthority(() => true).authority });
    const client = await paired(gateway);
    await client.send("client.focus_project", { projectId: "project.next" });
    expect(gateway.publishActivity(activity("project.other"), { projectId: "project.other" })).toBe(0);

    await client.send("client.focus_project", { projectId: null });

    expect(client.last().payload).toEqual({ projectId: null });
    expect(gateway.publishActivity(activity("project.other"), { projectId: "project.other" })).toBe(1);
  });

  it("refuses a project the person may not read, or one in another domain, and keeps the session where it was", async () => {
    // The authority is where both are decided; here it reads the domain it is handed.
    const gateway = new ClientGatewayService({ projectFocusAuthority: countingAuthority(({ projectId, domainId }) => domainId === DOMAIN && projectId === "project.own").authority });
    const client = await paired(gateway, "project.paired");

    for (const projectId of ["project.someone-elses", "project.other-domain"]) {
      const id = await client.send("client.focus_project", { projectId });
      expect(client.last()).toEqual(expect.objectContaining({
        type: "server.error",
        correlationId: id,
        payload: { code: CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.refused, message: expect.any(String), metadata: { projectId } }
      }));
    }
    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");
    expect(gateway.publishActivity(activity("project.paired"), { projectId: "project.paired" })).toBe(1);
    expect(client.sent().some((sent) => sent.type === "server.project_focused")).toBe(false);
  });

  it("hands the authority the domain the session declared, never one the request names", async () => {
    const { authority, asked } = countingAuthority(() => true);
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const client = await paired(gateway, "project.paired", "  other-domain  ");
    await client.send("client.focus_project", { projectId: "project.next", domainId: DOMAIN });
    expect(asked.map((request) => request.domainId)).toEqual(["other-domain"]);
  });

  it("refuses as unavailable when no authority is installed, or the authority fails, and an installed one then decides", async () => {
    const gateway = new ClientGatewayService();
    const client = await paired(gateway, "project.paired");

    await client.send("client.focus_project", { projectId: "project.next" });
    expect(client.last().payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.unavailable);

    gateway.projectFocus.setAuthority(async () => {
      throw new Error("private detail");
    });
    await client.send("client.focus_project", { projectId: "project.next" });
    expect(client.last().payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.unavailable);
    expect(JSON.stringify(gateway.snapshot().auditLog)).not.toContain("private detail");
    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");

    gateway.projectFocus.setAuthority(countingAuthority(() => true).authority);
    await client.send("client.focus_project", { projectId: "project.next" });
    expect(projectOf(gateway, client.sessionId)).toBe("project.next");
  });

  it.each([
    ["no project id", {}],
    ["a number", { projectId: 7 }],
    ["a blank id", { projectId: "   " }]
  ])("refuses %s as invalid without asking the authority", async (_label, payload) => {
    const { authority, asked } = countingAuthority(() => true);
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const client = await paired(gateway, "project.paired");
    await client.send("client.focus_project", payload);
    expect(client.last().payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.invalid);
    expect(asked).toHaveLength(0);
    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");
  });

  it("answers an unpaired session that it must pair first, and moves nothing", async () => {
    const { authority, asked } = countingAuthority(() => true);
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const client = await connected(gateway, "extension.unpaired");

    await client.send("client.focus_project", { projectId: "project.next" });

    expect(client.last().type).toBe("server.pairing_required");
    expect(asked).toHaveLength(0);
    expect(projectOf(gateway, client.sessionId)).toBeUndefined();
  });

  it("refuses a ready session no person paired (a channel-scoped stand-in) as not paired", async () => {
    const { authority, asked } = countingAuthority(() => true);
    const gateway = new ClientGatewayService({ projectFocusAuthority: authority });
    const socket = new RecordingSocket();
    const scoped = gateway.attachScopedSession({ scopeId: "scope.trial", socket, hello: { clientType: "extension", name: "Stand-in", metadata: { domainId: DOMAIN } } });
    expect(scoped.status).toBe("ready");

    await gateway.receiveRaw(scoped.sessionId, raw("client.focus_project", { projectId: "project.next" }).text);

    expect(parse(socket).at(-1)?.payload.code).toBe(CLIENT_GATEWAY_PROJECT_FOCUS_REFUSAL_CODES.notPaired);
    expect(asked).toHaveLength(0);
  });

  it("applies only the latest request: a slower earlier one decided afterwards neither moves the session nor answers", async () => {
    const pending: Array<(allowed: boolean) => void> = [];
    const gateway = new ClientGatewayService({ projectFocusAuthority: () => new Promise<boolean>((resolve) => pending.push(resolve)) });
    const client = await paired(gateway, "project.paired");

    const slow = client.send("client.focus_project", { projectId: "project.slow" });
    await Promise.resolve();
    const back = await client.send("client.focus_project", { projectId: null });
    pending[0]?.(true);
    const slowId = await slow;

    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");
    expect(client.sent().filter((sent) => sent.type === "server.project_focused").map((sent) => sent.correlationId)).toEqual([back]);
    expect(client.sent().some((sent) => sent.correlationId === slowId)).toBe(false);
  });

  it("drops a decision for a session that disconnected while it was made", async () => {
    const pending: Array<(allowed: boolean) => void> = [];
    const gateway = new ClientGatewayService({ projectFocusAuthority: () => new Promise<boolean>((resolve) => pending.push(resolve)) });
    const client = await paired(gateway, "project.paired");

    const pendingFocus = client.send("client.focus_project", { projectId: "project.next" });
    await Promise.resolve();
    gateway.disconnect(client.sessionId, "test");
    pending[0]?.(true);
    await pendingFocus;

    expect(projectOf(gateway, client.sessionId)).toBe("project.paired");
    expect(client.sent().some((sent) => sent.type === "server.project_focused")).toBe(false);
  });

  it("keeps the focus bookkeeping out of every public session view", async () => {
    const gateway = new ClientGatewayService({ projectFocusAuthority: countingAuthority(() => true).authority });
    const client = await paired(gateway, "project.paired");
    await client.send("client.focus_project", { projectId: "project.next" });
    const view = gateway.snapshot().sessions.find((session) => session.sessionId === client.sessionId) ?? {};
    expect(Object.keys(view)).not.toContain("pairedProjectId");
    expect(Object.keys(view)).not.toContain("focusRequests");
  });
});

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: string[] = [];
  send(text: string): void {
    this.sent.push(text);
  }
}

function parse(socket: RecordingSocket): Sent[] {
  return socket.sent.map((text) => JSON.parse(text) as Sent);
}

/** A client message as its socket's text, with the id Core will correlate its answer to. */
function raw(type: string, payload: unknown): { id: string; text: string } {
  const id = `message.${Math.random().toString(36).slice(2)}`;
  return { id, text: JSON.stringify({ id, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload }) };
}

async function connected(gateway: ClientGatewayService, clientId: string, domainId = DOMAIN) {
  const socket = new RecordingSocket();
  const session = gateway.connect({ socket });
  const send = async (type: string, payload: unknown): Promise<string> => {
    const message = raw(type, payload);
    await gateway.receiveRaw(session.sessionId, message.text);
    return message.id;
  };
  await send("client.hello", { clientId, clientType: "extension", name: clientId, capabilities: [ACTIVITY], metadata: { domainId } });
  return {
    sessionId: session.sessionId,
    send,
    sent: () => parse(socket),
    last: () => parse(socket).at(-1) as Sent,
    activity: () => parse(socket).filter((sent) => sent.type === "server.activity")
  };
}

/** A session a person approved; with `projectId`, its pairing names that project. */
async function paired(gateway: ClientGatewayService, projectId?: string, domainId = DOMAIN) {
  const client = await connected(gateway, `extension.${Math.random().toString(36).slice(2)}`, domainId);
  const pairing = projectId === undefined
    ? gateway.snapshot().pairings.find((candidate) => candidate.requestedBySessionId === client.sessionId)
    : gateway.createPairing({ projectId, requestedBySessionId: client.sessionId, requestedByClientId: "extension", requestedByClientName: "Extension" });
  const approved = await gateway.approvePairing(pairing?.pairingCode ?? "", { approvedByUserId: APPROVER });
  expect(approved?.status).toBe("ready");
  return client;
}

function projectOf(gateway: ClientGatewayService, sessionId: string): string | null | undefined {
  return gateway.snapshot().sessions.find((session) => session.sessionId === sessionId)?.projectId;
}

function activity(projectId: string): ClientGatewayActivity {
  return { activityId: "build.1", sequence: 1, subject: { kind: "build", id: "build.1", projectId }, phase: "running", label: "Running", at: "2026-11-16T00:00:00.000Z" };
}
