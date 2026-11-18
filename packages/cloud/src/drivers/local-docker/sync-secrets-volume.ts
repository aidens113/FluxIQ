import { readFile } from "node:fs/promises";
import { CLOUD_PROJECT_LABEL, type CloudPlan } from "../../plan/index.ts";
import type { DockerCli } from "./docker-cli.ts";

/** Runs as root in a throwaway container: writes each secret as /secrets/<name>, mode 0400, owned by 1000:1000, and removes any it no longer has. */
const SYNC_SCRIPT = `
import { chmodSync, chownSync, readdirSync, rmSync, writeFileSync } from "node:fs";
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const files = JSON.parse(Buffer.concat(chunks).toString("utf8"));
for (const name of readdirSync("/secrets")) if (!Object.hasOwn(files, name)) rmSync("/secrets/" + name, { force: true });
for (const [name, content] of Object.entries(files)) {
  const target = "/secrets/" + name;
  rmSync(target, { force: true });
  writeFileSync(target, content, { mode: 0o400 });
  chmodSync(target, 0o400);
  chownSync(target, 1000, 1000);
}
chmodSync("/secrets", 0o755);
process.stdout.write(JSON.stringify(Object.keys(files).sort()));
`;

/**
 * Fills the deployment's secrets volume (Core's /run/secrets) from the
 * secret files and the plan's rendered files (the commerce configuration): each as `<name>`, owned by Core's user and readable only by
 * it, the folder writable only by root. The volume is created with the
 * project label when absent (one of another project's is refused). The
 * contents travel on the container's standard input, never in an argument,
 * and the container has no network and only the capability to change owners.
 * Run on every `up`, so a rotated file reaches Core on the next start.
 */
export async function syncSecretsVolume(docker: DockerCli, plan: CloudPlan): Promise<void> {
  const owner = await docker.labelOf("volume", plan.secretsVolume);
  if (owner !== null && owner !== plan.project) throw new Error(`A volume named ${plan.secretsVolume} exists and is not this deployment's; remove or rename it, or choose another project name.`);
  if (owner === null) await docker.must(["volume", "create", "--label", `${CLOUD_PROJECT_LABEL}=${plan.project}`, "--label", "com.fluxiq.cloud.role=secrets", plan.secretsVolume], "Creating the secrets volume");
  const files: Record<string, string> = {};
  for (const secret of plan.secrets) {
    if (!/^[a-z][a-z_]*$/u.test(secret.name)) throw new Error(`${secret.name} is not a secret name.`);
    files[secret.name] = await readFile(secret.file, "utf8");
  }
  for (const rendered of plan.renderedFiles) {
    if (!/^[a-z][a-z_]*$/u.test(rendered.name) || Object.hasOwn(files, rendered.name)) throw new Error(`${rendered.name} is not a usable file name in the secrets volume.`);
    files[rendered.name] = rendered.content;
  }
  const written = await docker.must([
    "run", "--rm", "--interactive", "--network", "none",
    "--label", `${CLOUD_PROJECT_LABEL}=${plan.project}`, "--label", "com.fluxiq.cloud.role=secrets",
    "--user", "0:0", "--cap-drop", "ALL", "--cap-add", "CHOWN", "--security-opt", "no-new-privileges:true", "--read-only",
    "--volume", `${plan.secretsVolume}:/secrets`, "--entrypoint", "node", plan.coreImage, "--input-type=module", "--eval", SYNC_SCRIPT
  ], "Copying the secrets into their volume", { input: JSON.stringify(files) });
  const expected = JSON.stringify(Object.keys(files).sort());
  if (written.trim() !== expected) throw new Error(`The secrets volume holds ${written.trim() || "nothing"}, not ${expected}.`);
}
