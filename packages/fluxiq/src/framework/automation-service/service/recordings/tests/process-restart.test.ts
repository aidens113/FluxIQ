import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const probe = fileURLToPath(new URL("./process-probe.mjs", import.meta.url));
const publicProbe = fileURLToPath(new URL("./public-writer-process-probe.mjs", import.meta.url));
const dist = path.resolve("dist");
// A probe child opens real SQL stores; alone it takes 6-25 s, under a loaded full sweep 45 s or more (2026-10-27).
// The child exits on its own when done, so the deadline only catches a hang: generous per phase, and the test
// bound is derived from the two phases it runs plus slack.
const phaseDeadline = 240_000;
const testTimeout = 2 * phaseDeadline + 60_000;
describe("actual built recording process boundary", () => {
  it.each(["rename", "note", "domain"])("reopens public %s after hydrated snapshot removal", { timeout: testTimeout }, async mode => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-public-process-"));
    try {
      for (const phase of ["write", "read"]) {
        const result = await execute(process.execPath, [publicProbe, phase, root, dist, mode], { timeout: phaseDeadline });
        expect(JSON.parse(result.stdout.trim())).toEqual({ phase, mode, entries: mode === "rename" ? 0 : 1, providers: 0, closed: true });
      }
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); }
  });
  for (const mode of ["new", "legacy", "removed", "late-finalize", "undo-sole", "undo-last", "no-packet-sole", "no-packet-last", "no-packet-identical-sole", "no-packet-identical-last"]) it(`reopens exact ${mode} history in a separate process`, { timeout: testTimeout }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-process-"));
    try {
      for (const phase of ["write", "read"]) {
        const result = await execute(process.execPath, [probe, phase, root, dist, mode], { timeout: phaseDeadline });
        expect(JSON.parse(result.stdout.trim())).toEqual({ phase, mode, entries: mode === "removed" ? 39 : mode.endsWith("sole") ? 1 : mode.endsWith("last") ? 2 : 40, providers: 0, closed: true });
      }
    } finally { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); }
  });
});
