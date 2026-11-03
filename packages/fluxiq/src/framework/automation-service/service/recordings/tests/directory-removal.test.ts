import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { removePathWithRetry } from "../directory-removal.ts";

// `directory-removal.ts`: a recording directory that Windows briefly holds is
// removed on a retry, and one that stays held still fails the deletion.

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: operation not permitted, rmdir 'derived'`), { code });
}

const noWait = async (): Promise<void> => undefined;

describe("removing a recording directory with a bounded retry", () => {
  it("retries a transient EPERM and then removes the directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-directory-removal-"));
    try {
      const target = path.join(root, "derived");
      await mkdir(path.join(target, "nested"), { recursive: true });
      await writeFile(path.join(target, "nested", "doc.json"), "{}", "utf8");
      let attempts = 0;
      const waits: number[] = [];
      await removePathWithRetry(target, {
        retryDelaysMs: [5, 10],
        wait: async (ms) => { waits.push(ms); },
        remove: async (removeTarget, options) => {
          attempts += 1;
          if (attempts === 1) throw errnoError("EPERM");
          await rm(removeTarget, options);
        }
      });
      expect(attempts).toBe(2);
      expect(waits).toEqual([5]);
      await expect(readdir(target)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws a lasting EPERM once the retries are spent", async () => {
    let attempts = 0;
    const lasting = errnoError("EPERM");
    await expect(removePathWithRetry("held-directory", {
      retryDelaysMs: [1, 2, 3],
      wait: noWait,
      remove: async () => {
        attempts += 1;
        throw lasting;
      }
    })).rejects.toBe(lasting);
    expect(attempts).toBe(4);
  });

  it("does not retry an error that is not a transient hold", async () => {
    let attempts = 0;
    await expect(removePathWithRetry("bad-path", {
      wait: noWait,
      remove: async () => {
        attempts += 1;
        throw errnoError("EINVAL");
      }
    })).rejects.toMatchObject({ code: "EINVAL" });
    expect(attempts).toBe(1);
  });

  it("passes a non-recursive removal through unchanged", async () => {
    const seen: Array<{ recursive: boolean; force: true }> = [];
    await removePathWithRetry("file.json", { recursive: false, remove: async (_target, options) => { seen.push(options); } });
    expect(seen).toEqual([{ recursive: false, force: true }]);
  });
});
