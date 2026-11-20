// The local-process driver: one managed host per environment through the
// launcher, with its own named profile directory, enrolled with the ticket its
// start was handed, never anywhere the launcher could print it.

import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FluxIQHostLaunchRequest } from "../../../../server/managed-hosts/index.ts";
import { environmentHostId } from "../../enrolment/index.ts";
import { LocalProcessEnvironmentDriver } from "../index.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

type Launched = { request: Omit<FluxIQHostLaunchRequest, "takeEnrolmentTicket">; ticket: string; exit(): void; closes: number };

function fakeLauncher(): { launcher: { launch(request: FluxIQHostLaunchRequest): Promise<{ hostId: string; close(): Promise<void>; closed: Promise<void> }> }; launched: Launched[] } {
  const launched: Launched[] = [];
  return {
    launched,
    launcher: {
      launch: async (request) => {
        let exit = (): void => undefined;
        const closed = new Promise<void>((resolve) => { exit = resolve; });
        const { takeEnrolmentTicket, ...rest } = request;
        const entry: Launched = { request: rest, ticket: takeEnrolmentTicket(), exit, closes: 0 };
        launched.push(entry);
        const close = async (): Promise<void> => {
          entry.closes += 1;
          exit();
        };
        return { hostId: request.hostId, closed, close };
      }
    }
  };
}

async function driverIn(): Promise<{ driver: LocalProcessEnvironmentDriver; launched: Launched[]; dataDir: string }> {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-local-environments-"));
  roots.push(dataDir);
  const { launcher, launched } = fakeLauncher();
  const driver = new LocalProcessEnvironmentDriver({ launcher, dataDir, gatewayUrl: "ws://127.0.0.1:1/gateway", coreApiUrl: "http://127.0.0.1:1", headless: true });
  return { driver, launched, dataDir };
}

const spec = { environmentId: "env-a", accountId: "account-a", workspaceId: "workspace-a" };
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("the local-process environment driver", () => {
  it("allocates a profile, launches one named host enrolled with the start's ticket, and observes each transition", async () => {
    const { driver, launched, dataDir } = await driverIn();
    expect(await driver.inspect(spec)).toBe("absent");
    await driver.allocate(spec);
    expect(await driver.inspect(spec)).toBe("stopped");
    let minted = 0;
    await driver.start(spec, { takeEnrolmentTicket: () => `ticket-${++minted}` });
    expect(await driver.inspect(spec)).toBe("running");
    expect(launched).toHaveLength(1);
    expect(launched[0]?.ticket).toBe("ticket-1");
    expect(launched[0]?.request).toMatchObject({ hostId: environmentHostId("env-a"), dataDir: path.join(path.resolve(dataDir), "env-a"), profile: { kind: "named", name: "env-a" }, headless: true });
    expect(JSON.stringify(launched[0]?.request)).not.toContain("ticket-1");
    // Starting what runs launches nothing more.
    await driver.start(spec, { takeEnrolmentTicket: () => `ticket-${++minted}` });
    expect(launched).toHaveLength(1);
    await driver.stop(spec);
    expect(launched[0]?.closes).toBe(1);
    expect(await driver.inspect(spec)).toBe("stopped");
    await driver.release(spec);
    expect(await driver.inspect(spec)).toBe("absent");
    await expect(stat(path.join(dataDir, "env-a"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("observes a host that went away unasked as crashed, and starts it again with a fresh ticket", async () => {
    const { driver, launched } = await driverIn();
    await driver.allocate(spec);
    let minted = 0;
    const tickets = { takeEnrolmentTicket: () => `ticket-${++minted}` };
    await driver.start(spec, tickets);
    launched[0]?.exit();
    await flush();
    expect(await driver.inspect(spec)).toBe("crashed");
    await driver.start(spec, tickets);
    expect(launched).toHaveLength(2);
    expect(launched[1]?.ticket).toBe("ticket-2");
    expect(await driver.inspect(spec)).toBe("running");
    await driver.closeAll();
    expect(await driver.inspect(spec)).toBe("stopped");
  });

  it("refuses to start without an enrolment ticket source or an allocation, and refuses ids outside its directory", async () => {
    const { driver, launched } = await driverIn();
    await expect(driver.start(spec)).rejects.toThrow("enrolment");
    await expect(driver.start(spec, { takeEnrolmentTicket: () => "ticket" })).rejects.toThrow("not allocated");
    await expect(driver.allocate({ ...spec, environmentId: ".." })).rejects.toThrow(TypeError);
    expect(launched).toHaveLength(0);
  });
});
