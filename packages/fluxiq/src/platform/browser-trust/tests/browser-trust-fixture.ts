import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { ClientGatewayTrustedClientStore } from "../../../client-gateway/index.ts";
import { createSqliteClientTrustRepository } from "../index.ts";

/** Isolated synthetic authority and gateways; no user storage, server or model is involved. */
export async function browserTrustFixture(cleanups: Array<() => Promise<void>>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-browser-trust-"));
  const filePath = path.join(directory, "browser-trust.sqlite");
  const clock = { now: 1_000_000 };
  cleanups.push(async () => {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("fluxiq-browser-trust-")) throw new Error("Invalid synthetic test cleanup target.");
    await rm(directory, { recursive: true, force: true });
  });
  function openRepository() {
    const repository = createSqliteClientTrustRepository({ filePath, now: () => clock.now });
    cleanups.push(() => repository.close());
    return repository;
  }
  const repository = openRepository();
  function createGateway(workspaceId: string, store: ClientGatewayTrustedClientStore = repository.scopedStore(workspaceId)) {
    let minted = 0;
    const gateway = new ClientGatewayService({ trustedClientStore: store, now: () => clock.now, createToken: () => `synthetic-credential-${++minted}` });
    cleanups.push(() => gateway.close());
    return gateway;
  }
  async function executeSql(sql: string): Promise<void> {
    const database = await new Promise<sqlite3.Database>((resolve, reject) => {
      const connection = new sqlite3.Database(path.toNamespacedPath(filePath), (error) => error ? reject(error) : resolve(connection));
    });
    try {
      await new Promise<void>((resolve, reject) => database.exec(sql, (error) => error ? reject(error) : resolve()));
    } finally {
      await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
    }
  }
  return { filePath, clock, repository, openRepository, createGateway, executeSql };
}
