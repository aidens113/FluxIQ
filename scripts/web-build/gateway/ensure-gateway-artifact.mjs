// Leaves a Core checkout's gateway server artifact current before a keyed
// web build copies it: reused as it is when its receipt still matches
// (`artifact-state.mjs`), generated in place otherwise.
//
// In place, because the artifact in `apps/web/.server-runtime/` is the one a
// downstream identity check compares a served panel against, and because
// the generator is deterministic, so a current artifact is byte for byte what
// a regeneration would write. Regenerating a current one only rewrote the
// same bytes, and was the step a loaded machine could not finish in time.

import path from "node:path";
import { webBuildError } from "../web-build-error.mjs";
import { gatewayArtifactState } from "./artifact-state.mjs";
import { GATEWAY_FILES } from "./files.mjs";

/**
 * @param {string} repoRoot the Core checkout
 * @param {{ run: (command: { name: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, shell: boolean }) => Promise<void>, env: NodeJS.ProcessEnv, log: (line: string) => void, state?: typeof gatewayArtifactState }} options
 * @returns {Promise<"reused" | "generated">}
 */
export async function ensureGatewayArtifact(repoRoot, options) {
  const state = options.state ?? gatewayArtifactState;
  const before = await state(repoRoot);
  if (before.current) {
    options.log(`[gateway] reused: ${before.reason}; the generator was not run`);
    return "reused";
  }
  options.log(`[gateway] generating: ${before.reason}`);
  await options.run({ name: "gateway-server-build", command: process.execPath, args: [path.join(repoRoot, ...GATEWAY_FILES.generator.split("/"))], cwd: repoRoot, env: options.env, shell: false });
  const after = await state(repoRoot);
  if (!after.current) throw webBuildError("build", `The gateway server generator finished, but its artifact is still not current: ${after.reason}.`, { reason: after.reason });
  return "generated";
}
