import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Refuse symlinks and, on POSIX, other-user-readable private host files. Windows contents use DPAPI. */
export function readPrivateHostFile(file: string): Buffer | null {
  try {
    const parent = lstatSync(path.dirname(file));
    if (!parent.isDirectory() || parent.isSymbolicLink() || (process.platform !== "win32" && (parent.mode & 0o022) !== 0)) throw new Error("Host key directory must not be writable by other users.");
    const expected = lstatSync(file);
    if (!expected.isFile() || expected.isSymbolicLink()) throw new Error("Host key file must be a regular file.");
    const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const stat = fstatSync(descriptor);
      if (!stat.isFile() || stat.dev !== expected.dev || stat.ino !== expected.ino || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) throw new Error("Host key file must be private and owned by the host account.");
      return readFileSync(descriptor);
    } finally { closeSync(descriptor); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Publish a fully flushed file without overwriting another process's winning key. */
export function createPrivateHostFile(file: string, data: Buffer): void {
  const directory = path.dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) throw new Error("Host key directory must be private and owned by the host account.");
  const temporary = path.join(directory, `.keyring-${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, data);
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    try { linkSync(temporary, file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (process.platform !== "win32") {
      const parent = openSync(directory, "r");
      try { fsyncSync(parent); } finally { closeSync(parent); }
    }
  } finally { unlinkSync(temporary); }
}
