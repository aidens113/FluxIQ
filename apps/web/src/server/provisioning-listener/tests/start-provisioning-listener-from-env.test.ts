import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { ProvisioningListenerConfigError } from "../provisioning-listener-config-error";
import { startProvisioningListenerFromEnv } from "../start-provisioning-listener-from-env";
import type { ProvisioningListenerHandle } from "../types";
import { createRunDirectory, createTestServices, newToken, postToListener } from "./listener-fixture";

// The environment entry: off without a token file, and every public-bind or
// malformed configuration refused at start with a message holding no token.

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function tokenFileWith(lines: readonly string[]): Promise<string> {
  const run = await createRunDirectory();
  cleanups.push(run.remove);
  const file = path.join(run.directory, "provisioning-token");
  await writeFile(file, `${lines.join("\n")}\n`, "utf8");
  return file;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = address !== null && typeof address === "object" ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function refusal(env: Record<string, string>): Promise<ProvisioningListenerConfigError> {
  const services = await createTestServices();
  try {
    const handle = await startProvisioningListenerFromEnv(env, async () => services.services, { log: () => undefined });
    if (handle !== null) cleanups.push(() => handle.close());
  } catch (error) {
    if (error instanceof ProvisioningListenerConfigError) return error;
    throw error;
  }
  throw new Error("expected the listener to refuse to start");
}

describe("startProvisioningListenerFromEnv", () => {
  it("is off without FLUXIQ_PROVISIONING_TOKEN_FILE, whatever else is set", async () => {
    const services = await createTestServices();
    expect(await startProvisioningListenerFromEnv({}, async () => services.services)).toBeNull();
    expect(await startProvisioningListenerFromEnv({ FLUXIQ_PROVISIONING_TOKEN_FILE: "  ", FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:4780" }, async () => services.services)).toBeNull();
  });

  it("starts on the configured address and serves the website's token", async () => {
    const token = newToken();
    const tokenFile = await tokenFileWith([token]);
    const port = await freePort();
    const { services } = await createTestServices();
    const logs: string[] = [];
    const handle: ProvisioningListenerHandle | null = await startProvisioningListenerFromEnv(
      { FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile, FLUXIQ_PROVISIONING_LISTEN: `127.0.0.1:${port}`, FLUXIQ_PROVISIONING_ALLOWED_CIDRS: "127.0.0.1/32, 10.0.0.0/8" },
      async () => services,
      { log: (line) => logs.push(line) }
    );
    if (handle === null) throw new Error("expected the listener to start");
    cleanups.push(() => handle.close());
    expect(handle.address).toEqual({ host: "127.0.0.1", port });
    const reply = await postToListener(handle, "getAccount", { email: "nobody@example.test" }, { token });
    expect(reply.status).toBe(404);
    expect(logs).toHaveLength(1);
  });

  it("requires FLUXIQ_PROVISIONING_LISTEN and refuses a malformed one", async () => {
    const tokenFile = await tokenFileWith([newToken()]);
    expect((await refusal({ FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile })).message).toMatch(/FLUXIQ_PROVISIONING_LISTEN/u);
    for (const listen of ["4780", "127.0.0.1", "127.0.0.1:0", "127.0.0.1:65536", "example.com:4780", "::1:4780", "127.0.0.1:47a0"]) {
      expect((await refusal({ FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile, FLUXIQ_PROVISIONING_LISTEN: listen })).message).toMatch(/FLUXIQ_PROVISIONING_LISTEN/u);
    }
  });

  it("refuses the panel's and the client gateway's ports, default or configured", async () => {
    const tokenFile = await tokenFileWith([newToken()]);
    const base = { FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile };
    expect((await refusal({ ...base, FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:3000" })).message).toMatch(/the panel \(PORT\)/u);
    expect((await refusal({ ...base, FLUXIQ_PROVISIONING_LISTEN: "0.0.0.0:8080", PORT: "8080" })).message).toMatch(/the panel \(PORT\)/u);
    expect((await refusal({ ...base, FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:4777" })).message).toMatch(/client gateway/u);
    expect((await refusal({ ...base, FLUXIQ_PROVISIONING_LISTEN: "[::1]:5555", FLUXIQ_CLIENT_GATEWAY_PORT: "5555" })).message).toMatch(/client gateway/u);
  });

  it("refuses an allowlist entry that is public or invalid", async () => {
    const tokenFile = await tokenFileWith([newToken()]);
    const base = { FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile, FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:4780" };
    for (const cidrs of ["0.0.0.0/0", "10.0.0.0/8,8.8.8.0/24", "::/0", "::ffff:0.0.0.0/96", "10.0.0.0/7", "172.32.0.0/16", "fe80::/10", "2001:db8::/32"]) {
      expect((await refusal({ ...base, FLUXIQ_PROVISIONING_ALLOWED_CIDRS: cidrs })).message).toMatch(/not inside a loopback or private range/u);
    }
    for (const cidrs of ["10.0.0.0/33", "not-an-address", "10.0.0.0/8/8", "10.0.0.0/-1", "fd00::/129"]) {
      expect((await refusal({ ...base, FLUXIQ_PROVISIONING_ALLOWED_CIDRS: cidrs })).message).toMatch(/is not a CIDR/u);
    }
  });

  it("refuses a token file that is missing, empty, holds three tokens, or a token under 32 bytes, naming no token", async () => {
    const short = "s".repeat(31);
    const listen = { FLUXIQ_PROVISIONING_LISTEN: "127.0.0.1:4780" };
    const run = await createRunDirectory();
    cleanups.push(run.remove);
    expect((await refusal({ ...listen, FLUXIQ_PROVISIONING_TOKEN_FILE: path.join(run.directory, "missing") })).message).toMatch(/could not be read/u);
    expect((await refusal({ ...listen, FLUXIQ_PROVISIONING_TOKEN_FILE: await tokenFileWith(["", "  "]) })).message).toMatch(/holds no token/u);
    const three = [newToken(), newToken(), newToken()];
    const tooMany = await refusal({ ...listen, FLUXIQ_PROVISIONING_TOKEN_FILE: await tokenFileWith(three) });
    expect(tooMany.message).toMatch(/3 tokens/u);
    for (const token of three) expect(tooMany.message).not.toContain(token);
    const valid = newToken();
    const shortRefusal = await refusal({ ...listen, FLUXIQ_PROVISIONING_TOKEN_FILE: await tokenFileWith([valid, short]) });
    expect(shortRefusal.message).toMatch(/shorter than 32 bytes/u);
    expect(shortRefusal.message).not.toContain(short);
    expect(shortRefusal.message).not.toContain(valid);
  });
});
