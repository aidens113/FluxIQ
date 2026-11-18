import { describe, expect, it } from "vitest";
import { automationStudioProjectHostLeaseScope } from "../../../runtime/project-agents/dispatch/index.ts";
import { AutomationStudioHostLeaseAuthority } from "../../../runtime/project-agents/host-resources/index.ts";
import { runtimeHostLeaseFixture } from "./runtime-host-lease-fixture.ts";

describe("independent program runtime host lease authority", () => {
  it("a session-less strict grant on A's port does not block B's same-domain gateway", async () => {
    const a = await runtimeHostLeaseFixture("a");
    const b = await runtimeHostLeaseFixture("b");
    let held!: () => void;
    const holding = new Promise<void>((resolve) => { held = resolve; });
    let release!: () => void;
    const stopped = new Promise<void>((resolve) => { release = resolve; });
    const run = automationStudioProjectHostLeaseScope(a.port, AutomationStudioHostLeaseAuthority.for(a.runtime.automationStudio).forDomain("synthetic.same-domain")).run({ role: "builder", briefId: "brief.a" }, async () => {
      held();
      await stopped;
    });
    try {
      await holding;
      expect((await a.act("own.unleased")).failure?.code).toBe("host_lease.missing");
      expect((await b.act("other.unleased")).status).toBe("succeeded");
      expect(b.actions).toHaveLength(1);
      expect(b.actions[0]).not.toHaveProperty("lease");
    } finally {
      release();
      await run;
      await Promise.all([a.close(), b.close()]);
    }
  });

  it("B's otherwise permitted same-domain command never carries A's ambient lease", async () => {
    const a = await runtimeHostLeaseFixture("ambient.a");
    const b = await runtimeHostLeaseFixture("ambient.b");
    try {
      await automationStudioProjectHostLeaseScope(a.port, AutomationStudioHostLeaseAuthority.for(a.runtime.automationStudio).forDomain("synthetic.same-domain")).run({ role: "builder", briefId: "brief.ambient.a" }, async () => {
        expect((await b.act("other.ambient")).status).toBe("succeeded");
        expect(b.actions).toHaveLength(1);
        expect(b.actions[0]).not.toHaveProperty("lease");
      });
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
});
