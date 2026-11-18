import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const PROBE_TIMEOUT_MS = 30_000;

/** A hash of the machine's own id, or why there is none (most containers have none). */
export type MachineIdentity = { kind: "read"; id: string } | { kind: "unreadable"; reason: string };

let machine: Promise<MachineIdentity> | undefined;

/** This machine's id, read once: the Windows MachineGuid, Linux's machine-id, or the Mac's platform UUID. */
export function machineIdentity(): Promise<MachineIdentity> {
  return machine ??= (async (): Promise<MachineIdentity> => {
    try {
      const id = await readMachineId();
      return id ? { kind: "read", id: createHash("sha256").update(`${process.platform}:${id}`).digest("hex") } : { kind: "unreadable", reason: "the system has no machine id" };
    } catch (error) {
      return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
    }
  })();
}

async function readMachineId(): Promise<string | undefined> {
  if (process.platform === "win32") {
    const { stdout } = await run("reg.exe", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], { windowsHide: true, timeout: PROBE_TIMEOUT_MS });
    return /MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/iu.exec(stdout)?.[1];
  }
  if (process.platform === "linux") {
    const text = await readFile("/etc/machine-id", "utf8").catch(() => readFile("/var/lib/dbus/machine-id", "utf8"));
    return text.trim() || undefined;
  }
  if (process.platform === "darwin") {
    const { stdout } = await run("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"], { timeout: PROBE_TIMEOUT_MS });
    return /"IOPlatformUUID"\s*=\s*"([^"]+)"/u.exec(stdout)?.[1];
  }
  return undefined;
}
