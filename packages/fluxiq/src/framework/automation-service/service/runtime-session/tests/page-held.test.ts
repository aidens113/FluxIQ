import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioHostResourcePort } from "../../../../../runtime/automation-host/index.ts";
import { automationStudioProjectHostLeaseScope } from "../../../../../runtime/project-agents/index.ts";
import { AUTOMATION_STUDIO_PAGE_HELD_MESSAGE, admitAutomationStudioRuntimeSession } from "../admission.ts";
import { automationStudioPageHeldReader } from "../page-held.ts";

function hostOfOne(): AutomationStudioHostResourcePort {
  let epoch = 0;
  let held = false;
  return {
    capacity: 1,
    acquire: () => {
      if (held) return "at_capacity";
      held = true;
      epoch += 1;
      return { resourceKey: "host.one", epoch, sessionId: "session.one" };
    },
    release: () => { held = false; }
  };
}

function session(status: AutomationStudioRuntimeSession["status"], metadata: NonNullable<AutomationStudioRuntimeSession["metadata"]>): AutomationStudioRuntimeSession {
  return { schemaVersion: "0.1", runId: "run.other", projectId: "project.one", targetKind: "flow", targetId: "flow.one", flowId: "flow.one", status, queuedAt: 1, flow: { flowId: "flow.one" } as AutomationStudioRuntimeSession["flow"], metadata };
}

function setup(options: { hostResources?: AutomationStudioHostResourcePort; sessions?: () => Promise<AutomationStudioRuntimeSession[]> } = {}) {
  const started = session("queued", {});
  const ports = {
    admissions: new Set<string>(),
    listRuntimeSessions: vi.fn(options.sessions ?? (async () => [])),
    startRuntimeSession: vi.fn(async () => started)
  };
  const pageHeld = automationStudioPageHeldReader({ hostResources: options.hostResources, listRuntimeSessions: ports.listRuntimeSessions });
  return { ports, pageHeld, started, admit: (adaptive: boolean) => admitAutomationStudioRuntimeSession({ ...ports, pageHeld }, "project.one", adaptive) };
}

describe("a plain run's start while another run holds the page", () => {
  const open: Array<() => void> = [];
  afterEach(() => { while (open.length) open.pop()?.(); });

  async function hold(port: AutomationStudioHostResourcePort): Promise<void> {
    const scope = automationStudioProjectHostLeaseScope(port);
    let release!: () => void;
    const ended = new Promise<void>((resolve) => { release = resolve; });
    let inside!: () => void;
    const entered = new Promise<void>((resolve) => { inside = resolve; });
    open.push(release);
    void scope.run({ role: "part-run", briefId: "holder" }, async () => {
      inside();
      await ended;
    });
    await entered;
  }

  it("is refused while a lease is held, in the words of a part's refusal, and writes no session", async () => {
    const port = hostOfOne();
    const { admit, ports } = setup({ hostResources: port });
    await hold(port);
    await expect(admit(false)).rejects.toThrow(AUTOMATION_STUDIO_PAGE_HELD_MESSAGE);
    await expect(admit(true)).rejects.toThrow(AUTOMATION_STUDIO_PAGE_HELD_MESSAGE);
    expect(ports.startRuntimeSession).not.toHaveBeenCalled();
  });

  it("is allowed once the lease is released", async () => {
    const port = hostOfOne();
    const { admit, started } = setup({ hostResources: port });
    await hold(port);
    await expect(admit(false)).rejects.toThrow();
    open.pop()?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(admit(false)).resolves.toBe(started);
  });

  it("is refused while a part run's session is active, and allowed once it ended", async () => {
    let current = session("running", { partRun: { caller: "person" } });
    const { admit, started } = setup({ sessions: async () => [current] });
    await expect(admit(false)).rejects.toThrow(AUTOMATION_STUDIO_PAGE_HELD_MESSAGE);
    current = session("succeeded", { partRun: { caller: "person" } });
    await expect(admit(false)).resolves.toBe(started);
  });

  it("is not refused by a plain session that is active: that is the adaptive gate's business", async () => {
    const { admit, started } = setup({ sessions: async () => [session("running", {})] });
    await expect(admit(false)).resolves.toBe(started);
  });

  it("is not refused inside a lease scope: that run holds the page itself", async () => {
    const port = hostOfOne();
    const { admit, started } = setup({ hostResources: port, sessions: async () => [session("running", { partRun: { caller: "build" } })] });
    const scope = automationStudioProjectHostLeaseScope(port);
    await expect(scope.run({ role: "builder", briefId: "brief.1" }, async () => await admit(false))).resolves.toBe(started);
  });

  it("is refused when the sessions cannot be listed", async () => {
    const { admit, ports } = setup({ sessions: async () => { throw new Error("the store is away"); } });
    await expect(admit(false)).rejects.toThrow(AUTOMATION_STUDIO_PAGE_HELD_MESSAGE);
    expect(ports.startRuntimeSession).not.toHaveBeenCalled();
  });

  it("with no port given, asks nothing and behaves as before", async () => {
    const ports = { admissions: new Set<string>(), listRuntimeSessions: vi.fn(async () => { throw new Error("not read"); }), startRuntimeSession: vi.fn(async () => session("queued", {})) };
    await expect(admitAutomationStudioRuntimeSession(ports, "project.one", false)).resolves.toBeDefined();
    expect(ports.listRuntimeSessions).not.toHaveBeenCalled();
  });
});
