// Runs `next build --turbopack` with a heap large enough for its type-check
// worker. `NODE_OPTIONS` is the only setting a child process inherits, so a
// flag on this process would not reach the worker. A node launcher keeps the
// build command identical under Windows cmd and POSIX shells.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { buildNodeOptions } from "./build-node-options.mjs";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const env = { ...process.env, NODE_OPTIONS: buildNodeOptions(process.env.NODE_OPTIONS) };

const child = spawn(process.execPath, [nextBin, "build", "--turbopack", ...process.argv.slice(2)], { env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
