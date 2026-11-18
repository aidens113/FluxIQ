import { describe, expect, it } from "vitest";
import { clientGatewayHostLeaseStamp as stamp } from "../../../../client-gateway/service/host-lease/index.ts";
import { automationStudioProjectHostLeaseScope } from "../../dispatch/index.ts";
import { AutomationStudioHostLeaseAuthority } from "../authority.ts";
import { AutomationStudioHostLeaseScope } from "../lease-scope.ts";
import { StubHost } from "./stub-host.ts";

const target = (domainId: string | null | undefined, sessionId = "session.a") => ({ sessionId, domainId });
const command = { actionType: "synthetic.act" };

describe("instance and domain host lease authority", () => {
  it("ignores another owner's frame and strictness, even in the same domain", async () => {
    const a = AutomationStudioHostLeaseAuthority.for({});
    const b = AutomationStudioHostLeaseAuthority.for({});
    const scope = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }), a.forDomain("same"));
    await scope.run({ role: "builder", briefId: "a" }, async (lease) => {
      expect(stamp(command, a.gatewaySource, target("same")).command?.lease).toMatchObject(lease);
      expect(stamp(command, b.gatewaySource, target("same")).command).toBe(command);
      expect(b.gatewaySource.requiresLease(target("same"))).toBe(false);
      expect(stamp({ ...command, lease }, b.gatewaySource, target("same")).refused).toBe("host_lease.holder_mismatch");
    });
  });

  it("does not stamp another domain, and cannot satisfy that domain's own strict lease", async () => {
    const owner = AutomationStudioHostLeaseAuthority.for({});
    const a = owner.forDomain("a");
    const b = owner.forDomain("b");
    const scope = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }), a);
    let release!: () => void;
    let entered!: () => void;
    const holding = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await scope.run({ role: "builder", briefId: "a" }, async (lease) => {
      expect(stamp(command, owner.gatewaySource, target("b")).command).toBe(command);
      const run = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }), b).run({ role: "builder", briefId: "b" }, async () => { entered();
        await gate; });
      try {
        await holding;
        expect(b.current()).toBeUndefined();
        expect(a.current()).toBe(lease);
        expect(stamp(command, owner.gatewaySource, target("b")).refused).toBe("host_lease.missing");
      } finally { release();
        await run; }
    });
  });

  it("keeps a released frame stale after its resource is reissued", async () => {
    const owner = AutomationStudioHostLeaseAuthority.for({});
    const binding = owner.forDomain("a");
    const scope = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }), binding);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    let late!: Promise<string | undefined>;
    await scope.run({ role: "builder", briefId: "old" }, async () => {
      late = gate.then(() => stamp(command, owner.gatewaySource, target("a")).refused);
    });
    await scope.run({ role: "builder", briefId: "new" }, async () => {
      resume();
      expect(await late).toBe("host_lease.stale");
    });
  });

  it("preserves explicit-session isolation and never stamps another session", async () => {
    const owner = AutomationStudioHostLeaseAuthority.for({});
    const binding = owner.forDomain("a");
    const scope = automationStudioProjectHostLeaseScope({ capacity: 1, acquire: () => ({ resourceKey: "one", epoch: 1, sessionId: "session.a" }), release: () => undefined }, binding);
    await scope.run({ role: "builder", briefId: "a" }, async () => {
      expect(owner.gatewaySource.requiresLease(target("a", "session.a"))).toBe(true);
      expect(owner.gatewaySource.requiresLease(target("a", "session.b"))).toBe(false);
      expect(stamp(command, owner.gatewaySource, target("a", "session.b")).command).toBe(command);
    });
  });

  it("does not turn an unbound declaration into authority or a scoped channel into a live host", async () => {
    const owner = AutomationStudioHostLeaseAuthority.for({});
    const scope = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }), owner.forDomain("a"));
    await scope.run({ role: "builder", briefId: "a" }, async (lease) => {
      expect(stamp(command, owner.gatewaySource, target(undefined)).refused).toBe("host_lease.missing");
      expect(stamp(command, owner.gatewaySource, { ...target("a"), channelScope: "offline" }).command).toBe(command);
      expect(stamp({ ...command, lease }, owner.gatewaySource, { ...target("a"), channelScope: "offline" }).refused).toBe("host_lease.holder_mismatch");
    });
  });

  it("keeps legacy/manual scopes in a separate authority namespace", async () => {
    const owner = AutomationStudioHostLeaseAuthority.for({});
    const scope = automationStudioProjectHostLeaseScope(new StubHost({ capacity: 1 }));
    await scope.run({ role: "builder", briefId: "legacy" }, async () => {
      expect(AutomationStudioHostLeaseScope.gatewaySource.requiresLease("session.a")).toBe(true);
      expect(stamp(command, owner.gatewaySource, target("a")).command).toBe(command);
    });
  });

  it("associations share exactly one scheduler per port, across owners and domains", async () => {
    const a = AutomationStudioHostLeaseAuthority.for({});
    const b = AutomationStudioHostLeaseAuthority.for({});
    const port = new StubHost({ capacity: 1 });
    const one = automationStudioProjectHostLeaseScope(port, a.forDomain("a"));
    const two = automationStudioProjectHostLeaseScope(port, a.forDomain("b"));
    const three = automationStudioProjectHostLeaseScope(port, b.forDomain("a"));
    expect(one.scheduler).toBe(two.scheduler);
    expect(two.scheduler).toBe(three.scheduler);
    expect(automationStudioProjectHostLeaseScope(port).scheduler).toBe(one.scheduler);
    expect(automationStudioProjectHostLeaseScope(port, a.forDomain("a"))).toBe(one);
    let second = false;
    let done!: Promise<void>;
    await one.run({ role: "builder", briefId: "one" }, async () => {
      done = two.run({ role: "builder", briefId: "two" }, async () => { second = true; });
      await Promise.resolve();
      expect(second).toBe(false);
      expect(one.scheduler.snapshot().waiting).toHaveLength(1);
      expect(port.asked).toBe(1);
    });
    await done;
    expect(second).toBe(true);
  });
});
