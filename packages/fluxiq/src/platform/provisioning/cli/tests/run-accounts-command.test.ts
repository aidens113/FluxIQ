import type { PlatformProvisioningResponse } from "@fluxiq/contracts/platform";
import { describe, expect, it } from "vitest";
import { runAccountsCommand, type AccountsCommandTransport } from "../index.ts";
import { cliTestIo } from "./cli-test-io.ts";

const SECRET = "correct-horse-battery-staple-9";

function recordingTransport(answer: PlatformProvisioningResponse<unknown> = { ok: true, result: { status: "accepted" } }) {
  const calls: { operation: string; input: Record<string, unknown> }[] = [];
  const transport: AccountsCommandTransport = {
    run: async (operation, input) => {
      calls.push({ operation, input: input as Record<string, unknown> });
      return answer;
    }
  };
  return { calls, transport };
}

describe("accounts flag parsing", () => {
  it("maps createAccount flags to the input and adds a request id", async () => {
    const { calls, transport } = recordingTransport();
    const io = cliTestIo();
    const code = await runAccountsCommand(["accounts", "createAccount", "--email", "a@b.co", "--display-name", "Ada L", "--policy", "FluxIQOwnerFullAccess", "--policy", "Other", "--workspace", "new", "--send-welcome"], io, transport);
    expect(code).toBe(0);
    expect(calls[0]?.operation).toBe("createAccount");
    expect(calls[0]?.input).toMatchObject({ email: "a@b.co", displayName: "Ada L", policies: ["FluxIQOwnerFullAccess", "Other"], workspace: "new", sendWelcome: true });
    expect(calls[0]?.input.requestId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(io.out.join("")).toBe(`${JSON.stringify({ ok: true, result: { status: "accepted" } })}\n`);
  });

  it("keeps a given request id and accepts --flag=value", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "disableAccount", "--user-id=u1", "--reason=abuse", "--request-id", "r-1"], cliTestIo(), transport);
    expect(calls[0]?.input).toEqual({ userId: "u1", reason: "abuse", requestId: "r-1" });
  });

  it("sends no request id for getAccount", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "getAccount", "--email", "a@b.co"], cliTestIo(), transport);
    expect(calls[0]?.input).toEqual({ email: "a@b.co" });
  });

  it("maps --workspace to workspaceId for addMember and setPolicies", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "addMember", "--user-id", "u1", "--workspace", "w1", "--policy", "P"], cliTestIo(), transport);
    await runAccountsCommand(["accounts", "setPolicies", "--user-id", "u1", "--workspace", "w2", "--policy", "P"], cliTestIo(), transport);
    expect(calls.map((call) => call.input.workspaceId)).toEqual(["w1", "w2"]);
    expect(calls[0]?.input).not.toHaveProperty("workspace");
  });

  it("maps scope and mode", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "rotateCredentials", "--user-id", "u1", "--scope", "all"], cliTestIo(), transport);
    await runAccountsCommand(["accounts", "deleteAccount", "--user-id", "u1", "--mode", "scheduled"], cliTestIo(), transport);
    expect(calls[0]?.input).toMatchObject({ userId: "u1", scope: "all" });
    expect(calls[1]?.input).toMatchObject({ userId: "u1", mode: "scheduled" });
  });

  it("takes --json inline and lets flags override it", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "enableAccount", "--json", JSON.stringify({ userId: "u1", reason: "old" }), "--reason", "new"], cliTestIo(), transport);
    expect(calls[0]?.input).toMatchObject({ userId: "u1", reason: "new" });
  });

  it("takes --json - from stdin", async () => {
    const { calls, transport } = recordingTransport();
    await runAccountsCommand(["accounts", "enableAccount", "--json", "-"], cliTestIo({ stdin: JSON.stringify({ userId: "u9", reason: "back" }) }), transport);
    expect(calls[0]?.input).toMatchObject({ userId: "u9", reason: "back" });
  });
});

describe("accounts passwords", () => {
  it("refuses --password and --password=, without echoing the value", async () => {
    for (const args of [["--password", SECRET], [`--password=${SECRET}`]]) {
      const { calls, transport } = recordingTransport();
      const io = cliTestIo();
      const code = await runAccountsCommand(["accounts", "setPassword", "--user-id", "u1", ...args], io, transport);
      expect(code).toBe(2);
      expect(calls).toHaveLength(0);
      expect(io.err.join("") + io.out.join("")).not.toContain(SECRET);
    }
  });

  it("refuses a password inside inline --json but accepts one on stdin", async () => {
    const { calls, transport } = recordingTransport();
    const inline = cliTestIo();
    expect(await runAccountsCommand(["accounts", "setPassword", "--json", JSON.stringify({ userId: "u1", password: SECRET })], inline, transport)).toBe(2);
    expect(inline.err.join("")).not.toContain(SECRET);
    expect(calls).toHaveLength(0);
    const stdin = cliTestIo({ stdin: JSON.stringify({ userId: "u1", password: SECRET }) });
    expect(await runAccountsCommand(["accounts", "setPassword", "--json", "-"], stdin, transport)).toBe(0);
    expect(calls[0]?.input.password).toBe(SECRET);
    expect(stdin.out.join("") + stdin.err.join("")).not.toContain(SECRET);
  });

  it("reads --password-stdin without its newline and never echoes it", async () => {
    const { calls, transport } = recordingTransport({ ok: true, result: { status: "updated", sessionsRevoked: 0 } });
    const io = cliTestIo({ stdin: `${SECRET}\n` });
    expect(await runAccountsCommand(["accounts", "setPassword", "--user-id", "u1", "--password-stdin"], io, transport)).toBe(0);
    expect(calls[0]?.input.password).toBe(SECRET);
    expect(io.out.join("") + io.err.join("")).not.toContain(SECRET);
  });

  it("reads --password-file, and an unreadable one is a usage error", async () => {
    const { calls, transport } = recordingTransport();
    const ok = cliTestIo({ files: { "pw.txt": `${SECRET}\r\n` } });
    expect(await runAccountsCommand(["accounts", "setPassword", "--user-id", "u1", "--password-file", "pw.txt"], ok, transport)).toBe(0);
    expect(calls[0]?.input.password).toBe(SECRET);
    expect(ok.out.join("") + ok.err.join("")).not.toContain(SECRET);
    const missing = cliTestIo();
    expect(await runAccountsCommand(["accounts", "setPassword", "--user-id", "u1", "--password-file", "nope.txt"], missing, transport)).toBe(2);
  });

  it("refuses two stdin readers at once", async () => {
    const { transport } = recordingTransport();
    const io = cliTestIo({ stdin: "{}" });
    expect(await runAccountsCommand(["accounts", "createAccount", "--json", "-", "--password-stdin"], io, transport)).toBe(2);
  });
});

describe("accounts exit codes", () => {
  it("prints usage listing the operations for help and exits 0", async () => {
    const { transport } = recordingTransport();
    const io = cliTestIo();
    expect(await runAccountsCommand(["accounts", "help"], io, transport)).toBe(0);
    for (const name of ["createAccount", "setPassword", "getAccount", "rotateCredentials"]) expect(io.out.join("")).toContain(name);
  });

  it("exits 2 with usage on stderr for no operation, an unknown operation or flag", async () => {
    const { calls, transport } = recordingTransport();
    for (const argv of [["accounts"], ["accounts", "frobnicate"], ["accounts", "getAccount", "--nope", "x"], ["accounts", "getAccount", "--email"], ["accounts", "getAccount", "stray"], ["accounts", "enableAccount", "--json", "{bad"]]) {
      const io = cliTestIo();
      expect(await runAccountsCommand(argv, io, transport)).toBe(2);
      expect(io.out).toEqual([]);
      expect(io.err.join("")).not.toBe("");
    }
    expect(calls).toHaveLength(0);
  });

  it("exits 1 and prints the typed error as one JSON line", async () => {
    const answer = { ok: false as const, error: { code: "not_found" as const, message: "no such account" } };
    const { transport } = recordingTransport(answer);
    const io = cliTestIo();
    expect(await runAccountsCommand(["accounts", "getAccount", "--user-id", "u1"], io, transport)).toBe(1);
    expect(io.out.join("")).toBe(`${JSON.stringify(answer)}\n`);
  });

  it("exits 1 with a generic message when the transport throws something unexpected", async () => {
    const io = cliTestIo();
    const transport: AccountsCommandTransport = {
      run: async () => {
        throw new Error(`boom ${SECRET}`);
      }
    };
    expect(await runAccountsCommand(["accounts", "getAccount", "--user-id", "u1"], io, transport)).toBe(1);
    expect(io.err.join("")).not.toContain(SECRET);
  });
});
