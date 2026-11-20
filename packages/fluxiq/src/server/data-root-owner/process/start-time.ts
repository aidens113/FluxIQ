import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
// A probe that never answers must not hang a server's start. Past this it is unreadable, which
// the owner check treats as "cannot tell" and so refuses rather than reclaims.
const PROBE_TIMEOUT_MS = 30_000;

/** A process's start time as the operating system records it, or why it could not be read. */
export type ProcessStartTime = { kind: "read"; value: string } | { kind: "unreadable"; reason: string };

/**
 * On Linux the start tick since boot with the boot id, on Windows the creation time, elsewhere
 * `ps`'s start time in UTC. Two reads of one process give the same value, and a different
 * process later given the same id gives another. Compared only for equality.
 */
export async function processStartTime(pid: number): Promise<ProcessStartTime> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { kind: "unreadable", reason: `not a process id: ${pid}` };
  try {
    const value = process.platform === "linux" ? await linux(pid) : process.platform === "win32" ? await windows(pid) : await posix(pid);
    return value === null ? { kind: "unreadable", reason: "the system's answer had no start time" } : { kind: "read", value };
  } catch (error) {
    return { kind: "unreadable", reason: error instanceof Error ? error.message : String(error) };
  }
}

async function linux(pid: number): Promise<string | null> {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  // Fields after the parenthesised command name; the start tick is field 22 of the whole line.
  const ticks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  if (!ticks || !/^\d+$/u.test(ticks)) return null;
  return `linux:${await bootId()}:${ticks}`;
}

async function bootId(): Promise<string> {
  try {
    return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim();
  } catch (error) {
    // Some sandboxed kernels have no boot id; the start tick alone still tells processes apart within a boot.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "no-boot-id";
    throw error;
  }
}

async function windows(pid: number): Promise<string | null> {
  const shell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const command = `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`;
  const { stdout } = await run(shell, ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: PROBE_TIMEOUT_MS });
  const ticks = stdout.trim();
  return /^\d+$/u.test(ticks) ? `win32:${ticks}` : null;
}

async function posix(pid: number): Promise<string | null> {
  const { stdout } = await run("ps", ["-o", "lstart=", "-p", String(pid)], { env: { ...process.env, TZ: "UTC", LC_ALL: "C" }, timeout: PROBE_TIMEOUT_MS });
  const value = stdout.trim();
  return value ? `${process.platform}:${value}` : null;
}
