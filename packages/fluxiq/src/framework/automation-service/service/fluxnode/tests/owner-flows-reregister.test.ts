// @fluxiq-test-group real-sql
// A spec's hash covers identity only, so the same name and hash can come back with other options or another check:
// the registry then holds the new spec on the same Flow (kept hash, Flow id and latest), writes nothing when the
// spec is the same, and a registry read back from the Flows after a restart holds the new spec too.
import { fluxNodeSpecSchema } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { findLoansSpec, fluxNodeLane } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const spec = (over = {}) => fluxNodeSpecSchema.parse(findLoansSpec({ options: { judge: "off", retries: 3 }, ...over }));

describe("re-registering a FluxNode spec with the same name and hash", () => {
  it("holds the changed options and check on the same Flow, writes nothing for an identical spec, and keeps it across a restart", async () => {
    const lane = await fluxNodeLane(cleanups);
    const flows = new FluxNodeOwnerFlows(lane.service, "library", () => 1);
    const first = await flows.register(spec());
    const save = vi.spyOn(lane.service, "saveFlow");

    const same = await flows.register(spec());
    expect(same).toMatchObject({ created: false });
    expect(same.registered).toBe(first.registered);
    expect(save).not.toHaveBeenCalled();

    const options = await flows.register(spec({ options: { judge: "always", retries: 4 } }));
    expect(options.created).toBe(false);
    expect(options.registered).toMatchObject({ flowId: first.registered.flowId, specHash: first.registered.specHash, spec: { options: { judge: "always", retries: 4 } } });
    expect(save).toHaveBeenCalledTimes(1);

    const check = await flows.register(spec({ options: { judge: "always", retries: 4 }, hasCheck: false }));
    expect(check.registered.spec.hasCheck).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
    const found = await flows.find("library.find-loans");
    expect(found).toMatchObject({ found: { spec: { hasCheck: false, options: { judge: "always", retries: 4 } }, flowId: first.registered.flowId } });

    const restarted = new FluxNodeOwnerFlows(lane.service, "library", () => 2);
    const back = await restarted.find("library.find-loans", first.registered.specHash);
    expect(back).toMatchObject({ found: { flowId: first.registered.flowId, spec: { hasCheck: false, options: { judge: "always", retries: 4 } } } });
  });

  it("keeps an older spec's place: a changed spec under an older hash does not become the latest", async () => {
    const lane = await fluxNodeLane(cleanups);
    const flows = new FluxNodeOwnerFlows(lane.service, "library", () => 1);
    const older = await flows.register(spec());
    const newer = await flows.register(spec({ goal: "List every loan whose title has {title}." }));
    await flows.register(spec({ options: { judge: "always" } }));
    expect(await flows.find("library.find-loans")).toMatchObject({ found: { specHash: newer.registered.specHash } });
    expect(await flows.find("library.find-loans", older.registered.specHash)).toMatchObject({ found: { spec: { options: { judge: "always" } } } });
  });

  it("a run by the same name and hash uses the new options", async () => {
    const lane = await fluxNodeLane(cleanups);
    await lane.fluxNodes.register({ principal: "owner", policy: "FluxNodeRunner", via: "open_mode" }, { spec: spec({ options: { judge: "off" } }) });
    const run = await lane.run({ spec: spec({ options: { judge: "off", budgetUsd: 0 } }), inputs: { title: "Atlas" } });
    expect(run.result).toMatchObject({ status: "budget_out" });
  });
});
