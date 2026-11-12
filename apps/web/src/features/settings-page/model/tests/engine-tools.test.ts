import { describe, expect, it } from "vitest";
import { ENGINE_TOOLS, settingsTool } from "../engine-tools";

describe("engine tools", () => {
  it("link only to panel screens, never to a /programs page", () => {
    expect(ENGINE_TOOLS.map((tool) => tool.href)).toEqual([
      "/settings/background-tasks", "/settings/deployment-sync", "/settings/database-manager", "/settings/docs", "/settings/runtime",
      "/settings/compute-control", "/settings/production-runner", "/security/keys", "/security/sign-in"
    ]);
  });
  it("finds a Settings tool by its old program id, and nothing for any other id", () => {
    expect(settingsTool("docs")?.href).toBe("/settings/docs");
    expect(settingsTool("secret-keys")).toBeUndefined();
    expect(settingsTool("anything")).toBeUndefined();
  });
});
