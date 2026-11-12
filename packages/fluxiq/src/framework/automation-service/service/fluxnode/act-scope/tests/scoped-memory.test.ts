import { afterEach, expect, it, vi } from "vitest";
import type { AutomationStudioService } from "../../../../service.ts";
import { AutomationStudioAnswerFirstTaskMemoryStore } from "../../../answer-first/task-memory/index.ts";
import type { FluxNodeRegistered } from "../../pipeline/index.ts";
import { fluxNodeScopedMemoryProblem } from "../scoped-memory.ts";

afterEach(() => vi.restoreAllMocks());
const registered = { projectId: "p", name: "library.save", specHash: "hash" } as FluxNodeRegistered;
const service = () => ({ projectPaths: { root: undefined }, projects: {} }) as unknown as AutomationStudioService;

it("keeps the original storage cause on its explicit pre-admission problem", async () => {
  const cause = new Error("storage unavailable");
  const get = vi.spyOn(AutomationStudioAnswerFirstTaskMemoryStore.prototype, "get").mockRejectedValueOnce(cause);
  const update = vi.spyOn(AutomationStudioAnswerFirstTaskMemoryStore.prototype, "update");
  const problem = await fluxNodeScopedMemoryProblem({ service: service(), registered, scope: "execution" });
  expect(problem?.cause).toBe(cause);
  expect(problem?.message).toContain("stored execution state");
  expect(get).toHaveBeenCalledWith("p", expect.any(String), { scoped: true });
  expect(update).not.toHaveBeenCalled();
});

it("checks carried, normal, pinned and scoped explore task variants without writing", async () => {
  const get = vi.spyOn(AutomationStudioAnswerFirstTaskMemoryStore.prototype, "get").mockResolvedValue(undefined);
  const update = vi.spyOn(AutomationStudioAnswerFirstTaskMemoryStore.prototype, "update");
  expect(await fluxNodeScopedMemoryProblem({ service: service(), registered, scope: "execution", taskKey: "original-task-key" })).toBeUndefined();
  expect(get).toHaveBeenCalledTimes(4);
  expect(new Set(get.mock.calls.map((call) => call[1])).size).toBe(4);
  expect(update).not.toHaveBeenCalled();
});
