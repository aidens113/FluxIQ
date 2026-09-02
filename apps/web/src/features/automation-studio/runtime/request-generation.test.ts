import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("detail request generation guards", () => {
  it("invalidates late runtime and database detail responses", () => {
    const runtime = readFileSync(new URL("./RunActionLogView.tsx", import.meta.url), "utf8");
    const database = readFileSync(new URL("../../programs/live-views/database-manager.tsx", import.meta.url), "utf8");
    expect(runtime).toContain("requestId !== detailRequestRef.current");
    expect(runtime).toContain("requestId !== actionRequestRef.current");
    expect(runtime).toContain("requestId !== eventRequestRef.current");
    expect(runtime).toContain("requestId !== actionDetailRequestRef.current");
    expect(runtime).toContain("requestId !== eventDetailRequestRef.current");
    expect(runtime.match(/new AbortController\(\)/g)).toHaveLength(5);
    expect(runtime).toContain("detailAbortRef.current?.abort()");
    expect(runtime).toContain("actionDetailAbortRef.current?.abort()");
    expect(runtime).toContain("eventDetailAbortRef.current?.abort()");
    expect(runtime).toContain("controller.signal");
    expect(runtime).toContain("eventPage.loaded ? eventPage.nextCursor");
    expect(runtime).toContain("...(cursor ? { cursor } : { afterSequence })");
    expect(database).toContain("requestId !== detailRequestRef.current");
    expect(database).toContain("setSelectedRecord(null)");
  });
});
