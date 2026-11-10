// Every endpoint of this program the panel assistant may call accepts the minimal example its input describes:
// the handler does not refuse it as a bad payload. (A id that names nothing is a plain "not found", not a payload error.)
import { describe, expect, it } from "vitest";
import { getRuntimeRunInput, listRuntimeCapabilitiesInput, listRuntimeClientsInput, listRuntimeRunsInput, runtimeSnapshotInput } from "@fluxiq/contracts/program-api-inputs";
import type { ProgramApiInput } from "@fluxiq/contracts/program-api-inputs";
import { createGlobalProgramRuntime } from "../../../index.ts";
import { actorFor } from "../../../tests/login-actor.ts";

const examples: ReadonlyArray<readonly [string, ProgramApiInput<unknown>, unknown]> = [
  ["snapshot", runtimeSnapshotInput, {}],
  ["list-clients", listRuntimeClientsInput, {}],
  ["list-capabilities", listRuntimeCapabilitiesInput, {}],
  ["list-runs", listRuntimeRunsInput, {}],
  ["get-run", getRuntimeRunInput, { runId: "no-such-run" }]
];

describe("runtime assistant inputs", () => {
  it.each(examples)("%s accepts its minimal example", async (endpoint, input, example) => {
    const runtime = createGlobalProgramRuntime();
    const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
    const payload = input.parse(example);
    const answer = (await runtime.api.call({ programId: "runtime", endpoint, scope: {}, actor: actorFor(login), payload })) as { ok: boolean; error?: string };
    expect(answer.error ?? "").not.toMatch(/is required|must be|invalid/i);
  });
});
