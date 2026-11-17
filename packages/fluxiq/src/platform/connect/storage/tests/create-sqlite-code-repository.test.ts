// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ConnectCodeRecord } from "../../index.ts";
import { connectFixture } from "../../tests/connect-fixture.ts";
import { competingConnectProcesses } from "./process-exchanges.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function record(sessionDigest: string, createdAt = 1_000_000): ConnectCodeRecord {
  return {
    codeDigest: createHash("sha256").update("synthetic-repository-code").digest("hex"),
    clientId: "fluxiq-browser-extension",
    clientInstallId: "synthetic-install-1",
    redirectUri: "https://app.example.com/connect/done",
    codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    userId: "user.synthetic",
    workspaceId: "workspace.synthetic",
    approvingSessionDigest: sessionDigest,
    clientLabel: "Synthetic browser",
    createdAt,
    expiresAt: createdAt + 120_000
  };
}

function claim(evidence: ConnectCodeRecord, now = evidence.createdAt) {
  return { codeDigest: evidence.codeDigest, clientId: evidence.clientId, clientInstallId: evidence.clientInstallId, redirectUri: evidence.redirectUri, codeChallenge: evidence.codeChallenge, now };
}

describe("durable atomic connect authorization codes", () => {
  it("does not create storage for unknown-code probes and propagates damaged or invalid authority", async () => {
    const f = await connectFixture(cleanups);
    const evidence = record(f.sessionDigest);
    expect(await f.repository.consume(claim(evidence))).toBeNull();
    await expect(access(path.dirname(f.filePath))).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(path.dirname(f.filePath));
    await writeFile(f.filePath, "synthetic-corrupt-not-sqlite");
    await expect(f.repository.consume(claim(evidence))).rejects.toThrow();
    await expect(f.openRepository(f.directory).consume(claim(evidence))).rejects.toThrow("not a database file");
  });

  it("arbitrates racing first writes and racing claims on eight independent repository connections", async () => {
    const f = await connectFixture(cleanups);
    const repositories = Array.from({ length: 8 }, () => f.openRepository());
    const saved = await Promise.allSettled(repositories.map((repository) => repository.save(record(f.sessionDigest))));
    expect(saved.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of saved) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "SQLITE_CONSTRAINT" });
    const consumed = await Promise.all(repositories.map((repository) => repository.consume(claim(record(f.sessionDigest)))));
    expect(consumed.filter((result) => result !== null)).toEqual([record(f.sessionDigest)]);
    expect(consumed.filter((result) => result === null)).toHaveLength(7);
  });

  it("keeps one-use consumption across actual service processes and another reopen", async () => {
    const f = await connectFixture(cleanups);
    const authorization = await f.authorize();
    const outcomes = await competingConnectProcesses(f.filePath, f.tokenRequest(authorization.code), f.sessionDigest, f.clock.now);
    expect(outcomes.filter((result) => result === "issued")).toHaveLength(1);
    expect(outcomes.filter((result) => result === "replayed")).toHaveLength(7);
    expect(await f.createService({ repository: f.openRepository() }).exchange(f.tokenRequest(authorization.code))).toEqual({ ok: false, error: { error: "invalid_grant" } });
  });

  it("refuses expiry and future-issued evidence without consuming an otherwise valid authorization", async () => {
    const f = await connectFixture(cleanups);
    const evidence = record(f.sessionDigest);
    await f.repository.save(evidence);
    expect(await f.repository.consume(claim(evidence, evidence.expiresAt))).toBeNull();
    expect(await f.repository.consume(claim(evidence, evidence.createdAt - 1))).toBeNull();
    expect(await f.repository.consume(claim(evidence, evidence.expiresAt - 1))).toEqual(evidence);
    expect(await f.openRepository().consume(claim(evidence))).toBeNull();
  });

  it("rejects invalid or raw-session records before creating authority and never replaces an existing code", async () => {
    const f = await connectFixture(cleanups);
    const evidence = record(f.sessionDigest);
    await expect(f.repository.save({ ...evidence, approvingSessionDigest: f.rawCookie })).rejects.toThrow("Invalid connect authorization evidence");
    await expect(f.repository.save({ ...evidence, expiresAt: evidence.createdAt })).rejects.toThrow("Invalid connect authorization evidence");
    await expect(f.repository.save({ ...evidence, codeDigest: "raw-code" })).rejects.toThrow("Invalid connect authorization evidence");
    await expect(access(f.filePath)).rejects.toMatchObject({ code: "ENOENT" });
    await f.repository.save(evidence);
    await expect(f.openRepository().save({ ...evidence, workspaceId: "forged.workspace" })).rejects.toMatchObject({ code: "SQLITE_CONSTRAINT" });
    expect(await f.repository.consume(claim(evidence))).toEqual(evidence);
  });

  it("drains in-flight operations on close and refuses subsequent repository use", async () => {
    const f = await connectFixture(cleanups);
    const saving = f.repository.save(record(f.sessionDigest));
    await f.repository.close();
    await saving;
    await expect(f.repository.consume(claim(record(f.sessionDigest)))).rejects.toThrow("closed");
    expect(await f.openRepository().consume(claim(record(f.sessionDigest)))).toEqual(record(f.sessionDigest));
  });
});
