// Refuses a panel build whose server traces do not carry Core.
//
// The Node server imports Core through Node (`scripts/core-bridge/`), so a
// standalone output (the container image's `.next/standalone`) runs only if
// its traces name what Node needs to resolve each `fluxiq` request: the
// `node_modules/fluxiq` link, Core's `package.json` (its export map) and the
// built file each request resolves to. Next copies exactly the traced files,
// so a missing one is a server that fails on its first Core import, in the
// image only. `next.config.ts` runs this after each production compile, in
// every build, standalone or not; the traces are the same.
//
// It also requires at least one external Core request: a server that imports
// none bundled Core or never uses it, and both are wrong for the panel.

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { coreRequests } from "./core-requests.mjs";
import { normalise, tracedFiles } from "./traced-files.mjs";

const SHOWN = 8;

/**
 * @param {{ distDirectory: string, webDirectory: string, modules?: string[] }} build
 *   the build's `.next`, `apps/web`, and other server modules Node loads beside it
 * @returns {Promise<{ requests: number, traced: number }>} how many Core requests were checked, and how many files the traces name
 */
export async function assertCoreTraced({ distDirectory, webDirectory, modules = [] }) {
  const serverDirectory = path.join(distDirectory, "server");
  const requests = await coreRequests(serverDirectory, modules);
  if (requests.size === 0) {
    throw new Error(`Core trace: no Node server file under ${serverDirectory} imports fluxiq through Node, so Core is bundled or missing. The server must load Core externally (scripts/core-bridge, apps/web/next.config.ts).`);
  }
  const { traces, files } = await tracedFiles(serverDirectory);
  if (traces === 0) throw new Error(`Core trace: the build wrote no Node server traces (*.nft.json) under ${serverDirectory}, so what a standalone output would copy cannot be checked.`);
  const link = path.join(webDirectory, "node_modules", "fluxiq");
  const core = realpathSync(link);
  const manifest = JSON.parse(readFileSync(path.join(core, "package.json"), "utf8"));
  /** @type {string[]} */
  const missing = [];
  if (!files.has(normalise(link))) missing.push(`the link ${link}`);
  if (!files.has(normalise(path.join(core, "package.json")))) missing.push(`Core's ${path.join(core, "package.json")}`);
  for (const [request, importers] of [...requests].sort(([a], [b]) => a.localeCompare(b))) {
    const key = request === "fluxiq" ? "." : `.${request.slice("fluxiq".length)}`;
    const entry = manifest.exports?.[key];
    const target = typeof entry === "string" ? entry : entry?.import ?? entry?.default;
    if (typeof target !== "string") {
      missing.push(`${request} (imported by ${importers.slice(0, 2).join(", ")}): Core's package.json exports no file for it`);
      continue;
    }
    const file = path.join(core, target);
    if (!files.has(normalise(file))) missing.push(`${request} -> ${file} (imported by ${importers.slice(0, 2).join(", ")})`);
  }
  if (missing.length > 0) {
    const more = missing.length > SHOWN ? [`  ... and ${missing.length - SHOWN} more`] : [];
    throw new Error(
      [
        `Core trace: the Node server's traces lack ${missing.length} file(s) Node needs to load Core, so a standalone output (the container image) would fail on its first Core import:`,
        ...missing.slice(0, SHOWN).map((item) => `  ${item}`),
        ...more
      ].join("\n")
    );
  }
  return { requests: requests.size, traced: files.size };
}
