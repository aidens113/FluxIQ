// Real child processes exercise ownership; no browser, project data, model or SQLite is involved.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fluxNodeExecutionOwner } from "../execution-owner.ts";

const folders: string[] = [];
const children: { child: ChildProcessWithoutNullStreams; ended: Promise<void> }[] = [];
afterEach(async () => {
  for (const { child } of children) if (child.exitCode === null) child.kill();
  await Promise.all(children.splice(0).map(({ ended }) => ended));
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true });
});
async function file() {
  const folder = await mkdtemp(path.join(os.tmpdir(), "fluxiq-execution-owner-"));
  folders.push(folder);
  return path.join(folder, "execution.owner");
}
function processOwner(file: string, leave = false) {
  const script = `import { fluxNodeExecutionOwner } from ${JSON.stringify(new URL("../execution-owner.ts", import.meta.url).href)};
const owner = await fluxNodeExecutionOwner(process.argv[1]);
process.stdout.write(owner ? "admitted\\n" : "busy\\n");
if (!owner || ${leave}) process.exit(0);
else process.stdin.once("data", async () => { await owner.release(); process.exit(0); });`;
  const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script, file], { windowsHide: true });
  const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  children.push({ child, ended });
  const ready = new Promise<string>((resolve, reject) => {
    child.once("error", reject);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("\n")) resolve(output.trim());
    });
    child.once("exit", (code) => { if (!output) reject(new Error(`Owner child exited ${code} before reporting`)); });
  });
  return { child, ready, ended };
}

describe("exclusive FluxNode execution ownership", () => {
  it("admits exactly one of separate Node processes contending for one execution", async () => {
    const target = await file();
    const contenders = [processOwner(target), processOwner(target), processOwner(target)];
    const states = await Promise.all(contenders.map(({ ready }) => ready));
    expect(states.filter((state) => state === "admitted")).toHaveLength(1);
    expect(states.filter((state) => state === "busy")).toHaveLength(2);
    contenders[states.indexOf("admitted")]!.child.stdin.end("release\n");
    await Promise.all(contenders.map(({ ended }) => ended));
  });

  it("recovers a verified dead local owner, and a stale completion never releases a newer owner", async () => {
    const target = await file();
    const crashed = processOwner(target, true);
    expect(await crashed.ready).toBe("admitted");
    await crashed.ended;
    const recovered = await fluxNodeExecutionOwner(target);
    expect(recovered).toBeDefined();
    await recovered!.release();
    const newer = await fluxNodeExecutionOwner(target);
    expect(newer).toBeDefined();
    await recovered!.release();
    expect(await fluxNodeExecutionOwner(target)).toBeUndefined();
    await newer!.release();
  });

  it("fails closed for foreign, unknown and reused-PID ownership", async () => {
    const target = await file();
    const ours = await fluxNodeExecutionOwner(target);
    const original = JSON.parse(await readFile(target, "utf8"));
    await ours!.release();
    for (const record of [{ ...original, host: { kind: "verified", id: "f".repeat(64) } }, { ...original, token: "old-incarnation", pid: process.pid }, { ...original, host: { kind: "unverified", reason: "unavailable" } }, { token: "unknown" }]) {
      await writeFile(target, JSON.stringify(record));
      expect(await fluxNodeExecutionOwner(target)).toBeUndefined();
    }
  });

  it("fails closed when a recoverer crashed while holding its recovery guard", async () => {
    const target = await file();
    const crashed = processOwner(target, true);
    expect(await crashed.ready).toBe("admitted");
    await crashed.ended;
    await writeFile(`${target}.recover`, "unknown recoverer");
    expect(await fluxNodeExecutionOwner(target)).toBeUndefined();
  });
});
