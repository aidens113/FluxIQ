import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

export const DEFAULT_AUDIT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Appends one JSONL line to `filePath`. Before the append, a file at or over
 * `maxBytes` moves to `<filePath>.1`, replacing the one rotation kept. Writes
 * synchronously so lines stay in order. Throws on a filesystem error; the
 * caller decides what a failed write means.
 */
export function appendAuditLine(filePath: string, line: string, maxBytes: number = DEFAULT_AUDIT_MAX_BYTES): void {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  if (currentSize(filePath) >= maxBytes) {
    rmSync(`${filePath}.1`, { force: true });
    renameSync(filePath, `${filePath}.1`);
  }
  appendFileSync(filePath, `${line}\n`, { encoding: "utf8", mode: 0o600 });
}

function currentSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}
