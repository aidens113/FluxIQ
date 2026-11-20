// @fluxiq-test-group real-sql
// The service's graph-entry input authority as production opens it: a later attempt's first stage runs the task's saved
// Flow (`../../../answer-first/attempt/flow-stage.ts`) through the real service, engine and a scripted model on the
// lending library (`../../../answer-first/tests/later-attempts.ts`), driven by a caller's options as code drives it.
// The caller's own inputs are sealed at the run's root through the service's durable input owner, under the attempt's
// project, task and authenticated principal. A run whose origin nothing authenticates (inside a run-secret context, as
// a FluxNode with a secret input runs) stays unknown and seals nothing. The run's result is the same either way.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runWithAutomationStudioRunSecrets } from "../../../../../../runtime/run-secrets/index.ts";
import type { AutomationStudioInputScope } from "../../../../../../runtime/input-basis/index.ts";
import { caller } from "../../../../tests/service-bootstrap/tests/fixtures.ts";
import type { AutomationStudioAnswerFirstCallerOptions } from "../../../flow-bootstrap-commands/index.ts";
import { drivenBy } from "../../../answer-first/attempt/tests/caller-driven.ts";
import { complete } from "../../../answer-first/tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../../answer-first/tests/later-attempts.ts";
import { AutomationStudioInputBasisStore } from "../../index.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const LIST = "List every loan on my library account.";
const KEY = "library.loans:input-use";
const INPUTS: JsonObject = { note: "renew politely" };
/** The producer `flow-stage.ts` issues the run's evidence under. */
const PRODUCER = "answer-first.flow-run";

/** A task explored once, then its saved Flow run again by a caller with its own inputs, inside a secret context where asked. */
async function replayed(secret: boolean) {
  const lane = await laterAttempts(cleanups);
  const options: { now: AutomationStudioAnswerFirstCallerOptions } = { now: { taskKey: KEY } };
  drivenBy(lane.service, () => options.now);
  const first = await lane.attempt({ instruction: LIST, script: [readLoans(), complete("Listed.")] });
  expect(first.answer.attempt.status).toBe("achieved");
  options.now = { taskKey: KEY, inputs: INPUTS };
  const second = secret ? await runWithAutomationStudioRunSecrets({ card: "card-secret-for-the-test" }, () => lane.attempt({ instruction: LIST })) : await lane.attempt({ instruction: LIST });
  const taskId = second.answer.attempt.taskId;
  if (!taskId) throw new Error("the replay names no task");
  const scope: AutomationStudioInputScope = { projectId: lane.projectId, taskId, principalId: caller().actorUserId, producerId: PRODUCER };
  const store = new AutomationStudioInputBasisStore(lane.service.projectPaths, lane.service.projects, lane.service.runDatasets);
  return { second, scope, store };
}

/** What the replay answered, as a person gets it: its ending, its path and its rows. */
function answered(second: Awaited<ReturnType<typeof replayed>>["second"]) {
  return { status: second.answer.attempt.status, path: second.answer.attempt.path, rows: second.answer.result?.rows?.previewRows, total: second.answer.result?.rows?.totalRows, decisions: second.decisions.length };
}

describe("a saved Flow's run in a later attempt's first stage", () => {
  it("seals the caller's own inputs at the root under the attempt's project, task and authenticated principal, and the result is the same either way", async () => {
    const sealed = await replayed(false);
    expect(answered(sealed.second)).toMatchObject({ status: "achieved", path: "run_flow", decisions: 0 });
    const entry = await sealed.store.read(sealed.scope);
    const callerLayer = await sealed.store.read({ ...sealed.scope, producerId: `${PRODUCER}.caller` });
    expect(entry?.head?.reference).toBeDefined();
    expect(entry?.head?.producers).toEqual([{ role: "caller", reference: callerLayer?.head?.reference }]);
    // The scope is the authenticated owners': another principal holds nothing.
    expect((await sealed.store.read({ ...sealed.scope, principalId: "user.someone-else" }))?.head).toBeUndefined();

    // Inside a secret context the origin is not authenticated: nothing is sealed, and the run is not changed by it.
    const unknown = await replayed(true);
    expect((await unknown.store.read(unknown.scope))?.head).toBeUndefined();
    expect(answered(unknown.second)).toEqual(answered(sealed.second));
    expect(answered(sealed.second)).toMatchObject({ total: 3, rows: [{ title: "Atlas of Rivers" }, { title: "Birds of the Coast" }, { title: "Clockmaking" }] });
  });
});
