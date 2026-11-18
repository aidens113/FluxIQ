// @fluxiq-test-group real-sql
// The controller's enrolment port: a start hands the driver a ticket source
// opened for that environment and closed after; any intent other than running
// revokes the client's trust before the driver stops or releases anything; a
// failed revocation is reported and the operation repeats it.

import { afterEach, describe, expect, it } from "vitest";
import { FakeEnvironmentDriver } from "../index.ts";
import type { EnvironmentDriverSpec, EnvironmentEnrolment } from "../index.ts";
import { command, entitle, harness, ownerA, removeHarnessRoots } from "./fixtures.ts";

afterEach(removeHarnessRoots);

type Recorded = { events: string[]; failRevoke: Error | null; minted: number };

/** Records each call; `observe` says what the driver held when a revocation came. */
function recordingEnrolment(observe: (environmentId: string) => string = () => "?"): EnvironmentEnrolment & Recorded {
  const recorded: Recorded = { events: [], failRevoke: null, minted: 0 };
  return Object.assign(recorded, {
    open: async (spec: EnvironmentDriverSpec) => {
      recorded.events.push(`open:${spec.workspaceId}/${spec.environmentId}`);
      let open = true;
      return {
        takeEnrolmentTicket: () => {
          if (!open) throw new Error("closed");
          recorded.minted += 1;
          return `ticket-${recorded.minted}`;
        },
        close: () => {
          open = false;
          recorded.events.push(`close:${spec.environmentId}`);
        }
      };
    },
    revoke: async (spec: EnvironmentDriverSpec, reason: string) => {
      recorded.events.push(`revoke:${spec.environmentId}:${reason}:${observe(spec.environmentId)}`);
      if (recorded.failRevoke !== null) {
        const error = recorded.failRevoke;
        recorded.failRevoke = null;
        throw error;
      }
    }
  });
}

describe("environment enrolment through the controller", () => {
  it("opens enrolment around each start and hands the runner its ticket", async () => {
    const enrolment = recordingEnrolment();
    const state = await harness({ enrolment });
    entitle(state, ownerA, ["env-a"]);
    await state.controller.create(command(ownerA, "env-a", "op-create"));
    expect(enrolment.events).toEqual(["open:workspace-a/env-a", "close:env-a"]);
    expect(state.driver.tickets.get("env-a")).toBe("ticket-1");
    // A replay of a running environment starts nothing, so nothing enrols again.
    await state.controller.create(command(ownerA, "env-a", "op-create"));
    expect(enrolment.minted).toBe(1);
  });

  it("revokes before the driver stops or releases, and enrols afresh when a crash is restarted", async () => {
    const driver = new FakeEnvironmentDriver();
    const tracked = recordingEnrolment((environmentId) => driver.observation(environmentId));
    const withState = await harness({ enrolment: tracked, driver });
    entitle(withState, ownerA, ["env-a"]);
    await withState.controller.create(command(ownerA, "env-a", "op-create"));
    await withState.controller.stop(command(ownerA, "env-a", "op-stop"));
    await withState.controller.start(command(ownerA, "env-a", "op-start"));
    withState.driver.crash("env-a");
    await withState.controller.reconcile("env-a");
    await withState.controller.delete(command(ownerA, "env-a", "op-delete"));
    expect(tracked.events).toEqual([
      "open:workspace-a/env-a", "close:env-a",
      "revoke:env-a:The environment was stopped.:running",
      "open:workspace-a/env-a", "close:env-a",
      "open:workspace-a/env-a", "close:env-a",
      "revoke:env-a:The environment was deleted.:running"
    ]);
    expect(tracked.minted).toBe(3);
    // A stopped environment already at rest is not revoked again by reconcile.
    entitle(withState, ownerA, ["env-b"]);
    await withState.controller.create(command(ownerA, "env-b", "op-create-b"));
    await withState.controller.stop(command(ownerA, "env-b", "op-stop-b"));
    const before = tracked.events.length;
    await withState.controller.reconcileAll();
    expect(tracked.events.slice(before)).toEqual([]);
  });

  it("reports a failed revocation and does not record the delete finished, so repeating it revokes again", async () => {
    const enrolment = recordingEnrolment();
    const state = await harness({ enrolment });
    entitle(state, ownerA, ["env-a"]);
    await state.controller.create(command(ownerA, "env-a", "op-create"));
    enrolment.failRevoke = new Error("tenant gateway unavailable");
    await expect(state.controller.delete(command(ownerA, "env-a", "op-delete"))).rejects.toThrow("tenant gateway unavailable");
    // The resources were still released, so nothing keeps running for a client nobody revoked yet.
    expect(state.driver.observation("env-a")).toBe("absent");
    expect(await state.store.get("env-a")).toMatchObject({ desired: "deleted", observed: "absent" });
    const record = await state.controller.delete(command(ownerA, "env-a", "op-delete"));
    expect(record).toMatchObject({ desired: "deleted", observed: "deleted" });
    expect(enrolment.events.filter((event) => event.startsWith("revoke:"))).toHaveLength(2);
  });

  it("closes the enrolment when the driver's start fails", async () => {
    const enrolment = recordingEnrolment();
    const state = await harness({ enrolment });
    entitle(state, ownerA, ["env-a"]);
    state.driver.failNext("start", new Error("runner did not start"));
    await expect(state.controller.create(command(ownerA, "env-a", "op-create"))).rejects.toThrow("runner did not start");
    expect(enrolment.events).toEqual(["open:workspace-a/env-a", "close:env-a"]);
  });

  it("revokes every environment a purge erases", async () => {
    const enrolment = recordingEnrolment();
    const state = await harness({ enrolment });
    entitle(state, ownerA, ["env-a", "env-b"]);
    await state.controller.create(command(ownerA, "env-a", "op-a"));
    await state.controller.create(command(ownerA, "env-b", "op-b"));
    await state.controller.purgeWorkspace("workspace-a", "op-purge");
    expect(enrolment.events.filter((event) => event.startsWith("revoke:")).sort()).toEqual([
      "revoke:env-a:The environment was deleted.:?",
      "revoke:env-b:The environment was deleted.:?"
    ]);
  });
});
