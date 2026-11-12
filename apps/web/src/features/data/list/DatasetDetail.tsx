"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import {
  RUN_DATASET_PAGE_SIZE,
  RunDatasetTable,
  currentProgramDomainId,
  getRunDatasetPage,
  runDatasetDownloadHref,
  type RunDatasetPage
} from "../../automation-studio/datasets";
import type { DatasetRow } from "../model";

type Loaded = { state: "loading" } | { state: "error" } | { state: "gone" } | { state: "ready"; page: RunDatasetPage; rows: Array<Record<string, unknown>>; more: boolean };

/** One table's rows, a page at a time, with its CSV and JSON downloads. Mount it with a key per table. */
export function DatasetDetail(props: { dataset: DatasetRow; onClose(): void }) {
  const { dataset } = props;
  const studio = useProgramTransport("automation-studio");
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [domainId, setDomainId] = useState<string | null>(null);
  const ask = useCallback(
    (cursor: string | null | undefined, signal?: AbortSignal) =>
      getRunDatasetPage(studio, { projectId: dataset.projectId, runId: dataset.runId, datasetId: dataset.datasetId, limit: RUN_DATASET_PAGE_SIZE, ...(cursor ? { cursor } : {}) }, signal),
    [studio, dataset]
  );
  useEffect(() => {
    setDomainId(currentProgramDomainId());
    const controller = new AbortController();
    const first = async () => {
      try {
        const answer = await ask(undefined, controller.signal);
        if (controller.signal.aborted) return;
        const page = answer.ok ? answer.payload?.dataset : undefined;
        if (!answer.ok) setLoaded({ state: "error" });
        else setLoaded(page ? { state: "ready", page, rows: page.rows, more: page.nextCursor !== null } : { state: "gone" });
      } catch {
        if (!controller.signal.aborted) setLoaded({ state: "error" });
      }
    };
    void first();
    return () => controller.abort();
  }, [ask]);
  const loadMore = async () => {
    if (loaded.state !== "ready" || !loaded.page.nextCursor) return;
    setLoadingMore(true);
    try {
      const answer = await ask(loaded.page.nextCursor);
      const next = answer.ok ? answer.payload?.dataset : undefined;
      if (next) setLoaded({ state: "ready", page: next, rows: [...loaded.rows, ...next.rows], more: next.nextCursor !== null });
      else setLoaded({ state: "error" });
    } catch {
      setLoaded({ state: "error" });
    } finally {
      setLoadingMore(false);
    }
  };
  const href = (format: "csv" | "json") => runDatasetDownloadHref({ projectId: dataset.projectId, runId: dataset.runId, datasetId: dataset.datasetId, format, domainId });
  return (
    <section className="data-detail" aria-label={`Rows of ${dataset.name}`}>
      <header className="data-detail-head">
        <h2>{dataset.name}</h2>
        <span className="data-muted">{dataset.flowName} · {dataset.rowCount} rows · <Link className="data-link" href={`/runs/${encodeURIComponent(dataset.runId)}`}>open the run</Link></span>
        <span className="data-actions">
          <a className="data-button" href={href("csv")} download>Export CSV</a>
          <a className="data-button" href={href("json")} download>Export JSON</a>
          <button className="data-button" type="button" onClick={props.onClose}>Close</button>
        </span>
      </header>
      {loaded.state === "loading" ? <p className="data-note" role="status">Loading the rows…</p> : null}
      {loaded.state === "error" ? <p className="data-note data-error" role="alert">Could not read these rows. Try again in a moment.</p> : null}
      {loaded.state === "gone" ? <p className="data-note">This table no longer has rows stored.</p> : null}
      {loaded.state === "ready" ? (
        <RunDatasetTable label={dataset.name} schema={loaded.page.schema} rows={loaded.rows} hasMore={loaded.more} loading={loadingMore} onLoadMore={() => void loadMore()} />
      ) : null}
    </section>
  );
}
