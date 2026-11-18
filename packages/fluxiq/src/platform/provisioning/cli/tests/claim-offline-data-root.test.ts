import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { currentProcessIdentity, fluxIQDataRootOwnerFile, processStartTime, type FluxIQDataRootOwner } from "../../../../server/data-root-owner/index.ts";
import { claimOfflineAccountsDataRoot } from "../claim-offline-data-root.ts";
import { runAccountsCommand } from "../run-accounts-command.ts";
import { selectAccountsTransport } from "../select-accounts-transport.ts";
import { cliTestIo } from "./cli-test-io.ts";

let root: string;
let server: ChildProcess | null = null;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fluxiq-accounts-offline-"));
});

afterEach(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server.kill("SIGKILL");
    await exited;
  }
  server = null;
  await rm(root, { recursive: true, force: true });
});

/** A live process recorded as the web panel serving the root, as the panel records itself. */
async function liveServerHoldsRoot(): Promise<number> {
  server = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    server!.once("spawn", () => resolve());
    server!.once("error", reject);
  });
  const self = await currentProcessIdentity();
  const pid = server.pid!;
  const startedAt = await processStartTime(pid);
  if (startedAt.kind !== "read") throw new Error(startedAt.reason);
  const owner: FluxIQDataRootOwner = {
    kind: "fluxiq.data-root-owner", version: 1, token: "panel-token", role: "the web panel", claimedAt: new Date().toISOString(),
    pid, startedAt: startedAt.value, platform: self.platform, machine: self.machine, hostname: self.hostname
  };
  await writeFile(fluxIQDataRootOwnerFile(root), JSON.stringify(owner), "utf8");
  return pid;
}

describe("offline fluxiq accounts and the data root's server", () => {
  it("refuses while a live server holds the root, and says how to use the live server", async () => {
    const pid = await liveServerHoldsRoot();
    const failure = await claimOfflineAccountsDataRoot(root).then(() => null, (error: unknown) => error as Error);
    expect(failure?.name).toBe("AccountsTransportError");
    expect(failure?.message).toContain(`the FluxIQ data at ${root} is being served by the web panel (process ${pid}`);
    expect(failure?.message).toContain("leave out --offline and set FLUXIQ_PROVISIONING_LISTEN (host:port) and FLUXIQ_PROVISIONING_TOKEN_FILE");
  });

  it("runs nothing offline while the server holds the root: the command exits 1 with the refusal", async () => {
    await liveServerHoldsRoot();
    let opened = false;
    const transport = selectAccountsTransport({}, {
      offline: true,
      async createInProcess() {
        await claimOfflineAccountsDataRoot(root);
        opened = true;
        throw new Error("the data must not be opened");
      }
    });
    const io = cliTestIo();
    const code = await runAccountsCommand(["accounts", "disableAccount", "--user-id", "user-1", "--reason", "left"], io, transport);
    expect(code).toBe(1);
    expect(opened).toBe(false);
    expect(io.err.join("")).toContain("Offline mode refused");
  });

  it("holds the root for the command once the server is gone, and gives it back", async () => {
    await liveServerHoldsRoot();
    const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server!.kill("SIGKILL");
    await exited;
    const claim = await claimOfflineAccountsDataRoot(root);
    expect(existsSync(claim.ownerFile)).toBe(true);
    await claim.release();
    expect(existsSync(claim.ownerFile)).toBe(false);
  });
});
