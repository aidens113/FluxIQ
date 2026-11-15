import path from "node:path";
import sqlite3 from "sqlite3";

/** Read the persisted mode without changing it or initializing a different storage policy. */
export async function readJournalMode(filePath: string): Promise<string> {
  const connection = await new Promise<sqlite3.Database>((resolve, reject) => {
    const opened = new sqlite3.Database(path.toNamespacedPath(filePath), sqlite3.OPEN_READONLY, (error) => error ? reject(error) : resolve(opened));
  });
  try {
    return await new Promise<string>((resolve, reject) => {
      connection.get("pragma journal_mode", (error: Error | null, row: { journal_mode: string }) => error ? reject(error) : resolve(row.journal_mode));
    });
  } finally {
    await new Promise<void>((resolve, reject) => connection.close((error) => error ? reject(error) : resolve()));
  }
}
