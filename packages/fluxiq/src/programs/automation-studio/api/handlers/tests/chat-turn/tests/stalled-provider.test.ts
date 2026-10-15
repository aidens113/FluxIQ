// A chat turn ends inside its own deadline, with its person-facing words, when
// the model provider stalls (t613).
//
// A8 wave 4 ran during a DeepSeek API incident. A chat attempt's body read was
// cut at 15 s, the next attempt never ended, and the panel showed "Sending your
// message" until the Lab gave up at 60 s. Core bounds a turn at three attempts
// of 15 s and 24 s in all (`runtime/conversations/instructions/interpret.ts`).
//
// This is the path a panel message takes, provider-free: the registry's
// `append-turn` endpoint (`api/handlers/conversations.ts`), the real conversation store,
// the real interpretation and the real DeepSeek panel-command model, whose
// `fetchImpl` sends DeepSeek's request to a local HTTP server instead. No real provider is ever called: the
// fetch refuses any address but DeepSeek's, and sends that one to 127.0.0.1.
// The key is a fixed fake.
//
// The three ways a provider stalls are the server's modes: headers then a blank
// line a second forever; no headers ever; headers then a valid reply after
// 20 s. A fourth is a transport that ignores its signal altogether, which is
// what the live attempt behaved as: the turn must not depend on the model
// honouring its signal to end on time.

import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../contracts.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS,
  automationStudioConversationCommandWork,
  AutomationStudioConversations,
  createAutomationStudioDeepSeekPanelCommandModel
} from "../../../../../runtime/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL } from "../../../../../runtime/llm/deepseek/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../../storage/index.ts";
import { registerAutomationStudioConversationEndpoints, type AutomationStudioConversationApiDependencies } from "../../../conversations.ts";

type StallMode = "blank_lines_forever" | "no_headers" | "reply_after_20s";

const FAKE_KEY = "sk-local-test-only-0000000000000000";
const PROJECT = "project.one";
const ACTOR: ProgramApiActor = { sessionId: "session.person", userId: "user.person", roleId: "operator", permissions: ["programs.read", "programs.write"] };
const LATE_REPLY_MS = 20_000;
/**
 * The reading's whole deadline, and what may follow it: storing the turn and
 * its answer. Both well inside the forty seconds the extension gives a send
 * (`background/connection/core-api.ts` downstream).
 */
const DEADLINE_MS = AUTOMATION_STUDIO_CONVERSATION_INTERPRET_LIMITS.deadlineMs;
const AFTER_DEADLINE_MS = 4_000;
const TIMED_OUT_WORDS = "because the model did not answer in time";

const VALID_REPLY = JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"reply": "Hello."}' } }], usage: { prompt_tokens: 10, completion_tokens: 3 } });

let server: http.Server;
let base = "";
const open = new Set<http.ServerResponse>();
const timers = new Set<NodeJS.Timeout>();

beforeAll(async () => {
  server = http.createServer((request, response) => {
    request.resume();
    open.add(response);
    response.on("close", () => open.delete(response));
    const mode = request.url?.slice(1) as StallMode;
    if (mode === "no_headers") return;
    response.writeHead(200, { "content-type": "application/json" });
    if (mode === "blank_lines_forever") {
      const tick = setInterval(() => response.write("\n"), 1_000);
      timers.add(tick);
      response.on("close", () => clearInterval(tick));
      return;
    }
    const late = setTimeout(() => response.end(VALID_REPLY), LATE_REPLY_MS);
    timers.add(late);
    response.on("close", () => clearTimeout(late));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const timer of timers) clearTimeout(timer);
  for (const response of open) response.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** DeepSeek's request, sent to the local server's `mode` instead. Any other address is refused, so nothing reaches a real provider. */
function localFetch(mode: StallMode): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) => {
    if (String(input) !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL) throw new Error(`This test sends only DeepSeek's request, never ${String(input)}.`);
    return fetch(`${base}/${mode}`, init);
  }) as typeof fetch;
}

/** A transport that takes the request and never answers, whatever its signal says. */
const deafFetch = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

async function sendTurn(fetchImpl: typeof fetch) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-stalled-provider-test-"));
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  try {
    const conversations = new AutomationStudioConversations(pool).bindModel(createAutomationStudioDeepSeekPanelCommandModel({ resolveKey: async () => FAKE_KEY, fetchImpl }));
    const thread = await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null });
    const registry = new GlobalProgramApiRegistry();
    const service: AutomationStudioConversationApiDependencies["service"] = {
      assertProjectDomainAccess: async () => undefined,
      listProjects: async () => ({ projects: [] }),
      listFlows: async () => [],
      conversations
    };
    registerAutomationStudioConversationEndpoints({ registry, service });
    const started = Date.now();
    const answer = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
      scope: { domainId: null },
      actor: ACTOR,
      payload: { projectId: PROJECT, conversationId: thread.conversationId, text: "Hello, what can you do here?", capabilities: [{ id: "flow.describe" }] }
    });
    const elapsedMs = Date.now() - started;
    await automationStudioConversationCommandWork.idle();
    const turns = (await conversations.getConversation({ projectId: PROJECT, conversationId: thread.conversationId }))?.turns ?? [];
    return { answer, elapsedMs, turns };
  } finally {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}

function expectEndedInTime(result: Awaited<ReturnType<typeof sendTurn>>) {
  // The panel gets the reply: the call answered, with the reading and the words it wrote.
  expect(result.answer.ok).toBe(true);
  const payload = result.answer.payload as { response: { source: string; modelProblem: string | null; text?: string } | null; problem: string | null };
  expect(payload.problem).toBeNull();
  expect(payload.response).toMatchObject({ source: "closest_match", modelProblem: "the model did not answer in time" });
  // Inside the turn's own deadline, not the panel's or the Lab's.
  expect(result.elapsedMs).toBeLessThan(DEADLINE_MS + AFTER_DEADLINE_MS);
  // The thread holds the person's words and an answer that says why the model was not used.
  const automation = result.turns.filter((turn) => turn.author === "automation");
  expect(automation.at(-1)?.text).toContain(TIMED_OUT_WORDS);
}

const TURN_TEST_TIMEOUT_MS = DEADLINE_MS + 20_000;

describe.concurrent("a chat turn when the model provider stalls", () => {
  it("ends inside its deadline when DeepSeek sends headers and then a blank line a second forever", async () => {
    expectEndedInTime(await sendTurn(localFetch("blank_lines_forever")));
  }, TURN_TEST_TIMEOUT_MS);

  it("ends inside its deadline when DeepSeek never sends headers", async () => {
    expectEndedInTime(await sendTurn(localFetch("no_headers")));
  }, TURN_TEST_TIMEOUT_MS);

  it("ends inside its deadline when DeepSeek sends headers and its reply only after 20 s", async () => {
    expectEndedInTime(await sendTurn(localFetch("reply_after_20s")));
  }, TURN_TEST_TIMEOUT_MS);

  it("ends inside its deadline when the transport ignores its signal and never answers", async () => {
    expectEndedInTime(await sendTurn(deafFetch));
  }, TURN_TEST_TIMEOUT_MS);
});
