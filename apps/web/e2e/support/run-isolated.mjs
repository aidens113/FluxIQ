// Runs the panel's browser specs end to end on the isolated fixture host, with no model key and no model call.
//
//   node apps/web/e2e/support/run-isolated.mjs [--skip-build] [--only <spec file>...] [--fail-fast]
//
// Per round it (1) seeds `apps/web/.e2e-host` (the marked fixture directory only), (2) starts the production panel on
// a free port against it, (3) waits for /api/ready, (4) runs Playwright on the desktop Chromium project, and (5) always
// stops the server it started, by its own process id and its whole child tree. Rounds: the default panel's read-only
// specs, each spec that changes the fixture alone on a fresh seed, then the preset spec once per non-default preset
// (the preset is read when the server starts).
// It never reads a real ~/.fluxiq and strips every model key from the server's environment. Run it through the
// machine's heavy-slot queue (see the brief of the W5 P6 lane).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(webRoot, ".e2e-host");
const FIXTURE_MARKER = "fluxiq-e2e-fixture-v1";
const PRESET_SPEC = "e2e/panel-presets.spec.ts";
// The docked Assistant's spec reads the conversation threads `seed-chat-threads.mjs` writes over the seeded fixture.
const CHAT_SPEC = "e2e/chat-widget.spec.ts";
// These change the fixture (the assistant deletes a Flow and renames a step; the editor renames a step; the chat spec
// answers its seeded asks), so each runs on a fresh seed of its own, after the read-only specs, and no spec that reads
// the seeded data may run behind them.
const MUTATING_SPECS = ["e2e/panel-assistant.spec.ts", "e2e/panel-flows.spec.ts", CHAT_SPEC];
const PRESET_ROUNDS = ["data-collection", "task-automation"];
const PROJECT = "desktop-chromium";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args.slice(onlyIndex + 1).filter((value) => !value.startsWith("--")) : [];
const keepGoing = !flag("--fail-fast");

const started = [];
let cleaned = false;

/** Stops every server this run started, by process id and child tree. Safe to call twice. */
function stopServers() {
  for (const pid of started.splice(0)) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else {
      try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
    log(`stopped the panel server (pid ${pid}) and its children`);
  }
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  stopServers();
}
process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}
process.on("uncaughtException", (error) => {
  log(`unexpected error: ${error.stack ?? error}`);
  cleanup();
  process.exit(1);
});

function log(message) {
  process.stdout.write(`[run-isolated ${new Date().toISOString().slice(11, 19)}] ${message}\n`);
}

/** The server's environment: the fixture host only, the gateway off, and no model key of any kind. */
function serverEnvironment(port, preset) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/(API_KEY|APIKEY)/iu.test(name)) env[name] = "";
  for (const name of ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY"]) env[name] = "";
  env.FLUXIQ_IMPORTER_ROOT = fixtureRoot;
  env.FLUXIQ_CLIENT_GATEWAY_ENABLED = "false";
  env.FLUXIQ_E2E_SCRIPTED_ASSISTANT = "1";
  env.PORT = String(port);
  if (preset) env.FLUXIQ_PANEL_PRESET = preset;
  else delete env.FLUXIQ_PANEL_PRESET;
  delete env.FLUXIQ_E2E_BASE_URL;
  return env;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function runSync(label, command, commandArgs, options = {}) {
  log(`${label}: ${[command, ...commandArgs].join(" ")}`);
  const began = Date.now();
  // The seed and the verifier print the manifest (it holds the fixture person's password), so only their errors show.
  const stdio = options.quiet ? ["ignore", "ignore", "inherit"] : "inherit";
  const result = spawnSync(command, commandArgs, { cwd: webRoot, stdio, shell: options.shell ?? false, env: options.env ?? process.env });
  log(`${label}: exit ${result.status} after ${Math.round((Date.now() - began) / 1000)}s`);
  return result.status ?? 1;
}

/** Refuses to seed anywhere but the marked fixture directory (the seed checks the marker too). */
function assertFixtureRootIsOurs() {
  const marker = path.join(fixtureRoot, ".fluxiq-e2e-fixture-root");
  if (existsSync(fixtureRoot) && readdirSync(fixtureRoot).length > 0 && !(existsSync(marker) && readFileSync(marker, "utf8").trim() === FIXTURE_MARKER)) {
    throw new Error(`Refusing to use an unmarked fixture directory: ${fixtureRoot}`);
  }
}

async function waitForReady(base, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The panel server exited early with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${base}/api/ready`);
      if (response.ok) return;
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The panel did not answer /api/ready within ${Math.round(timeoutMs / 1000)}s.`);
}

async function round(name, preset, specs) {
  log(`round "${name}": seed`);
  assertFixtureRootIsOurs();
  const seedEnv = { ...process.env, FLUXIQ_E2E_FAST_STUDIO: "true" };
  if (runSync("seed", process.execPath, ["e2e/support/seed-fixtures.mjs"], { quiet: true, env: { ...seedEnv, FLUXIQ_E2E_FIXTURE_ROOT: fixtureRoot } }) !== 0) return 1;
  const verifyEnv = { ...seedEnv, FLUXIQ_E2E_VERIFY_TARGET: "panel", FLUXIQ_E2E_FIXTURE_ROOT: fixtureRoot };
  if (runSync("verify", process.execPath, ["e2e/support/verify-fixtures.mjs"], { quiet: true, env: verifyEnv }) !== 0) return 1;
  if (specs.includes(CHAT_SPEC) && runSync("seed chat threads", process.execPath, ["e2e/support/seed-chat-threads.mjs"], { quiet: true, env: { ...seedEnv, FLUXIQ_E2E_FIXTURE_ROOT: fixtureRoot } }) !== 0) return 1;

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
  log(`starting the panel on ${base}${preset ? ` with preset ${preset}` : ""}`);
  const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: webRoot, env: serverEnvironment(port, preset), stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  started.push(server.pid);
  const tail = [];
  const remember = (chunk) => {
    tail.push(String(chunk));
    if (tail.length > 40) tail.shift();
  };
  server.stdout.on("data", remember);
  server.stderr.on("data", remember);
  try {
    await waitForReady(base, server, 180_000);
    log("the panel is ready");
    const playwright = path.join(webRoot, "node_modules", "@playwright", "test", "cli.js");
    return runSync(`playwright (${name})`, process.execPath, [playwright, "test", ...specs, `--project=${PROJECT}`, "--workers=1", "--reporter=list"], {
      env: { ...process.env, FLUXIQ_E2E_BASE_URL: base, FLUXIQ_E2E_PRESET: preset ?? "full", FLUXIQ_E2E_FIXTURE_ROOT: fixtureRoot }
    });
  } catch (error) {
    log(`round "${name}" failed: ${error.message}`);
    log(`server output (last lines): ${tail.join("").slice(-1500)}`);
    return 1;
  } finally {
    stopServers();
    // The server's pid is gone: nothing of this round may stay.
    if (server.pid && processAlive(server.pid)) log(`WARNING: pid ${server.pid} is still alive`);
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function allSpecs() {
  const dir = path.join(webRoot, "e2e");
  return [...readdirSync(dir).filter((file) => /^panel-.*\.spec\.ts$/u.test(file)).sort().map((file) => `e2e/${file}`), CHAT_SPEC];
}

async function main() {
  const began = Date.now();
  if (!flag("--skip-build")) {
    const status = runSync("build", "pnpm", ["--filter", "@fluxiq/web", "build"], { shell: true });
    if (status !== 0) {
      log("the panel build failed");
      return 1;
    }
  }
  rmSync(path.join(webRoot, "test-results", "playwright"), { recursive: true, force: true });
  const chosen = only.length > 0 ? only : allSpecs();
  const readOnly = chosen.filter((spec) => spec !== PRESET_SPEC && !MUTATING_SPECS.includes(spec));
  const rounds = [];
  if (readOnly.length > 0) rounds.push(["default panel, read-only specs", undefined, readOnly]);
  for (const spec of MUTATING_SPECS.filter((candidate) => chosen.includes(candidate))) rounds.push([`default panel, ${spec}`, undefined, [spec]]);
  if (chosen.includes(PRESET_SPEC)) {
    for (const preset of PRESET_ROUNDS) rounds.push([`preset ${preset}`, preset, [PRESET_SPEC]]);
  }
  let failed = 0;
  for (const [name, preset, specs] of rounds) {
    if (failed > 0 && !keepGoing) break;
    failed += (await round(name, preset, specs)) === 0 ? 0 : 1;
  }
  log(`done in ${Math.round((Date.now() - began) / 1000)}s, ${failed} round(s) failed`);
  return failed === 0 ? 0 : 1;
}

const code = await main();
cleanup();
process.exit(code);
