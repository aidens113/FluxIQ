import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import { startProvisioningListenerForProfile } from "../listener-for-profile";
import type { ProvisioningListenerHandle } from "../types";

const roots: string[] = [];
const handles: ProvisioningListenerHandle[] = [];
afterEach(async () => {
  for (const handle of handles.splice(0)) await handle.close();
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tokenFile(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fluxiq-listener-profile-"));
  roots.push(dir);
  const file = path.join(dir, "token");
  writeFileSync(file, `${"a".repeat(48)}\n`, { mode: 0o600 });
  return file;
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const getServices = async () => { throw new Error("not used"); };
const lines: string[] = [];
const log = (line: string) => { lines.push(line); };

describe("startProvisioningListenerForProfile", () => {
  it("starts under the service profile with both variables", async () => {
    const handle = await startProvisioningListenerForProfile({ profile: "service" }, { FLUXIQ_PROVISIONING_LISTEN: `127.0.0.1:${await freePort()}`, FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile() }, getServices, log);
    expect(handle).not.toBeNull();
    handles.push(handle!);
    expect(handle!.address.host).toBe("127.0.0.1");
  });

  it.each(["local", "self-hosted"] as const)("does not start under %s even with both variables set", async (profile) => {
    const handle = await startProvisioningListenerForProfile({ profile }, { FLUXIQ_PROVISIONING_LISTEN: `127.0.0.1:${await freePort()}`, FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile() }, getServices, log);
    expect(handle).toBeNull();
  });

  it("does not start under service without the token file", async () => {
    expect(await startProvisioningListenerForProfile({ profile: "service" }, { FLUXIQ_PROVISIONING_LISTEN: `127.0.0.1:${await freePort()}` }, getServices, log)).toBeNull();
  });

  it("refuses a public bind: the panel's port, the gateway's port, and a public source range", async () => {
    const base = { FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile() };
    await expect(startProvisioningListenerForProfile({ profile: "service" }, { ...base, FLUXIQ_PROVISIONING_LISTEN: "0.0.0.0:3000" }, getServices, log)).rejects.toThrow(ProvisioningListenerConfigError);
    await expect(startProvisioningListenerForProfile({ profile: "service" }, { ...base, FLUXIQ_PROVISIONING_LISTEN: "0.0.0.0:4777" }, getServices, log)).rejects.toThrow(/client gateway/u);
    await expect(startProvisioningListenerForProfile({ profile: "service" }, { ...base, FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:4790", FLUXIQ_PROVISIONING_ALLOWED_CIDRS: "0.0.0.0/0" }, getServices, log)).rejects.toThrow(/not inside a loopback or private range/u);
  });
});
