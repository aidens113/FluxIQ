// Mirrors an installed `node_modules` as links to the real directories it
// holds, one level into each `@scope`, so a staged build resolves exactly the
// packages Core installed without copying them.

import { mkdir, readdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";

const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

/** @param {string} source an installed node_modules @param {string} target where its mirror goes */
export async function mirrorNodeModules(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const sourceScope = path.join(source, entry.name);
      const targetScope = path.join(target, entry.name);
      await mkdir(targetScope, { recursive: true });
      for (const scoped of await readdir(sourceScope)) {
        await symlink(await realpath(path.join(sourceScope, scoped)), path.join(targetScope, scoped), LINK_TYPE);
      }
      continue;
    }
    await symlink(await realpath(path.join(source, entry.name)), path.join(target, entry.name), LINK_TYPE);
  }
}
