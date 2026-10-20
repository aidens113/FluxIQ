import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertStampedRuntimeIdentity } from "../index.mjs";

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "check-web-build.mjs");

async function webDirectory(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), "web-build-identity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(root, ...relative.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  return root;
}

test("a build whose server output resolved Core's stamped dist passes", async (t) => {
  const web = await webDirectory(t, { ".next/server/app/page.js": 'const embedded = "{\\"schema\\":1}";\n', ".next/server/app/page.js.map": "{}" });
  assert.deepEqual(await assertStampedRuntimeIdentity(web), { checked: 1 });
});

test("a build that embeds the source placeholder is refused, naming the file", async (t) => {
  const web = await webDirectory(t, {
    ".next/server/app/page.js": "ok\n",
    ".next/server/chunks/core_service.js": `let e=JSON.parse('{"fluxiqRuntimeIdentityPlaceholder":302}');\n`
  });
  await assert.rejects(assertStampedRuntimeIdentity(web), /unstamped runtime build identity \(fluxiqRuntimeIdentityPlaceholder in \.next\/server\/chunks\/core_service\.js\)/u);
});

test("a source map that mentions the placeholder is not server JavaScript", async (t) => {
  const web = await webDirectory(t, { ".next/server/app/page.js": "ok\n", ".next/server/app/page.js.map": "fluxiqRuntimeIdentityPlaceholder" });
  await assertStampedRuntimeIdentity(web);
});

test("a build that left no server output is refused", async (t) => {
  const web = await webDirectory(t, { ".next/BUILD_ID": "x\n" });
  await assert.rejects(assertStampedRuntimeIdentity(web), /left no server output/u);
});

test("the web:build command fails the step on a placeholder and passes a stamped build", async (t) => {
  const stamped = await webDirectory(t, { ".next/server/app/page.js": "ok\n" });
  assert.match(execFileSync(process.execPath, [CHECK], { cwd: stamped, encoding: "utf8" }), /no placeholder in 1 server files/u);
  const source = await webDirectory(t, { ".next/server/app/page.js": "fluxiqRuntimeIdentityPlaceholder\n" });
  assert.throws(() => execFileSync(process.execPath, [CHECK, source], { encoding: "utf8", stdio: "pipe" }), (error) => error.status === 1 && /unstamped/u.test(String(error.stderr)));
});
