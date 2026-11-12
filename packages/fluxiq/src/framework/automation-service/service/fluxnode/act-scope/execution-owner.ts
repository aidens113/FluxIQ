// Exclusive execution ownership, independent of the allocated act scope. No timeout proves an owner dead.
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

type MachineIdentity = { kind: "verified"; id: string } | { kind: "unverified"; reason: "unavailable" | "unsupported_platform" };
type Owner = { token: string; pid: number; host: MachineIdentity };
type ReadOwner = { kind: "known"; owner: Owner } | { kind: "missing" | "unknown" };
const queues = new Map<string, Promise<unknown>>();
let machine: Promise<MachineIdentity> | undefined;

export async function fluxNodeExecutionOwner(file: string): Promise<{ token: string; release: () => Promise<void> } | undefined> {
  const owner: Owner = { token: randomUUID(), pid: process.pid, host: await machineId() };
  return await queued(file, async () => {
    await mkdir(path.dirname(file), { recursive: true });
    let taken = await create(file, owner);
    if (!taken) {
      const previous = await read(file);
      if (previous.kind !== "known" || !deadHere(previous.owner, owner.host)) return undefined;
      // Only one recoverer can compare and remove a dead owner's file. A crashed recoverer fails closed.
      const guard = `${file}.recover`;
      if (!await create(guard, owner)) return undefined;
      try {
        const current = await read(file);
        if (current.kind !== "known" || current.owner.token !== previous.owner.token || !deadHere(current.owner, owner.host)) return undefined;
        await unlink(file);
        taken = await create(file, owner);
      } finally {
        await release(guard, owner.token);
      }
    }
    return taken ? { token: owner.token, release: () => queued(file, async () => await release(file, owner.token)) } : undefined;
  });
}

async function queued<T>(file: string, work: () => Promise<T>): Promise<T> {
  const key = process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file);
  const next = (queues.get(key) ?? Promise.resolve()).then(work, work);
  queues.set(key, next);
  try { return await next; }
  finally { if (queues.get(key) === next) queues.delete(key); }
}

async function create(file: string, owner: Owner): Promise<boolean> {
  const handle = await open(file, "wx").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "EEXIST") return undefined;
    throw error;
  });
  if (!handle) return false;
  try {
    await handle.writeFile(JSON.stringify(owner), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return true;
}

async function read(file: string): Promise<ReadOwner> {
  try {
    const owner = JSON.parse(await readFile(file, "utf8")) as Partial<Owner> | null;
    if (!owner || typeof owner !== "object" || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0 || typeof owner.token !== "string" || !knownMachine(owner.host)) return { kind: "unknown" };
    return { kind: "known", owner: owner as Owner };
  } catch (error) {
    return { kind: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unknown" };
  }
}

async function release(file: string, token: string): Promise<void> {
  const current = await read(file);
  if (current.kind === "known" && current.owner.token === token) await unlink(file);
}

function deadHere(owner: Owner, host: MachineIdentity): boolean {
  if (host.kind !== "verified" || owner.host.kind !== "verified" || owner.host.id !== host.id) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}

function knownMachine(host: unknown): host is MachineIdentity {
  if (!host || typeof host !== "object") return false;
  const value = host as Partial<MachineIdentity>;
  return value.kind === "verified" ? typeof value.id === "string" && /^[a-f0-9]{64}$/u.test(value.id)
    : value.kind === "unverified" && (value.reason === "unavailable" || value.reason === "unsupported_platform");
}

function machineId(): Promise<MachineIdentity> {
  return machine ??= (async () => {
    try {
      let id: string | undefined;
      if (process.platform === "win32") {
        const { stdout } = await promisify(execFile)("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { windowsHide: true });
        id = /MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/iu.exec(stdout)?.[1];
      } else if (process.platform === "linux") id = (await readFile("/etc/machine-id", "utf8")).trim();
      else if (process.platform === "darwin") {
        const { stdout } = await promisify(execFile)("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
        id = /"IOPlatformUUID"\s*=\s*"([^"]+)"/u.exec(stdout)?.[1];
      } else return { kind: "unverified", reason: "unsupported_platform" };
      return id ? { kind: "verified", id: createHash("sha256").update(`${process.platform}:${id}`).digest("hex") }
        : { kind: "unverified", reason: "unavailable" };
    } catch { return { kind: "unverified", reason: "unavailable" }; } // An unverified host may take a fresh lock, but never recover one.
  })();
}
