import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ answer: { ok: true, payload: {} } as { ok: boolean; status?: number; payload?: unknown } }));
vi.mock("../../../automation-studio/data/use-program-transport", () => ({ useProgramTransport: () => ({ get: async () => state.answer }) }));
import { useWorkspaceHasOthers } from "../use-workspace-has-others";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const person = (id: string, enabled = true) => ({ id, username: id, displayName: id, roleId: "admin", enabled });

async function seen(): Promise<boolean> {
  let value: boolean | undefined;
  function Probe() {
    value = useWorkspaceHasOthers();
    return null;
  }
  await act(async () => { create(<Probe />); });
  return value!;
}

beforeEach(() => {
  state.answer = { ok: true, payload: { users: [person("a")], roles: [], sessions: [] } };
});

describe("whether the workspace has more than one person", () => {
  it("is false for one person, so sharing a key is never offered to a solo workspace", async () => {
    expect(await seen()).toBe(false);
  });

  it("is true once a second enabled person is there, and a turned-off account does not count", async () => {
    state.answer = { ok: true, payload: { users: [person("a"), person("b")], roles: [], sessions: [] } };
    expect(await seen()).toBe(true);
    state.answer = { ok: true, payload: { users: [person("a"), person("b", false)], roles: [], sessions: [] } };
    expect(await seen()).toBe(false);
  });

  it("is false when the people cannot be read or this person may not read them", async () => {
    state.answer = { ok: false, status: 403 };
    expect(await seen()).toBe(false);
    state.answer = { ok: false, status: 500 };
    expect(await seen()).toBe(false);
  });
});
