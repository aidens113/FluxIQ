import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileEmailSender } from "../file-email-sender.ts";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("FileEmailSender", () => {
  it("writes one rendered JSON file per message, with a product template when given", async () => {
    const root = await mkdtemp(join(tmpdir(), "fluxiq-email-"));
    directories.push(root);
    const directory = join(root, "mailbox");
    const sender = new FileEmailSender({ directory, now: () => Date.UTC(2026, 9, 28), templates: { "account-exists": { subject: "Hi from Acme", text: "Go to {{signInUrl}}" } } });
    await sender.send({ template: "welcome", to: "a@example.test", variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#token=t", expiresInHours: "24" } });
    await sender.send({ template: "account-exists", to: "b@example.test", variables: { signInUrl: "https://app.example.test/", resetUrl: "https://app.example.test/reset" } });

    const files = (await readdir(directory)).sort();
    expect(files).toHaveLength(2);
    const bodies = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(directory, file), "utf8")) as Record<string, string>));
    const welcome = bodies.find((body) => body.template === "welcome");
    expect(welcome).toMatchObject({ to: "a@example.test", subject: "Finish setting up your FluxIQ account", sentAt: "2026-10-28T00:00:00.000Z" });
    expect(welcome?.text).toContain("Hello Ada,");
    expect(welcome?.text).toContain("https://app.example.test/welcome#token=t");
    expect(welcome?.text).toContain("expires in 24 hours");
    expect(bodies.find((body) => body.template === "account-exists")).toMatchObject({ subject: "Hi from Acme", text: "Go to https://app.example.test/" });
    expect(sender.kind).toBe("file");
  });

  it("records welcomeUrl as data only when the message has one", async () => {
    const root = await mkdtemp(join(tmpdir(), "fluxiq-email-"));
    directories.push(root);
    const directory = join(root, "mailbox");
    const sender = new FileEmailSender({ directory });
    await sender.send({ template: "welcome", to: "a@example.test", variables: { displayName: "Ada", welcomeUrl: "https://app.example.test/welcome#token=t", expiresInHours: "24" } });
    await sender.send({ template: "account-exists", to: "b@example.test", variables: { signInUrl: "https://app.example.test/", resetUrl: "https://app.example.test/reset" } });

    const bodies = await Promise.all((await readdir(directory)).map(async (file) => JSON.parse(await readFile(join(directory, file), "utf8")) as Record<string, string>));
    const welcome = bodies.find((body) => body.template === "welcome");
    const exists = bodies.find((body) => body.template === "account-exists");
    expect(welcome?.welcomeUrl).toBe("https://app.example.test/welcome#token=t");
    expect(exists).toBeDefined();
    expect("welcomeUrl" in (exists ?? {})).toBe(false);
  });
});
