import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";

// The recordings list a paired client reads (`/api/recordings`, t379) names the
// domain its pairing bound, and sees only that domain's projects' recordings.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let tempRoot: string;
let service: AutomationStudioService;

describe("recording summaries by domain", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-summary-domain-"));
    service = new AutomationStudioService({ dataDir: tempRoot });
  });

  afterEach(async () => {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("lists only the recordings of the named domain's projects, and those of unscoped projects when none is named", async () => {
    const web = await service.createProject({ name: "Web", domainId: "web-automation" });
    const desktop = await service.createProject({ name: "Desktop", domainId: "desktop-automation" });
    const unscoped = await service.createProject({ name: "Unscoped" });
    for (const [project, recordingId] of [[web, "recording.web"], [desktop, "recording.desktop"], [unscoped, "recording.unscoped"]] as const) {
      await service.createRecording({ projectId: project.id, recordingId, startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    }

    const ids = async (input: Parameters<AutomationStudioService["listRecordingSummaries"]>[0]) => (await service.listRecordingSummaries(input)).items.map((item) => [item.id, item.projectId]);

    expect(await ids({ domainId: "web-automation" })).toEqual([["recording.web", web.id]]);
    expect(await ids({ domainId: "desktop-automation" })).toEqual([["recording.desktop", desktop.id]]);
    expect(await ids({ domainId: null })).toEqual([["recording.unscoped", unscoped.id]]);
    expect(await ids({})).toEqual([["recording.unscoped", unscoped.id]]);
  });
});
