import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = [
  { directory: "packages/contracts", name: "@fluxiq/contracts" },
  { directory: "packages/fluxiq", name: "fluxiq" },
  { directory: "packages/client-gateway-websocket", name: "@fluxiq/client-gateway-websocket" }
];
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-packages-"));

try {
  const tarballRoot = path.join(temporaryRoot, "tarballs");
  await mkdir(tarballRoot, { recursive: true });
  const tarballs = new Map();
  for (const packageDefinition of packages) {
    const before = new Set(await readdir(tarballRoot));
    run("pnpm", ["--dir", packageDefinition.directory, "pack", "--pack-destination", tarballRoot], repositoryRoot, true);
    const created = (await readdir(tarballRoot)).filter((entry) => !before.has(entry) && entry.endsWith(".tgz"));
    if (created.length !== 1) throw new Error(`Expected one tarball for ${packageDefinition.name}; found ${created.length}.`);
    const tarball = path.join(tarballRoot, created[0]);
    inspectTarball(tarball, packageDefinition.name);
    tarballs.set(packageDefinition.name, tarball);
  }

  await validateRuntimeConsumer(tarballs);
  await validateBrowserConsumer(tarballs);
  process.stdout.write("Packed-package validation passed.\n");
} finally {
  await removeWithRetry(temporaryRoot);
}

function inspectTarball(tarball, packageName) {
  const entries = run("tar", ["-tf", tarball], repositoryRoot, true).split(/\r?\n/).filter(Boolean);
  const forbidden = entries.filter((entry) =>
    /(^|\/)src\//.test(entry)
    || /(^|\/)(?:test|tests|__tests__)(?:\/|\.)/.test(entry)
    || /(^|\/)\.fluxiq\//.test(entry)
    || /(^|\/)docs\/generated\//.test(entry)
  );
  if (forbidden.length) throw new Error(`${packageName} tarball contains forbidden files:\n${forbidden.join("\n")}`);
  for (const required of ["package/package.json", "package/README.md"]) {
    if (!entries.includes(required)) throw new Error(`${packageName} tarball is missing ${required}.`);
  }
  for (const extension of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
    if (!entries.some((entry) => entry.startsWith("package/dist/") && entry.endsWith(extension))) {
      throw new Error(`${packageName} tarball has no compiled ${extension} output.`);
    }
  }
  const size = entries.length;
  process.stdout.write(`${packageName}: ${size} packed files (${path.basename(tarball)})\n`);
}

async function validateRuntimeConsumer(tarballs) {
  const root = path.join(temporaryRoot, "runtime-consumer");
  await mkdir(root, { recursive: true });
  await writeJson(path.join(root, "package.json"), {
    name: "fluxiq-packed-runtime-smoke",
    private: true,
    type: "module",
    dependencies: {
      "@fluxiq/contracts": fileDependency(tarballs.get("@fluxiq/contracts")),
      fluxiq: fileDependency(tarballs.get("fluxiq"))
    },
    devDependencies: { "@types/node": "^22.10.0" },
    pnpm: { overrides: { "@fluxiq/contracts": fileDependency(tarballs.get("@fluxiq/contracts")) } }
  });
  await writeFile(path.join(root, ".npmrc"), "auto-install-peers=false\n", "utf8");
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  });
  await writeFile(path.join(root, "consumer.ts"), [
    'import { FluxIQ } from "fluxiq";',
    'import { SQLiteRepository, createRecord } from "fluxiq/database-manager";',
    'import type { JsonObject } from "@fluxiq/contracts/core";',
    'const runtime = FluxIQ.create({ rootDir: process.cwd(), loadEnv: false });',
    'const repository = new SQLiteRepository<JsonObject>({ rootDir: runtime.paths.databases, kind: "smoke", layoutVersion: 2 });',
    'void repository.put(createRecord({ id: "typecheck", kind: "smoke", data: { valid: true } }));'
  ].join("\n"), "utf8");
  await writeFile(path.join(root, "runtime-smoke.mjs"), runtimeSmokeSource(), "utf8");
  install(root);
  if (await exists(path.join(root, "node_modules", "typedoc"))) {
    throw new Error("The ordinary runtime consumer unexpectedly installed optional TypeDoc tooling.");
  }
  run(process.execPath, [typescriptCli(), "--project", path.join(root, "tsconfig.json")], root);
  run(process.execPath, [path.join(root, "runtime-smoke.mjs")], root);
}

async function validateBrowserConsumer(tarballs) {
  const root = path.join(temporaryRoot, "browser-consumer");
  await mkdir(root, { recursive: true });
  await writeJson(path.join(root, "package.json"), {
    name: "fluxiq-packed-browser-smoke",
    private: true,
    type: "module",
    dependencies: {
      "@fluxiq/contracts": fileDependency(tarballs.get("@fluxiq/contracts")),
      "@fluxiq/client-gateway-websocket": fileDependency(tarballs.get("@fluxiq/client-gateway-websocket"))
    },
    pnpm: { overrides: { "@fluxiq/contracts": fileDependency(tarballs.get("@fluxiq/contracts")) } }
  });
  await writeFile(path.join(root, ".npmrc"), "auto-install-peers=false\n", "utf8");
  await writeFile(path.join(root, "entry.js"), [
    'import * as client from "@fluxiq/client-gateway-websocket";',
    'import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";',
    'globalThis.__fluxiqBrowserSmoke = { client, CLIENT_GATEWAY_PROTOCOL_VERSION };'
  ].join("\n"), "utf8");
  await writeFile(path.join(root, "consumer.ts"), [
    'import { FluxIQClientGatewayWebSocketClient } from "@fluxiq/client-gateway-websocket";',
    'import type { ClientGatewaySnapshot } from "@fluxiq/contracts/client-gateway";',
    'declare const snapshot: ClientGatewaySnapshot;',
    'void snapshot;',
    'void FluxIQClientGatewayWebSocketClient;'
  ].join("\n"), "utf8");
  await writeJson(path.join(root, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM"],
      strict: true,
      noEmit: true,
      skipLibCheck: false
    },
    include: ["consumer.ts"]
  });
  install(root);
  for (const forbiddenPackage of ["fluxiq", "sqlite3", "typedoc", "qrcode"]) {
    if (await exists(path.join(root, "node_modules", forbiddenPackage))) {
      throw new Error(`The browser consumer unexpectedly installed ${forbiddenPackage}.`);
    }
  }
  run(process.execPath, [typescriptCli(), "--project", path.join(root, "tsconfig.json")], root);
  const clientManifest = JSON.parse(await readFile(path.join(root, "node_modules", "@fluxiq", "client-gateway-websocket", "package.json"), "utf8"));
  if (Object.keys(clientManifest.dependencies ?? {}).some((name) => name !== "@fluxiq/contracts")) {
    throw new Error("The browser client gained a runtime dependency outside @fluxiq/contracts.");
  }
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["entry.js"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true
  });
  const graph = Object.keys(result.metafile.inputs).join("\n").toLowerCase();
  for (const forbidden of ["fluxiq/dist", "sqlite3", "typedoc", "qrcode", "node:fs", "node:path"]) {
    if (graph.includes(forbidden)) throw new Error(`Browser package graph contains forbidden dependency: ${forbidden}`);
  }
}

function runtimeSmokeSource() {
  const runtimeSubpaths = [
    "api-contracts", "auth", "client-gateway", "automation-studio", "automation-studio/nodes",
    "background-tasks", "components", "compute", "compute-control", "core", "data",
    "database-manager", "deployment-sync", "domains", "docs", "engine", "flows", "framework",
    "identity-access", "io", "production-runner", "programs", "ui"
  ];
  return `
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FluxIQ } from "fluxiq";
import { SQLiteRepository, createRecord } from "fluxiq/database-manager";

for (const subpath of ${JSON.stringify(runtimeSubpaths)}) await import(\`fluxiq/\${subpath}\`);
const freshRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-runtime-smoke-"));
const framework = FluxIQ.create({ rootDir: freshRoot, domainId: "Importer Domain", loadEnv: false });
await framework.setup();
const repository = new SQLiteRepository({ rootDir: framework.paths.databases, kind: "smoke.records", layoutVersion: 2 });
await repository.put(createRecord({ id: "global", kind: "smoke.records", data: { owner: "framework" } }));
await repository.put(createRecord({ id: "domain", kind: "smoke.records", scope: { domainId: "Importer Domain" }, data: { owner: "importer" } }));
assert.equal((await repository.get("global"))?.data.owner, "framework");
assert.equal((await repository.get("domain", { domainId: "Importer Domain" }))?.data.owner, "importer");
assert.deepEqual(repository.databases(), ["global", "importer_domain"]);

const legacyRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-migration-smoke-"));
const legacyState = path.join(legacyRoot, ".fluxiq", "data", "programs", "deployment-sync", "state.json");
await mkdir(path.dirname(legacyState), { recursive: true });
await writeFile(legacyState, JSON.stringify({ version: 1, data: { marker: "packed" } }), "utf8");
const legacy = FluxIQ.create({ rootDir: legacyRoot, domainId: "Importer Domain", loadEnv: false });
assert.equal(legacy.inspectStorage().layout, "v1");
await legacy.migrateStorage();
const migrated = new SQLiteRepository({ rootDir: path.join(legacyRoot, ".fluxiq"), kind: "program.state", layoutVersion: 2 });
assert.equal((await migrated.get("deployment-sync/state"))?.data.marker, "packed");
assert.equal(JSON.parse(await readFile(path.join(legacyRoot, ".fluxiq", "config.json"), "utf8")).layoutVersion, 2);
`;
}

function install(cwd) {
  run("pnpm", ["install", "--ignore-workspace", "--no-frozen-lockfile"], cwd);
}

function fileDependency(filePath) {
  return `file:${filePath.replaceAll("\\", "/")}`;
}

function typescriptCli() {
  return path.join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(target) {
  return await stat(target).then(() => true, () => false);
}

function run(command, args, cwd, capture = false) {
  const useWindowsShell = process.platform === "win32" && command === "pnpm";
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    shell: useWindowsShell
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.\n${result.stderr ?? ""}`);
  return result.stdout ?? "";
}

async function removeWithRetry(target) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
