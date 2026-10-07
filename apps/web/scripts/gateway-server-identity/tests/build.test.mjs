import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { serverIdentitySlot, serverSourceInventory, stampServerBuildIdentity } from "../index.mjs";
const slot = JSON.stringify("__FLUXIQ_SERVER_IDENTITY_BEGIN__" + Buffer.from('{"fluxiqServerIdentityPlaceholder":310}').toString("base64") + "__FLUXIQ_SERVER_IDENTITY_END__");
test("payload-only normalization refuses missing/multiple/malformed slots and binds reader/framing semantics", () => {
  const code = `const embedded=${slot}; const frame=1;`, hash = bytes => createHash("sha256").update(serverIdentitySlot(bytes)).digest("hex");
  assert.equal(serverIdentitySlot(code), code);
  for (const invalid of ["", code + code, code.replace("BEGIN__", "WRONG__"), code + '\"__FLUXIQ_SERVER_IDENTITY_BEGIN__no-end\"']) assert.throws(() => serverIdentitySlot(invalid));
  assert.notEqual(hash(code), hash(code.replace("frame=1", "frame=2")));
});
test("complete generator/cache source inventory stamps immutable executable and independent source digest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "server-generator-"));
  try {
    const fixtures = { "apps/web/src/server/server.ts": "server", "apps/web/src/lib/fluxiq.ts": "registration", "apps/web/src/instrumentation.ts": "preload", "apps/web/scripts/build.mjs": "generator", "scripts/build-cache/steps.mjs": "cache", "apps/web/package.json": '{"version":"0.1.0"}', "package.json": "{}", "pnpm-lock.yaml": "lock" };
    for (const [file, bytes] of Object.entries(fixtures)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), bytes); }
    const artifact = path.join(root, "server.mjs"); await writeFile(artifact, `const embedded=${slot};`);
    const before = await stampServerBuildIdentity(root, artifact, [path.join(root, "apps/web/src/server/server.ts")]);
    const receipt = JSON.parse(await readFile(`${artifact}.identity.json`, "utf8")); assert.deepEqual(Object.keys(receipt.sources), await serverSourceInventory(root));
    await writeFile(path.join(root, "scripts/build-cache/new.mjs"), "new cache source");
    const after = await stampServerBuildIdentity(root, artifact); assert.equal(after.artifactDigest, before.artifactDigest); assert.notEqual(after.sourceInputsDigest, before.sourceInputsDigest);
    await assert.rejects(() => stampServerBuildIdentity(root, artifact, [path.join(root, "unlisted.ts")]), /undeclared source/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
