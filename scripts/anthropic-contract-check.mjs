// Anthropic contract check (t1093): sends the first request Core built for each distinct model call -- each role, task
// kind and phase, and each exact tool offer -- to Anthropic's Messages API with a small `max_tokens`, and prints only
// the status and, on a refusal, the API's own error type and message.
//
// Why. On 2026-11-27 every build started from the web panel failed: Anthropic refused the first decision (HTTP 400,
// "The compiled grammar is too large ...") because its 8 strict tools compiled into a grammar past a limit the
// structured-outputs page gives no number for. Unit tests cannot see a limit only the platform knows, so this asks the
// platform, before a live round, whether it accepts what Core sends.
//
// What it sends. The request bodies Core built and wrote itself: the `request.json` of each model step in a step log
// (`FLUXIQ_LLM_STEP_LOG_DIR`, as the panel, a Lab run or a provider-free run writes it), or a `request.json` named
// directly. Those are Core's exact bytes, with the domain's real tools: a decision's tool offer holds the domain's own
// tools beside Core's, which only a run of that domain builds. Of every step with the same provider, model, task kind,
// role, phase and tool offer, only the first is sent. Each body is sent as written except `max_tokens` (16 unless
// `--max-tokens` says) and `stream: false`.
//
// What it costs. A refusal costs nothing: it is answered before any token is sampled. An accepted request is billed
// for its input and up to `max_tokens` of output: about $0.01-0.03 for a decision on Haiku or Sonnet 5.5.
//
// The key. `CLAUDE_API_KEY` is read from the env file given with `--env` and from nowhere else; it is sent only in the
// `x-api-key` header, never printed, and blanked from anything the API says back.
//
// Usage:
//   node scripts/anthropic-contract-check.mjs --env <path to .env.local> [--max-tokens 16] [--dry-run] <step-log dir | request.json>...
//
// `--dry-run` lists what would be sent and sends nothing. Exit status: 0 when every request was accepted, 1 when any was
// refused or could not be sent, 2 for a usage error.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
/** The API version Core's adapter sends (`packages/fluxiq/src/runtime/models/providers/anthropic/messages.ts`). */
export const ANTHROPIC_API_VERSION = "2026-10-21";
const DEFAULT_MAX_TOKENS = 16;

/** `CLAUDE_API_KEY` from an env file's text: `KEY=value` lines, quotes stripped, `#` comments and `export ` ignored. */
export function claudeKeyFromEnvText(text) {
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?CLAUDE_API_KEY\s*=\s*(.*)$/u.exec(line);
    if (!match) continue;
    let value = match[1].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/u, "");
    if (value) return value;
  }
  return undefined;
}

/** Every `request.json` under `target` (a step log or one file), with its step's `meta.json` where there is one, in path order. */
export function requestFiles(target) {
  const found = [];
  const visit = (at) => {
    const stat = statSync(at);
    if (stat.isFile()) {
      if (path.basename(at) === "request.json") found.push(at);
      return;
    }
    for (const name of readdirSync(at).sort()) visit(path.join(at, name));
  };
  visit(target);
  return found.map((file) => {
    const metaFile = path.join(path.dirname(file), "meta.json");
    let meta = {};
    try { meta = JSON.parse(readFileSync(metaFile, "utf8")); } catch { /* best-effort: a request named on its own has no meta */ }
    return { file, meta };
  });
}

/** What makes two steps the same call for this check: provider, model, task kind, role, phase and the exact tool offer. */
export function callKey(body, meta) {
  const tools = createHash("sha256").update(JSON.stringify(body.tools ?? null)).digest("hex").slice(0, 12);
  return [meta.provider ?? "anthropic", body.model ?? meta.model ?? "-", meta.taskKind ?? "-", meta.role ?? "-", meta.phase ?? "-", tools].join(" | ");
}

/** The first Anthropic request of each distinct call among `files`, each with its label and the body to send. */
export function distinctCalls(files, maxTokens = DEFAULT_MAX_TOKENS) {
  const seen = new Map();
  for (const { file, meta } of files) {
    if (meta.provider !== undefined && meta.provider !== "anthropic") continue;
    if (meta.url !== undefined && meta.url !== ANTHROPIC_MESSAGES_URL) continue;
    let body;
    try { body = JSON.parse(readFileSync(file, "utf8")); } catch { continue; }
    if (!body || typeof body !== "object" || typeof body.model !== "string" || !Array.isArray(body.messages)) continue;
    const key = callKey(body, meta);
    if (seen.has(key)) continue;
    const strict = Array.isArray(body.tools) ? body.tools.filter((tool) => tool?.strict === true).length : 0;
    seen.set(key, { key, file, label: `${key} | ${Array.isArray(body.tools) ? `${body.tools.length} tools, ${strict} strict` : "no tools"}`, body: { ...body, max_tokens: maxTokens, stream: false } });
  }
  return [...seen.values()];
}

/** `text` with every occurrence of `key` blanked. */
export function withoutKey(text, key) {
  return key ? String(text).split(key).join("[key]") : String(text);
}

/** Sends one body; answers its status and, for a refusal, the API's own error type and message. */
async function send(body, key, fetchImpl = fetch) {
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST", redirect: "manual",
    headers: { "x-api-key": key, "anthropic-version": ANTHROPIC_API_VERSION, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (response.ok) return { status: response.status };
  let error;
  try { error = JSON.parse(text).error; } catch { /* best-effort: a body that is not JSON is said by its length only */ }
  const said = error && typeof error === "object" ? `${error.type ?? "error"}: ${error.message ?? ""}` : `a ${text.length}-character body that is not an API error`;
  return { status: response.status, error: withoutKey(said, key).slice(0, 600) };
}

function usage(message) {
  process.stderr.write(`${message}\nUsage: node scripts/anthropic-contract-check.mjs --env <env file> [--max-tokens N] [--dry-run] <step-log dir | request.json>...\n`);
  process.exit(2);
}

async function main(argv) {
  let envFile;
  let maxTokens = DEFAULT_MAX_TOKENS;
  let dryRun = false;
  const targets = [];
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === "--env") envFile = argv[++at];
    else if (arg === "--max-tokens") maxTokens = Number(argv[++at]);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--")) usage(`Unknown option ${arg}.`);
    else targets.push(arg);
  }
  if (!targets.length) usage("Name at least one step-log directory or request.json.");
  if (!Number.isInteger(maxTokens) || maxTokens < 1) usage("--max-tokens must be a positive whole number.");
  const calls = distinctCalls(targets.flatMap((target) => requestFiles(target)), maxTokens);
  if (!calls.length) usage("No Anthropic request.json was found there.");
  if (dryRun) {
    for (const call of calls) process.stdout.write(`would send  ${call.label}\n            ${call.file}\n`);
    return 0;
  }
  if (!envFile) usage("--env <env file> is required to send.");
  const key = claudeKeyFromEnvText(readFileSync(envFile, "utf8"));
  if (!key) usage(`No CLAUDE_API_KEY in ${envFile}.`);
  let refused = 0;
  for (const call of calls) {
    try {
      const result = await send(call.body, key);
      if (result.error) refused += 1;
      process.stdout.write(`${result.status}  ${call.label}${result.error ? `\n     ${result.error}` : ""}\n`);
    } catch (error) {
      refused += 1;
      process.stdout.write(`---  ${call.label}\n     not sent: ${withoutKey(error instanceof Error ? error.message : String(error), key)}\n`);
    }
  }
  process.stdout.write(`${calls.length - refused} accepted, ${refused} refused or not sent.\n`);
  return refused ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
