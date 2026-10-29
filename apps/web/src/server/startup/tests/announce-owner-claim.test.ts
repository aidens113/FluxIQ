import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../../log";
import { announceOwnerClaim } from "../index";

function run(profile: "local" | "self-hosted" | "service", claim: { claimed: boolean; codeFile: string | null }) {
  const lines: string[] = [];
  const prepare = vi.fn(async () => claim);
  const logger = createLogger({ format: "text", sink: (_level, line) => lines.push(line) });
  return { lines, prepare, done: announceOwnerClaim({ profile, publicOrigin: "https://panel.example.test", logger, prepare }) };
}

describe("announceOwnerClaim", () => {
  it("does nothing on the local profile", async () => {
    const { lines, prepare, done } = run("local", { claimed: false, codeFile: "/x/code" });
    await done;
    expect(prepare).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("logs the code file path and the setup page when unclaimed, never a code", async () => {
    const { lines, done } = run("service", { claimed: false, codeFile: "/data/setup-code.txt" });
    await done;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("/data/setup-code.txt");
    expect(lines[0]).toContain("https://panel.example.test/setup");
  });

  it("says nothing once claimed", async () => {
    const { lines, done } = run("self-hosted", { claimed: true, codeFile: null });
    await done;
    expect(lines).toEqual([]);
  });
});
