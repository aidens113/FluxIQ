// Refuses a production build of the web panel that cannot attest Core's
// runtime build identity.
//
// Core's source keeps the identity as a placeholder literal
// (`packages/fluxiq/src/runtime/build-identity/read.ts`); only the `dist`
// build replaces it (`scripts/runtime-build-identity/`). A panel whose server
// JavaScript still holds the placeholder compiled Core from source, so its
// identity endpoint can only ever answer "identity unavailable". `web:build`
// runs this after `next build` (`check-web-build.mjs`), and the keyed
// publication runs it before it marks a build complete, so the refusal is a
// failed build naming the file rather than a 400 from every server that
// serves it.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RUNTIME_IDENTITY_PLACEHOLDER = "fluxiqRuntimeIdentityPlaceholder";

/**
 * @param {string} webDirectory the `apps/web` directory whose `.next/server` is checked
 * @returns {Promise<{ checked: number }>} how many server files were read
 */
export async function assertStampedRuntimeIdentity(webDirectory) {
  const serverDirectory = path.join(webDirectory, ".next", "server");
  const files = await serverJavaScript(serverDirectory);
  if (files.length === 0) {
    throw new Error(`The web panel build left no server output to check for Core's runtime build identity: ${serverDirectory} holds no JavaScript.`);
  }
  for (const file of files) {
    if (!(await readFile(file, "utf8")).includes(RUNTIME_IDENTITY_PLACEHOLDER)) continue;
    const shown = path.relative(webDirectory, file).split(path.sep).join("/");
    throw new Error(
      `The web panel build embeds Core's unstamped runtime build identity (${RUNTIME_IDENTITY_PLACEHOLDER} in ${shown}): it compiled Core from source instead of its built dist. ` +
        "A production build must resolve fluxiq through tsconfig.build.json, which has no source aliases (apps/web/next.config.ts)."
    );
  }
  return { checked: files.length };
}

async function serverJavaScript(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return serverJavaScript(target);
      return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
    })
  );
  return nested.flat().sort();
}
