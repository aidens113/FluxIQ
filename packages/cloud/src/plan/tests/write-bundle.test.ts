import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseCloudConfig, type CloudConfig } from "../../config/index.ts";
import { buildCloudPlan } from "../build-cloud-plan.ts";
import { writeBundle } from "../write-bundle.ts";

const examples = fileURLToPath(new URL("../../../examples/", import.meta.url));
const deployDir = fileURLToPath(new URL("../../../../../deploy", import.meta.url)).replace(/\\/gu, "/");
const local = parseCloudConfig(readFileSync(`${examples}local.config.json`, "utf8"), `${examples}local.config.json`);
const production = parseCloudConfig(readFileSync(`${examples}production.config.json`, "utf8"), "C:/laptop/production.config.json");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

async function render(config: CloudConfig): Promise<Record<string, string>> {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-render-"));
  roots.push(root);
  const files = await writeBundle(buildCloudPlan(config, "0.1.0", deployDir), root);
  return Object.fromEntries(files.map((file) => [file, readFileSync(path.join(root, file), "utf8")]));
}

function envOf(text: string): Map<string, string> {
  return new Map(text.split("\n").filter((line) => line !== "" && !line.startsWith("#")).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^'(.*)'$/u, "$1")] as const;
  }));
}

/** Every key whose value differs, and each side's keys the other lacks. */
function envDiff(left: Map<string, string>, right: Map<string, string>) {
  return {
    changed: [...left.keys()].filter((key) => right.has(key) && right.get(key) !== left.get(key)),
    onlyLeft: [...left.keys()].filter((key) => !right.has(key)),
    onlyRight: [...right.keys()].filter((key) => !left.has(key))
  };
}

describe("writeBundle: local and production render the same files, differing only in config values", () => {
  it("copies deploy/ unchanged and differs only where the config differs", async () => {
    const [l, p] = [await render(local), await render(production)];

    // The file set: the sinks file exists only because the local config turns sinks on.
    expect(Object.keys(l).filter((file) => !(file in p))).toEqual(["compose/sinks.compose.yml"]);
    expect(Object.keys(p).filter((file) => !(file in l))).toEqual([]);

    // deploy/ is reused, byte for byte, in both.
    for (const file of ["caddy/Caddyfile", "compose/service.compose.yml"]) expect(l[file]).toBe(p[file]);
    expect(l["caddy/Caddyfile"]).toBe(readFileSync(`${deployDir}/caddy/Caddyfile.example`, "utf8"));
    expect(l["compose/service.compose.yml"]).toBe(readFileSync(`${deployDir}/compose/service.compose.yml`, "utf8"));

    // The override is the same file for every config: its values come from compose.env.
    expect(p["compose/cloud.override.yml"]).toBe(l["compose/cloud.override.yml"]);

    // compose.env: values, each from the config.
    const [lc, pc] = [envOf(l["compose/compose.env"] ?? ""), envOf(p["compose/compose.env"] ?? "")];
    expect(envDiff(lc, pc)).toEqual({
      changed: ["FLUXIQ_CLOUD_PROJECT", "FLUXIQ_BUILD_CONTEXT", "FLUXIQ_PROVISIONING_NETWORK"],
      onlyLeft: ["MAILPIT_IMAGE", "MAILPIT_UI_PORT", "STRIPE_MOCK_IMAGE"],
      onlyRight: []
    });
    for (const [config, env] of [[local, lc], [production, pc]] as const) {
      expect(env.get("FLUXIQ_CLOUD_PROJECT")).toBe(config.project);
      expect(env.get("FLUXIQ_BUILD_CONTEXT")).toBe(config.sourceRoot);
      expect(env.get("FLUXIQ_PROVISIONING_NETWORK")).toBe(`${config.project}_provisioning`);
    }
    expect([lc.get("MAILPIT_IMAGE"), lc.get("MAILPIT_UI_PORT"), lc.get("STRIPE_MOCK_IMAGE")]).toEqual([local.images.mailpit, String(local.sinks.mailUiPort), local.images.stripeMock]);

    // service.env: values, each from the config.
    const [ls, ps] = [envOf(l["env/service.env"] ?? ""), envOf(p["env/service.env"] ?? "")];
    expect(envDiff(ls, ps)).toEqual({
      changed: ["FLUXIQ_PUBLIC_ORIGIN", "FLUXIQ_INSTANCE_ID", "FLUXIQ_SITE_ADDRESS", "ACME_EMAIL", "FLUXIQ_SITE_TLS", "FLUXIQ_EMAIL_SENDER", "FLUXIQ_EMAIL_FROM", "FLUXIQ_STRIPE_API_BASE", "FLUXIQ_INSTANCE_NAME"],
      onlyLeft: [],
      onlyRight: ["FLUXIQ_SIGN_UP_URL", "FLUXIQ_EMAIL_SMTP_USERNAME", "FLUXIQ_EMAIL_SMTP_PASSWORD_FILE"]
    });
    for (const [config, env] of [[local, ls], [production, ps]] as const) {
      expect(env.get("FLUXIQ_PUBLIC_ORIGIN")).toBe(`https://${config.domain}`);
      expect(env.get("FLUXIQ_SITE_ADDRESS")).toBe(config.domain);
      expect(env.get("FLUXIQ_INSTANCE_ID")).toBe(config.instance.id);
      expect(env.get("FLUXIQ_INSTANCE_NAME")).toBe(config.instance.name);
      expect(env.get("ACME_EMAIL")).toBe(config.tls.email);
      expect(env.get("FLUXIQ_SITE_TLS")).toBe(config.tls.mode === "internal" ? "tls internal" : `tls ${config.tls.email}`);
      expect(env.get("FLUXIQ_EMAIL_SENDER")).toBe(config.email.smtp);
      expect(env.get("FLUXIQ_EMAIL_FROM")).toBe(config.email.from);
      expect(env.get("FLUXIQ_STRIPE_API_BASE")).toBe(config.payments.apiBase);
    }
    expect([ps.get("FLUXIQ_SIGN_UP_URL"), ps.get("FLUXIQ_EMAIL_SMTP_USERNAME")]).toEqual([production.signUpUrl, production.email.username]);

    // deployment.json: the same keys; the values that differ are the project's, the profile's, the origin's and the paths'.
    const [ld, pd] = [JSON.parse(l["deployment.json"] ?? "{}") as Record<string, unknown>, JSON.parse(p["deployment.json"] ?? "{}") as Record<string, unknown>];
    expect(Object.keys(ld)).toEqual(Object.keys(pd));
    expect(Object.keys(ld).filter((key) => JSON.stringify(ld[key]) !== JSON.stringify(pd[key]))).toEqual(["project", "profile", "publicOrigin", "label", "composeFiles", "secretsVolume", "secrets", "upCommand"]);
  });

  it("replaces an earlier bundle but never empties a folder that holds something else", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-render-"));
    roots.push(root);
    const plan = buildCloudPlan(local, "0.1.0", deployDir);
    await writeBundle(plan, root);
    writeFileSync(path.join(root, "stale.txt"), "left by an earlier render");
    await writeBundle(plan, root);
    expect(readdirSync(root)).not.toContain("stale.txt");
    const other = path.join(root, "..", `${path.basename(root)}-other`);
    roots.push(other);
    mkdirSync(other);
    writeFileSync(path.join(other, "precious.txt"), "someone's file");
    await expect(writeBundle(plan, other)).rejects.toThrow("not empty");
    expect(readdirSync(other)).toEqual(["precious.txt"]);
  });

  it("names a missing deploy/ file instead of writing a partial bundle", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-render-"));
    roots.push(root);
    await expect(writeBundle(buildCloudPlan(local, "0.1.0", `${root}/no-deploy`), path.join(root, "out"))).rejects.toThrow("no-deploy/caddy/Caddyfile.example is missing");
  });
});
