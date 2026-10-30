import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveEmailSender } from "../resolve-email-sender";

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fluxiq-email-sender-"));
  roots.push(dir);
  return dir;
}
const welcome = { template: "welcome", to: "a@example.test", variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#token=t", expiresInHours: "24" } } as const;

describe("resolveEmailSender", () => {
  it("answers the none sender for none", () => expect(resolveEmailSender("none", "/unused").kind).toBe("none"));

  it.each([undefined, "", "file"])("writes to the default directory for %j", async (value) => {
    const dir = tempDir();
    const sender = resolveEmailSender(value, path.join(dir, "outbox"));
    expect(sender.kind).toBe("file");
    await sender.send(welcome);
    expect(readdirSync(path.join(dir, "outbox"))).toHaveLength(1);
  });

  it("writes file:<dir> to an absolute directory", async () => {
    const dir = tempDir();
    const target = path.join(dir, "mail");
    await resolveEmailSender(`file:${target}`, path.join(dir, "outbox")).send(welcome);
    const [name] = readdirSync(target);
    expect(JSON.parse(readFileSync(path.join(target, name!), "utf8"))).toMatchObject({ template: "welcome", to: "a@example.test" });
    expect(() => readdirSync(path.join(dir, "outbox"))).toThrow();
  });

  it("resolves a relative file:<dir> from the working directory", async () => {
    const dir = tempDir();
    await resolveEmailSender("file:relative-mail", path.join(dir, "outbox"), dir).send(welcome);
    expect(readdirSync(path.join(dir, "relative-mail"))).toHaveLength(1);
  });

  it("refuses an empty directory and unknown values", () => {
    expect(() => resolveEmailSender("file:", "/x")).toThrow(/file:<dir>/u);
    expect(() => resolveEmailSender("smtp", "/x")).toThrow(/none, file or file:<dir>/u);
  });
});
