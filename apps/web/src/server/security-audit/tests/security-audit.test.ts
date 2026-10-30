import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayAuditEntry } from "@fluxiq/contracts/client-gateway";
import { afterEach, describe, expect, it } from "vitest";
import { appendAuditLine, attachGatewayAuditPersistence } from "../index";

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fluxiq-gateway-audit-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function source() {
  let listener: ((event: ClientGatewayAuditEntry) => void) | null = null;
  return {
    emit: (event: Record<string, unknown>) => listener?.(event as unknown as ClientGatewayAuditEntry),
    onSecurityEvent: (next: (event: ClientGatewayAuditEntry) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }
  };
}

describe("gateway audit persistence", () => {
  it("appends each event as a redacted JSON line under security/", () => {
    const dir = tempDir();
    const events = source();
    attachGatewayAuditPersistence(events, { fluxiqDir: dir });
    events.emit({ type: "session.paired", clientId: "c1", pairingToken: "never-in-file" });
    events.emit({ type: "trust.revoked", clientId: "c1" });
    const lines = readFileSync(path.join(dir, "security", "gateway-audit.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ type: "session.paired", clientId: "c1", pairingToken: "[redacted]" });
    expect(lines.join("")).not.toContain("never-in-file");
  });

  it("rotates a file at the limit to .1, keeping one rotation", () => {
    const dir = tempDir();
    const file = path.join(dir, "audit.jsonl");
    appendAuditLine(file, "first", 20);
    appendAuditLine(file, "second-line-fills", 20);
    appendAuditLine(file, "third", 20);
    expect(readFileSync(`${file}.1`, "utf8")).toContain("second-line-fills");
    expect(readFileSync(file, "utf8")).toBe("third\n");
    appendAuditLine(file, "x".repeat(30), 20);
    appendAuditLine(file, "fourth", 20);
    expect(readFileSync(`${file}.1`, "utf8")).toContain("xxxx");
    expect(readFileSync(file, "utf8")).toBe("fourth\n");
    expect(existsSync(`${file}.2`)).toBe(false);
  });

  it("never throws when the write fails, and reports only the error code", () => {
    const dir = tempDir();
    // A file where the security directory should be, so the write cannot succeed.
    writeFileSync(path.join(dir, "security"), "not a directory");
    const events = source();
    const codes: string[] = [];
    attachGatewayAuditPersistence(events, { fluxiqDir: dir, onWriteError: (code) => codes.push(code) });
    expect(() => events.emit({ type: "session.paired" })).not.toThrow();
    expect(codes).toHaveLength(1);
    mkdirSync(path.join(dir, "ok"), { recursive: true });
  });
});
