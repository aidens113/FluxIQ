import type { CommandRunner } from "../command/index.ts";
import { CLOUD_PROJECT_LABEL } from "../plan/index.ts";

/** A one-shot script run inside the deployment: on which network, from which image, with what input. */
export type OneShot = {
  project: string;
  image: string;
  network: string;
  /** An ES module run by `node`; it reads `input` from standard input and prints JSON. */
  script: string;
  input: unknown;
};

/**
 * Runs a script in a throwaway container on one of the deployment's
 * networks, as a sign-up site's backend would sit on the provisioning
 * network. The container carries the project label (so `down` would remove
 * it if it outlived its run), runs read-only with no capabilities as Core's
 * own non-root user, and gets secrets on standard input, never in its
 * arguments. Answers the script's JSON output.
 */
export async function runOneShot(runner: CommandRunner, shot: OneShot): Promise<unknown> {
  const result = await runner.run("docker", {
    args: [
      "run", "--rm", "--interactive", "--network", shot.network,
      "--label", `${CLOUD_PROJECT_LABEL}=${shot.project}`, "--label", "com.fluxiq.cloud.role=smoke",
      "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--entrypoint", "node", shot.image, "--input-type=module", "--eval", shot.script
    ],
    input: JSON.stringify(shot.input)
  });
  if (result.code !== 0) throw new Error(`A one-shot container on ${shot.network} failed (exit ${result.code}): ${result.stderr.trim().split(/\r?\n/u).slice(-3).join(" | ")}`);
  return JSON.parse(result.stdout);
}
