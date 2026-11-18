import { afterEach, describe, expect, it } from "vitest";
import { localSetupCode } from "../setup-code";
import { prepareLocalFirstRun } from "../prepare-first-run";
import { createLocalInstance, type LocalInstance } from "./local-instance";

// What a local start prints and does, over a real identity store: a new
// install, an install whose admin is still on the temporary password (with
// the sweep of its sessions), and a claimed one.

const ORIGIN = "http://127.0.0.1:3200";
let instance: LocalInstance | undefined;

afterEach(async () => {
  localSetupCode.spend();
  await instance?.close();
  instance = undefined;
});

function start(fluxiq: LocalInstance["fluxiq"]) {
  const lines: string[] = [];
  return { lines, run: () => prepareLocalFirstRun({ identity: fluxiq.programs.identityAccess, origin: ORIGIN, log: (line) => lines.push(line) }) };
}

describe("prepareLocalFirstRun", { timeout: 120_000 }, () => {
  it("a new install has no account, prints a setup link whose code is after #, and the temporary password opens nothing", async () => {
    instance = await createLocalInstance("new-install");
    const identity = instance.fluxiq.programs.identityAccess;
    const { lines, run } = start(instance.fluxiq);
    const first = await run();
    expect(first).toMatchObject({ state: "unclaimed", revokedSessions: 0 });
    const link = new URL(first.link ?? "");
    expect(link.origin).toBe(ORIGIN);
    expect(link.pathname).toBe("/setup");
    // The code is in the fragment, which a browser never sends: no query, nothing after the path.
    expect(link.search).toBe("");
    expect(localSetupCode.check(link.hash.slice(1))).toBe("valid");
    expect(lines).toEqual([expect.stringContaining(`open ${first.link} to choose your name and password`)]);
    expect((await identity.snapshot()).users).toEqual([]);
    await expect(identity.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();
  });

  it("an existing install on the temporary password ends that admin's sessions and prints a fresh link", async () => {
    instance = await createLocalInstance("existing-install");
    const identity = instance.fluxiq.programs.identityAccess;
    // Sessions made before the temporary password stopped opening one.
    await identity.createSession("admin");
    await identity.createSession("admin");
    const { lines, run } = start(instance.fluxiq);
    const first = await run();
    expect(first).toMatchObject({ state: "temporary-admin", revokedSessions: 2 });
    expect((await identity.snapshot()).sessions.filter((session) => session.userId === "admin")).toEqual([]);
    expect(lines[0]).toContain("Ended 2 session(s) of the default admin account");
    expect(lines[1]).toContain(`open ${first.link}`);

    // The next start prints a different link; the last one stops working.
    const second = await run();
    expect(second.link).not.toBe(first.link);
    expect(localSetupCode.check(new URL(first.link ?? "").hash.slice(1))).toBe("wrong");
    expect(second.revokedSessions).toBe(0);
  });

  it("a claimed install prints nothing and keeps its sessions", async () => {
    instance = await createLocalInstance("new-install");
    const identity = instance.fluxiq.programs.identityAccess;
    const owner = await identity.upsertUser({ username: "owner", displayName: "owner", roleId: "admin", password: "a dummy owner password" });
    await identity.createSession(owner.id);
    const { lines, run } = start(instance.fluxiq);
    expect(await run()).toEqual({ state: "claimed", link: null, revokedSessions: 0 });
    expect(lines).toEqual([]);
    expect(localSetupCode.check("anything")).toBe("none");
    expect((await identity.snapshot()).sessions).toHaveLength(1);
  });
});
