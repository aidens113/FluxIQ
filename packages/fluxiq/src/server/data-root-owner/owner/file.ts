import { randomUUID } from "node:crypto";
import { link, open, readFile, rename, unlink } from "node:fs/promises";
import { parseFluxIQDataRootOwner, type FluxIQDataRootOwner, type FluxIQDataRootOwnerRead } from "./record.ts";

/**
 * The owner file's operations. Creation is atomic and never leaves a half-written file:
 * the record is written to a private file and hard-linked into place, which fails when the
 * name exists. Removal of someone else's record compares its token after moving it aside, so a
 * claim made in between is put back rather than deleted.
 */
export const ownerFile = Object.freeze({
  /** Creates the file holding `owner`; false when the file already exists. */
  async create(file: string, owner: FluxIQDataRootOwner): Promise<boolean> {
    const draft = `${file}.${owner.token}.draft`;
    await writeDurably(draft, owner, "wx");
    try {
      await link(draft, file);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return false;
      // A filesystem without hard links: exclusive create, then write. A crash between the two
      // leaves an empty file, which reads as unreadable and refuses rather than reclaims.
      if (code === "EPERM" || code === "ENOTSUP" || code === "EOPNOTSUPP" || code === "ENOSYS" || code === "EXDEV") return await createWithoutLink(file, owner);
      throw error;
    } finally {
      await unlink(draft);
    }
  },

  async read(file: string): Promise<FluxIQDataRootOwnerRead> {
    try {
      return parseFluxIQDataRootOwner(await readFile(file, "utf8"));
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
    }
  },

  /** Removes the file only while it still holds `token`; true when it did. */
  async removeIfToken(file: string, token: string): Promise<boolean> {
    return await ownerFile.removeIf(file, (read) => read.kind === "known" && read.owner.token === token);
  },

  /** Removes the file only while what it holds still `matches`; true when it did. */
  async removeIf(file: string, matches: (read: FluxIQDataRootOwnerRead) => boolean): Promise<boolean> {
    const aside = `${file}.${randomUUID()}.removing`;
    try {
      await rename(file, aside);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
    const moved = await ownerFile.read(aside);
    if (matches(moved)) {
      await unlink(aside);
      return true;
    }
    // Not the record we meant: put it back, unless a new claim has taken the name in the moment
    // it was aside. Then two processes believe they own the root; only a crashed reclaim guard
    // and two more claimants arriving at once can lead here.
    await link(aside, file).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    await unlink(aside);
    return false;
  }
});

async function createWithoutLink(file: string, owner: FluxIQDataRootOwner): Promise<boolean> {
  try {
    await writeDurably(file, owner, "wx");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function writeDurably(file: string, owner: FluxIQDataRootOwner, flags: string): Promise<void> {
  const handle = await open(file, flags);
  try {
    await handle.writeFile(`${JSON.stringify(owner, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
