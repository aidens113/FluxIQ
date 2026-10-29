import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes `content` to `filePath` readable by the owner only (mode 0600; on
 * Windows the mode is advisory), through a temporary file and a rename so a
 * reader never sees half a file. The directory is created 0700 if missing.
 */
export async function writePrivateFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${Date.now().toString(36)}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await chmod(temporary, 0o600);
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(/* best-effort: the original failure is what matters */ () => undefined);
    throw error;
  }
}
