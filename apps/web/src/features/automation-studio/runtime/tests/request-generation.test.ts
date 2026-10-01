import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("detail request generation guards", () => {
  it("invalidates late runtime and database detail responses", () => {
    const runtime = readFileSync(new URL("../RunActionLogView.tsx", import.meta.url), "utf8");
    const database = readFileSync(new URL("../../../programs/live-views/database-manager.tsx", import.meta.url), "utf8");
    const databaseRecords = readFileSync(new URL("../../../programs/database-records/useDatabaseRecords.ts", import.meta.url), "utf8");
    expect(runtime).toContain("ownerRef.current.projectId !== props.projectId");
    expect(runtime).toContain("ownerRef.current.runId !== props.runId");
    expect(runtime).toContain("ownerRef.current.commands !== props.commands");
    expect(runtime).toContain("<RuntimeLogScope key={owner.generation}");
    expect(runtime).toContain("isOwnerCurrent={() => ownerRef.current === owner}");
    expect(runtime).toContain("mountedRef.current && props.isOwnerCurrent()");
    for (const channel of ["detail", "action", "event"]) {
      expect(runtime).toContain(`const current = () => isCurrent() && !controller.signal.aborted && requestId === ${channel}RequestRef.current`);
    }
    expect(runtime).toContain("requestId !== actionDetailRequestRef.current");
    expect(runtime).toContain("requestId !== eventDetailRequestRef.current");
    expect(runtime.match(/new AbortController\(\)/g)).toHaveLength(6);
    expect(runtime).toContain("exportAbortRef.current === controller");
    expect(runtime).toContain("runtimeAuditBlob(audit, controller.signal)");
    expect(runtime).toContain("detailAbortRef.current?.abort()");
    expect(runtime).toContain("actionDetailAbortRef.current?.abort()");
    expect(runtime).toContain("eventDetailAbortRef.current?.abort()");
    expect(runtime).toContain("controller.signal");
    expect(runtime).toContain("eventPage.loaded ? eventPage.nextCursor");
    expect(runtime).toContain("...(cursor ? { cursor } : { afterSequence })");
    expect(database).toContain("useDatabaseRecords({ api, owner: api");
    expect(databaseRecords).toContain("latest.current.owner === owner && latest.current.api === api");
    expect(databaseRecords).toContain("latest.current.query === query && latest.current.authority === authority");
    expect(databaseRecords).toContain("canRead() && selectedId.current === id && epoch === job.epoch && !controller.signal.aborted");
    expect(databaseRecords).toContain('cancel("detail"); selectedId.current = ""; setDetail({ owner, query, authority, id: "", record: null');
    expect(databaseRecords).toContain("++job.epoch; job.controller?.abort()");
    expect(databaseRecords).toContain("selectedRecord: dataCurrent && detail.query === query && detail.authority === authority ? detail.record : null");
  });
});
