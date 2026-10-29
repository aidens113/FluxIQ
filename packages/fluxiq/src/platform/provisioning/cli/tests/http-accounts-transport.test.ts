import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PlatformProvisioning } from "../../types.ts";
import { accountsArgvOffline, httpAccountsTransport, runAccountsCommand, selectAccountsTransport } from "../index.ts";
import { cliTestIo } from "./cli-test-io.ts";

type Seen = { method: string | undefined; url: string | undefined; headers: IncomingHttpHeaders; body: string };

const TOKEN = "tok-current-1234567890";
const OLD_TOKEN = "tok-previous-0987654321";
const SECRET = "correct-horse-battery-staple-9";

let server: Server;
let listen: string;
let dir: string;
let tokenFile: string;
let seen: Seen[];
let reply: { status: number; body: string };

beforeEach(async () => {
  seen = [];
  reply = { status: 200, body: JSON.stringify({ ok: true, result: { status: "accepted" } }) };
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString("utf8") });
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(reply.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  listen = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-accounts-cli-"));
  tokenFile = path.join(dir, "tokens");
  await writeFile(tokenFile, `\n  ${TOKEN}  \n${OLD_TOKEN}\n`);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
});

describe("http accounts transport", () => {
  it("POSTs the input to /provisioning/<op> with the first token line as bearer", async () => {
    const io = cliTestIo();
    const code = await runAccountsCommand(["accounts", "sendWelcome", "--email", "a@b.co", "--request-id", "r1"], io, httpAccountsTransport({ listen, tokenFile }));
    expect(code).toBe(0);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.url).toBe("/provisioning/sendWelcome");
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ email: "a@b.co", requestId: "r1" });
    expect(io.out.join("")).toBe(`${JSON.stringify({ ok: true, result: { status: "accepted" } })}\n`);
    expect(io.out.join("") + io.err.join("")).not.toContain(TOKEN);
  });

  it("treats a wildcard listen address as loopback", async () => {
    const port = listen.split(":")[1];
    const io = cliTestIo();
    expect(await runAccountsCommand(["accounts", "sendWelcome", "--email", "a@b.co"], io, httpAccountsTransport({ listen: `0.0.0.0:${port}`, tokenFile }))).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it("passes a typed error answer through with exit 1", async () => {
    reply = { status: 404, body: JSON.stringify({ ok: false, error: { code: "not_found", message: "no such account" } }) };
    const io = cliTestIo();
    expect(await runAccountsCommand(["accounts", "getAccount", "--user-id", "u1"], io, httpAccountsTransport({ listen, tokenFile }))).toBe(1);
    expect(io.out.join("")).toContain('"code":"not_found"');
  });

  it("fails without echoing the body when the answer is not JSON or not a response", async () => {
    for (const body of ["<html>secret-page</html>", JSON.stringify({ ok: true, result: { surprise: 1 } })]) {
      reply = { status: 502, body };
      const io = cliTestIo();
      expect(await runAccountsCommand(["accounts", "sendWelcome", "--email", "a@b.co"], io, httpAccountsTransport({ listen, tokenFile }))).toBe(1);
      expect(io.out).toEqual([]);
      expect(io.err.join("")).not.toContain("secret-page");
      expect(io.err.join("")).not.toContain("surprise");
      expect(io.err.join("")).toContain("502");
    }
  });

  it("fails with a safe message for an empty token file and an unreachable listener", async () => {
    await writeFile(tokenFile, "\n  \n");
    const empty = cliTestIo();
    expect(await runAccountsCommand(["accounts", "sendWelcome", "--email", "a@b.co"], empty, httpAccountsTransport({ listen, tokenFile }))).toBe(1);
    expect(seen).toHaveLength(0);
    await writeFile(tokenFile, TOKEN);
    const down = cliTestIo();
    expect(await runAccountsCommand(["accounts", "sendWelcome", "--email", "a@b.co"], down, httpAccountsTransport({ listen: "127.0.0.1:1", tokenFile }))).toBe(1);
    expect(down.err.join("")).not.toContain(TOKEN);
  });

  it("refuses setPassword over http without a request, and a password in any http input", async () => {
    const setPassword = cliTestIo({ stdin: SECRET });
    expect(await runAccountsCommand(["accounts", "setPassword", "--user-id", "u1", "--password-stdin"], setPassword, httpAccountsTransport({ listen, tokenFile }))).toBe(1);
    expect(setPassword.out.join("")).toContain("setPassword needs --offline (in-process, server stopped)");
    const create = cliTestIo({ stdin: SECRET });
    const createArgs = ["accounts", "createAccount", "--email", "a@b.co", "--display-name", "A", "--policy", "P", "--workspace", "new", "--password-stdin"];
    expect(await runAccountsCommand(createArgs, create, httpAccountsTransport({ listen, tokenFile }))).toBe(1);
    expect(seen).toHaveLength(0);
    for (const io of [setPassword, create]) expect(io.out.join("") + io.err.join("")).not.toContain(SECRET);
  });
});

describe("select accounts transport", () => {
  const calls: { operation: string; caller: unknown }[] = [];
  const createInProcess = async (): Promise<PlatformProvisioning> => ({
    run: (async (operation: string, _input: unknown, caller: unknown) => {
      calls.push({ operation, caller });
      return { ok: true, result: { status: "accepted" } };
    }) as unknown as PlatformProvisioning["run"]
  });

  it("goes in-process as platform-admin with --offline, or without the listener variables", async () => {
    calls.length = 0;
    const env = { FLUXIQ_PROVISIONING_LISTEN: listen, FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile };
    expect(accountsArgvOffline(["accounts", "getAccount", "--offline"])).toBe(true);
    for (const transport of [selectAccountsTransport(env, { offline: true, createInProcess }), selectAccountsTransport({}, { offline: false, createInProcess })]) {
      expect(await transport.run("sendWelcome", {})).toEqual({ ok: true, result: { status: "accepted" } });
    }
    expect(calls).toEqual([
      { operation: "sendWelcome", caller: { kind: "platform-admin", transport: "in-process" } },
      { operation: "sendWelcome", caller: { kind: "platform-admin", transport: "in-process" } }
    ]);
    expect(seen).toHaveLength(0);
  });

  it("uses http when both variables are set, and reports a half configuration", async () => {
    const http = selectAccountsTransport({ FLUXIQ_PROVISIONING_LISTEN: listen, FLUXIQ_PROVISIONING_TOKEN_FILE: tokenFile }, { offline: false, createInProcess });
    await http.run("sendWelcome", { email: "a@b.co", requestId: "r1" });
    expect(seen).toHaveLength(1);
    const half = selectAccountsTransport({ FLUXIQ_PROVISIONING_LISTEN: listen }, { offline: false, createInProcess });
    await expect(half.run("sendWelcome", {})).rejects.toThrow("set both");
  });
});
