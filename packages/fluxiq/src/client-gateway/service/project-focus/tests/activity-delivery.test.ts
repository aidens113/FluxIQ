// Covers activity-delivery.ts and access-decisions.ts with the activity publisher they gate, the focus collaborator
// that owns them, and the real session registry and transport, built as the gateway facade builds them: a
// person-paired session hears a project's activity only while its person may read that project. The decision is asked
// once and reused until access changes (the authority is installed again), when every reused decision is void and the
// session's own project is decided again at once. Losing access to the session's own project stops that project's
// activity, moves the session where a null focus would, and tells the client once with `server.project_access_ended`;
// every other project's activity goes on.
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayActivity, type ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import {
  ClientGatewayActivityPublisher,
  ClientGatewayAuditLog,
  ClientGatewayProjectFocus,
  ClientGatewaySessionRegistry,
  ClientGatewayTransport,
  type ClientGatewayProjectFocusAuthority,
  type InternalSession
} from "../../index.ts";

type Sent = { type: string; correlationId?: string; payload: any };
type Request = Parameters<ClientGatewayProjectFocusAuthority>[0];

const DOMAIN = "example";

class RecordingSocket implements ClientGatewaySocket {
  readonly sent: Sent[] = [];
  send(text: string): void {
    this.sent.push(JSON.parse(text) as Sent);
  }
}

/** An authority over a mutable set of readable projects, counting each question it is asked. */
function readable(...projects: string[]) {
  const allowed = new Set(projects);
  const asked: Request[] = [];
  const authority: ClientGatewayProjectFocusAuthority = async (request) => {
    asked.push(request);
    return allowed.has(request.projectId);
  };
  return { allowed, asked, authority };
}

/** The gateway's own collaborators, wired as the facade wires them. */
function gatewayParts(authority?: ClientGatewayProjectFocusAuthority) {
  const now = () => 1_000;
  const sessions = new ClientGatewaySessionRegistry(now);
  const transport = new ClientGatewayTransport(sessions, now);
  const audit = new ClientGatewayAuditLog(now);
  const focus = new ClientGatewayProjectFocus({ sessions, transport, audit, authority });
  const publisher = new ClientGatewayActivityPublisher(sessions, transport, focus.activity);
  /** A ready session that asked for activity; person-paired unless `stand-in`. */
  const session = (input: { projectId: string | null; pairedProjectId?: string | null; standIn?: boolean }) => {
    const socket = new RecordingSocket();
    const created = sessions.create({ socket, hello: { clientId: `extension.${Math.random().toString(36).slice(2)}`, clientType: "extension", name: "Browser", capabilities: [{ id: CLIENT_GATEWAY_ACTIVITY_CAPABILITY_ID, kind: "state" }], metadata: { domainId: DOMAIN } } });
    const ready: InternalSession = Object.assign(created, {
      status: "ready" as const,
      projectId: input.projectId,
      pairedProjectId: input.pairedProjectId === undefined ? input.projectId : input.pairedProjectId,
      ...(input.standIn ? { channelScope: "scope.trial" } : { trustedClientId: `trust.${created.clientId}`, operatorUserId: "user.alice" })
    });
    return {
      session: ready,
      activity: () => socket.sent.filter((sent) => sent.type === "server.activity").map((sent) => sent.payload.subject.projectId as string),
      ended: () => socket.sent.filter((sent) => sent.type === "server.project_access_ended").map((sent) => sent.payload)
    };
  };
  const publish = (projectId: string, sequence = 1) => publisher.publish(activity(projectId, sequence), { projectId });
  return { sessions, audit, focus, publisher, session, publish };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe("activity a person-paired session hears follows its person's access", () => {
  it("stops a revoked project's activity, moves the session as null would and tells it once, while another project's goes on", async () => {
    const { allowed, authority } = readable("project.focused", "project.paired", "project.other");
    const parts = gatewayParts(authority);
    const focused = parts.session({ projectId: "project.focused", pairedProjectId: "project.paired" });
    const other = parts.session({ projectId: "project.other" });

    expect(parts.publish("project.focused")).toBe(1);
    await settle();
    expect(focused.activity()).toEqual(["project.focused"]);

    // Access changes: the host installs the authority again, and the session's own project ends at the change.
    allowed.delete("project.focused");
    parts.focus.setAuthority(authority);
    await settle();

    expect(focused.activity()).toEqual(["project.focused"]);
    expect(focused.ended()).toEqual([{ projectId: "project.focused", currentProjectId: "project.paired", message: expect.stringContaining("can no longer open this project") }]);
    expect(focused.session.projectId).toBe("project.paired");
    expect(parts.audit.recent(20).map((entry) => entry.type)).toContain("project_focus.access_ended");

    // The revoked project's later activity reaches nobody and tells nobody again; the others' still arrive.
    parts.publish("project.focused", 2);
    parts.publish("project.focused", 3);
    parts.publish("project.paired", 4);
    parts.publish("project.other", 5);
    await settle();
    expect(focused.activity()).toEqual(["project.focused", "project.paired"]);
    expect(focused.ended()).toHaveLength(1);
    expect(other.activity()).toEqual(["project.other"]);
    expect(other.ended()).toEqual([]);
  });

  it("returns a session whose pairing's own project was lost to no project, and forgets that pairing project", async () => {
    const { allowed, authority } = readable("project.paired", "project.next");
    const parts = gatewayParts(authority);
    const browser = parts.session({ projectId: "project.paired" });

    allowed.delete("project.paired");
    parts.focus.setAuthority(authority);
    await settle();

    expect(browser.ended()).toEqual([expect.objectContaining({ projectId: "project.paired", currentProjectId: null })]);
    expect(browser.session.projectId).toBeNull();
    expect(browser.session.pairedProjectId).toBeNull();
    // Bound to none, it hears the projects its person may read, and not the lost one.
    parts.publish("project.next");
    parts.publish("project.paired", 2);
    await settle();
    expect(browser.activity()).toEqual(["project.next"]);
    expect(browser.ended()).toHaveLength(1);
  });

  it("delivers to a session bound to no project only the projects its person may read, telling it nothing of the rest", async () => {
    const { authority } = readable("project.own");
    const parts = gatewayParts(authority);
    const unbound = parts.session({ projectId: null });

    parts.publish("project.someone-elses");
    parts.publish("project.own", 2);
    await settle();

    expect(unbound.activity()).toEqual(["project.own"]);
    expect(unbound.ended()).toEqual([]);
    expect(unbound.session.projectId).toBeNull();
  });

  it("decides an allowed project once and reuses it for every later event, until access changes", async () => {
    const { asked, authority } = readable("project.own");
    const parts = gatewayParts(authority);
    const browser = parts.session({ projectId: "project.own" });

    for (let sequence = 1; sequence <= 5; sequence += 1) {
      parts.publish("project.own", sequence);
      await settle();
    }
    expect(asked).toHaveLength(1);
    expect(browser.activity()).toHaveLength(5);

    // A change re-decides the session's own project once, at the change, and that is reused after it.
    parts.focus.setAuthority(authority);
    await settle();
    parts.publish("project.own", 6);
    await settle();
    expect(asked).toHaveLength(2);
    expect(browser.activity()).toHaveLength(6);
  });

  it("asks again when access changed while a question ran, so an answer from before the change is never kept", async () => {
    const pending: Array<() => void> = [];
    const { allowed, asked, authority } = readable("project.focused");
    const slow: ClientGatewayProjectFocusAuthority = async (request) => {
      await new Promise<void>((resolve) => pending.push(resolve));
      return await authority(request);
    };
    const parts = gatewayParts(slow);
    const browser = parts.session({ projectId: "project.focused", pairedProjectId: null });

    parts.publish("project.focused");
    await settle();
    allowed.delete("project.focused");
    parts.focus.setAuthority(slow);
    while (pending.length > 0) {
      pending.shift()?.();
      await settle();
    }

    expect(asked.length).toBeGreaterThanOrEqual(2);
    expect(browser.activity()).toEqual([]);
    expect(browser.ended()).toEqual([expect.objectContaining({ projectId: "project.focused", currentProjectId: null })]);
  });

  it("decides a burst published during one check with a single later question per project not yet decided, in publish order", async () => {
    const pending: Array<() => void> = [];
    const asked: Request[] = [];
    const parts = gatewayParts(async (request) => {
      asked.push(request);
      await new Promise<void>((resolve) => pending.push(resolve));
      return true;
    });
    const browser = parts.session({ projectId: null });

    parts.publish("project.a", 1);
    await settle();
    expect(asked).toHaveLength(1);
    for (const [projectId, sequence] of [["project.a", 2], ["project.b", 3], ["project.a", 4], ["project.b", 5]] as const) parts.publish(projectId, sequence);
    pending.shift()?.();
    await settle();
    // project.a was decided by the first question; only project.b is asked for the burst.
    expect(asked.map((request) => request.projectId)).toEqual(["project.a", "project.b"]);
    while (pending.length > 0) pending.shift()?.();
    await settle();

    expect(browser.activity()).toEqual(["project.a", "project.a", "project.b", "project.a", "project.b"]);
    expect(asked[1]).toEqual({ session: expect.objectContaining({ sessionId: browser.session.sessionId, operatorUserId: "user.alice" }), projectId: "project.b", domainId: DOMAIN });
  });

  it("sends nothing and moves nothing when the authority cannot decide, at an event or at a change, and keeps no answer", async () => {
    const asked: Request[] = [];
    const failing: ClientGatewayProjectFocusAuthority = async (request) => {
      asked.push(request);
      throw new Error("private detail");
    };
    const parts = gatewayParts(failing);
    const browser = parts.session({ projectId: "project.focused" });

    parts.publish("project.focused");
    await settle();
    parts.focus.setAuthority(failing);
    await settle();
    parts.publish("project.focused", 2);
    await settle();

    expect(asked).toHaveLength(3);

    expect(browser.activity()).toEqual([]);
    expect(browser.ended()).toEqual([]);
    expect(browser.session.projectId).toBe("project.focused");
    const audited = parts.audit.recent(20);
    expect(audited.map((entry) => entry.type)).toContain("project_focus.delivery_check_failed");
    expect(JSON.stringify(audited)).not.toContain("private detail");
  });

  it("drops what was decided for a session that left, or was focused elsewhere, while it was checked", async () => {
    const pending: Array<() => void> = [];
    const parts = gatewayParts(async () => {
      await new Promise<void>((resolve) => pending.push(resolve));
      return true;
    });
    const leaving = parts.session({ projectId: null });
    const moving = parts.session({ projectId: "project.a" });

    parts.publish("project.a");
    await settle();
    leaving.session.disconnectedAt = 2_000;
    moving.session.projectId = "project.b";
    while (pending.length > 0) pending.shift()?.();
    await settle();

    expect(leaving.activity()).toEqual([]);
    expect(moving.activity()).toEqual([]);
  });

  it("sends at once, without asking, to a session no person paired, and to everyone when no authority is installed", async () => {
    const { asked, authority } = readable();
    const parts = gatewayParts(authority);
    const standIn = parts.session({ projectId: null, standIn: true });
    parts.publish("project.a");
    expect(standIn.activity()).toEqual(["project.a"]);
    expect(asked).toEqual([]);

    const bare = gatewayParts();
    const browser = bare.session({ projectId: null });
    bare.publish("project.a");
    expect(browser.activity()).toEqual(["project.a"]);
  });

  it("reuses the allowed answer of the session's own focus for that project's first activity", async () => {
    const { asked, authority } = readable("project.chosen");
    const parts = gatewayParts(authority);
    const browser = parts.session({ projectId: null });

    await parts.focus.answer(browser.session, { id: "message.focus", type: "client.focus_project", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 1_000, payload: { projectId: "project.chosen" } });
    parts.publish("project.chosen");
    await settle();

    expect(asked).toHaveLength(1);
    expect(browser.session.projectId).toBe("project.chosen");
    expect(browser.activity()).toEqual(["project.chosen"]);
  });

  it("asks the authority installed now, so a later install governs delivery from then on", async () => {
    const parts = gatewayParts();
    const browser = parts.session({ projectId: null });
    const authority = vi.fn<ClientGatewayProjectFocusAuthority>(async () => false);
    parts.focus.setAuthority(authority);

    parts.publish("project.a");
    await settle();

    expect(authority).toHaveBeenCalledOnce();
    expect(browser.activity()).toEqual([]);
  });
});

function activity(projectId: string, sequence: number): ClientGatewayActivity {
  return { activityId: "build.1", sequence, subject: { kind: "build", id: "build.1", projectId }, phase: "running", label: "Running", at: "2026-11-17T00:00:00.000Z" };
}
