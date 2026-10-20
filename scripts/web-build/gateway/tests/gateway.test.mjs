// The gateway artifact a keyed build copies: current only while its receipt
// matches every source and the artifact, regenerated otherwise, and copied
// byte for byte.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { stampServerBuildIdentity } from "../../../../apps/web/scripts/gateway-server-identity/index.mjs";
import { ensureGatewayArtifact, gatewayArtifactState, gatewayCopyMatches, GATEWAY_FILES } from "../index.mjs";

const PLACEHOLDER = Buffer.from('{"fluxiqServerIdentityPlaceholder":310}').toString("base64");
const ARTIFACT = `const embedded = ${JSON.stringify(`__FLUXIQ_SERVER_IDENTITY_BEGIN__${PLACEHOLDER}__FLUXIQ_SERVER_IDENTITY_END__`)};\n`;

async function write(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
}

/** A checkout holding every source the generator's inventory names, and a stamped artifact. */
async function scratchCore(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-gateway-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = {
    "apps/web/src/server/client-gateway-websocket.ts": "export {};\n",
    "apps/web/src/lib/fluxiq.ts": "export {};\n",
    "apps/web/src/instrumentation.ts": "export {};\n",
    "apps/web/scripts/build-client-gateway-server.mjs": "// generator\n",
    "apps/web/package.json": JSON.stringify({ version: "0.1.0" }),
    "scripts/build-cache/cli.mjs": "// cli\n",
    "package.json": "{}\n",
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n"
  };
  for (const [relative, text] of Object.entries(files)) await write(path.join(root, ...relative.split("/")), text);
  await stamp(root);
  return root;
}

async function stamp(root) {
  const outfile = path.join(root, "apps", "web", GATEWAY_FILES.artifact);
  await write(outfile, ARTIFACT);
  await stampServerBuildIdentity(root, outfile, []);
}

test("a freshly stamped artifact is current", async (t) => {
  const root = await scratchCore(t);
  assert.deepEqual(await gatewayArtifactState(root), { current: true, reason: "the receipt matches every source and the artifact" });
});

test("a changed source, a new source, an edited artifact or a missing receipt is not current, with the reason", async (t) => {
  const changed = await scratchCore(t);
  await writeFile(path.join(changed, "apps/web/src/lib/fluxiq.ts"), "export const changed = 1;\n");
  assert.deepEqual(await gatewayArtifactState(changed), { current: false, reason: "source changed: apps/web/src/lib/fluxiq.ts" });

  const added = await scratchCore(t);
  await write(path.join(added, "apps/web/src/server/new-route.ts"), "export {};\n");
  assert.equal((await gatewayArtifactState(added)).reason, "the source inventory changed");

  const edited = await scratchCore(t);
  await writeFile(path.join(edited, "apps/web", GATEWAY_FILES.artifact), `${ARTIFACT}// edited\n`);
  assert.equal((await gatewayArtifactState(edited)).current, false);

  const missing = await scratchCore(t);
  await rm(path.join(missing, "apps/web", GATEWAY_FILES.receipt));
  assert.deepEqual(await gatewayArtifactState(missing), { current: false, reason: "no artifact or receipt" });
});

test("a current artifact is reused without running the generator; a stale one is generated and must then be current", async (t) => {
  const root = await scratchCore(t);
  const ran = [];
  const lines = [];
  const options = { run: async (command) => ran.push(command), env: { KEEP: "1" }, log: (line) => lines.push(line) };
  assert.equal(await ensureGatewayArtifact(root, options), "reused");
  assert.deepEqual(ran, []);
  assert.match(lines[0], /reused/u);

  await writeFile(path.join(root, "apps/web/src/lib/fluxiq.ts"), "export const changed = 1;\n");
  assert.equal(await ensureGatewayArtifact(root, { ...options, run: async (command) => {
          ran.push(command);
          await stamp(root);
        }
      }), "generated");
  assert.equal(ran.length, 1);
  assert.deepEqual([ran[0].name, ran[0].command, ran[0].args, ran[0].cwd, ran[0].env, ran[0].shell], ["gateway-server-build", process.execPath, [path.join(root, "apps", "web", "scripts", "build-client-gateway-server.mjs")], root, { KEEP: "1" }, false]);

  await writeFile(path.join(root, "apps/web/src/lib/fluxiq.ts"), "export const again = 2;\n");
  await assert.rejects(ensureGatewayArtifact(root, { ...options, run: async () => undefined }), /still not current: source changed/u);
});

test("a staged copy matches only when both files are byte for byte the checkout's", async (t) => {
  const root = await scratchCore(t);
  const staged = path.join(root, "staged", "apps", "web");
  assert.equal(await gatewayCopyMatches(root, staged), false, "absent");
  const canonical = path.join(root, "apps", "web");
  for (const file of [GATEWAY_FILES.artifact, GATEWAY_FILES.receipt]) {
    await write(path.join(staged, file), await readFile(path.join(canonical, file)));
  }
  assert.equal(await gatewayCopyMatches(root, staged), true);
  await writeFile(path.join(staged, GATEWAY_FILES.receipt), "{}\n");
  assert.equal(await gatewayCopyMatches(root, staged), false);
});
